import { createPublicClient, http, type Address, type Hex, parseAbi, type Chain, keccak256, toHex, getAddress } from 'viem';
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

async function getFacilitatorAddress(): Promise<string> {
  const response = await fetch('/api/facilitator/address');
  if (!response.ok) {
    throw new Error('Failed to get facilitator address');
  }
  const data = await response.json();
  return data.address;
}

function generateNonce(): Hex {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return toHex(randomBytes);
}

export async function supplyToAaveGasless(
  privateKey: string,
  chainId: number,
  amountMicroUsdc: bigint,
  userAddress: string
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

    console.log('[Aave Gasless Supply] Starting...');
    console.log('[Aave Gasless Supply] Chain:', chainId, 'Amount:', amountMicroUsdc.toString());

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const facilitatorAddress = await getFacilitatorAddress();

    console.log('[Aave Gasless Supply] Facilitator:', facilitatorAddress);

    const now = Math.floor(Date.now() / 1000);
    const validAfter = 0;
    const validBefore = now + 3600;
    const nonce = generateNonce();

    const domain = {
      name: chainId === 8453 ? 'USD Coin' : 'USDC',
      version: '2',
      chainId: BigInt(chainId),
      verifyingContract: getAddress(network.usdcAddress) as Address,
    };

    const message = {
      from: account.address,
      to: getAddress(facilitatorAddress) as Address,
      value: amountMicroUsdc,
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce as `0x${string}`,
    };

    console.log('[Aave Gasless Supply] Signing EIP-3009 authorization...');

    const signature = await account.signTypedData({
      domain,
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message,
    });

    console.log('[Aave Gasless Supply] Signature created, sending to backend...');

    const response = await fetch('/api/aave/supply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId,
        userAddress: account.address,
        amount: amountMicroUsdc.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
        signature,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Aave Gasless Supply] Backend error:', result);
      return { success: false, error: result.error || result.details || 'Supply failed' };
    }

    console.log('[Aave Gasless Supply] Success! TX:', result.txHash);
    return { success: true, txHash: result.txHash };
  } catch (error) {
    console.error('[Aave Gasless Supply] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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

    const publicClient = createPublicClient({
      chain,
      transport: http(network.rpcUrl),
    });

    const usdcAddress = network.usdcAddress as Address;
    const poolAddress = network.aavePoolAddress as Address;

    console.log('[Aave Withdraw] Checking gas balance...');

    const gasBalance = await publicClient.getBalance({ address: accountAddress });
    const minGasRequired = chainId === 42220 ? BigInt(1e15) : BigInt(1e14);

    if (gasBalance < minGasRequired) {
      console.log('[Aave Withdraw] Insufficient gas, requesting drip...');
      
      const dripResponse = await fetch('/api/gas-drip/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: accountAddress, chainId }),
      });

      if (!dripResponse.ok) {
        const dripResult = await dripResponse.json();
        if (!dripResult.alreadyHasSufficientGas) {
          return { success: false, error: 'Need gas for withdrawal - please try again in a moment' };
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log('[Aave Withdraw] Calling withdraw on Aave Pool...');
    console.log('[Aave Withdraw] Pool address:', poolAddress);
    console.log('[Aave Withdraw] USDC address:', usdcAddress);
    console.log('[Aave Withdraw] Amount:', amountMicroUsdc.toString());

    const { createWalletClient } = await import('viem');
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(network.rpcUrl),
    });

    const withdrawHash = await walletClient.writeContract({
      address: poolAddress,
      abi: AAVE_POOL_ABI,
      functionName: 'withdraw',
      args: [usdcAddress, amountMicroUsdc, accountAddress],
    });

    console.log('[Aave Withdraw] Withdraw tx hash:', withdrawHash);
    const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    console.log('[Aave Withdraw] Withdraw confirmed, status:', withdrawReceipt.status);

    if (withdrawReceipt.status !== 'success') {
      return { success: false, error: 'Withdraw transaction failed' };
    }

    return { success: true, txHash: withdrawHash };
  } catch (error) {
    console.error('[Aave Withdraw] Error:', error);
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

export const supplyToAave = supplyToAaveGasless;

export { parseAmountToMicroUsdc };
