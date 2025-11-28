import { createWalletClient, createPublicClient, http, type Address, parseAbi, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, celo } from 'viem/chains';
import { getNetworkByChainId } from '@shared/networks';

const AAVE_POOL_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
]);

const CHAIN_MAP: Record<number, Chain> = {
  8453: base,
  42220: celo,
};

export interface AaveTransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

function parseAmountToMicroUsdc(amount: string): bigint {
  const parts = amount.split('.');
  const wholePart = parts[0] || '0';
  let decimalPart = parts[1] || '';
  
  decimalPart = decimalPart.padEnd(6, '0').slice(0, 6);
  
  const microUsdcString = wholePart + decimalPart;
  return BigInt(microUsdcString);
}

export async function supplyToAave(
  privateKey: string,
  chainId: number,
  amountMicroUsdc: bigint,
  _userAddress: string
): Promise<AaveTransactionResult> {
  try {
    const network = getNetworkByChainId(chainId);
    if (!network || !network.aavePoolAddress) {
      return { success: false, error: 'Aave not supported on this network' };
    }

    const chain = CHAIN_MAP[chainId];
    if (!chain) {
      return { success: false, error: `Unsupported chain ID: ${chainId}` };
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const accountAddress = account.address;

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(network.rpcUrl),
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(network.rpcUrl),
    });

    const usdcAddress = network.usdcAddress as Address;
    const poolAddress = network.aavePoolAddress as Address;

    const currentAllowance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [accountAddress, poolAddress],
    });

    if (currentAllowance < amountMicroUsdc) {
      console.log('Approving USDC for Aave Pool...');
      
      const approveHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [poolAddress, amountMicroUsdc],
      });

      console.log('Approval tx hash:', approveHash);
      const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log('Approval confirmed, status:', approvalReceipt.status);
      
      if (approvalReceipt.status !== 'success') {
        return { success: false, error: 'Approval transaction failed' };
      }
    }

    console.log('Supplying to Aave Pool...');
    console.log('Pool address:', poolAddress);
    console.log('USDC address:', usdcAddress);
    console.log('Amount:', amountMicroUsdc.toString());
    console.log('Account:', accountAddress);

    const supplyHash = await walletClient.writeContract({
      address: poolAddress,
      abi: AAVE_POOL_ABI,
      functionName: 'supply',
      args: [usdcAddress, amountMicroUsdc, accountAddress, 0],
    });

    console.log('Supply tx hash:', supplyHash);
    const supplyReceipt = await publicClient.waitForTransactionReceipt({ hash: supplyHash });
    console.log('Supply confirmed, status:', supplyReceipt.status);

    if (supplyReceipt.status !== 'success') {
      return { success: false, error: 'Supply transaction failed' };
    }

    return { success: true, txHash: supplyHash };
  } catch (error) {
    console.error('Aave supply error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('insufficient funds')) {
      return { success: false, error: 'Insufficient gas for transaction' };
    }
    if (errorMessage.includes('execution reverted')) {
      return { success: false, error: 'Transaction reverted - check USDC balance and approval' };
    }
    
    return { success: false, error: errorMessage };
  }
}

export async function withdrawFromAave(
  privateKey: string,
  chainId: number,
  amountMicroUsdc: bigint,
  _userAddress: string
): Promise<AaveTransactionResult> {
  try {
    const network = getNetworkByChainId(chainId);
    if (!network || !network.aavePoolAddress) {
      return { success: false, error: 'Aave not supported on this network' };
    }

    const chain = CHAIN_MAP[chainId];
    if (!chain) {
      return { success: false, error: `Unsupported chain ID: ${chainId}` };
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const accountAddress = account.address;

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(network.rpcUrl),
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(network.rpcUrl),
    });

    const usdcAddress = network.usdcAddress as Address;
    const poolAddress = network.aavePoolAddress as Address;

    console.log('Withdrawing from Aave Pool...');
    console.log('Pool address:', poolAddress);
    console.log('USDC address:', usdcAddress);
    console.log('Amount:', amountMicroUsdc.toString());
    console.log('Account:', accountAddress);

    const withdrawHash = await walletClient.writeContract({
      address: poolAddress,
      abi: AAVE_POOL_ABI,
      functionName: 'withdraw',
      args: [usdcAddress, amountMicroUsdc, accountAddress],
    });

    console.log('Withdraw tx hash:', withdrawHash);
    const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    console.log('Withdraw confirmed, status:', withdrawReceipt.status);

    if (withdrawReceipt.status !== 'success') {
      return { success: false, error: 'Withdraw transaction failed' };
    }

    return { success: true, txHash: withdrawHash };
  } catch (error) {
    console.error('Aave withdraw error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('insufficient funds')) {
      return { success: false, error: 'Insufficient gas for transaction' };
    }
    if (errorMessage.includes('execution reverted')) {
      return { success: false, error: 'Transaction reverted - check aUSDC balance' };
    }
    
    return { success: false, error: errorMessage };
  }
}

export { parseAmountToMicroUsdc };
