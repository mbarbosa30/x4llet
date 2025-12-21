import { createPublicClient, http, type Address, type Hex, parseAbi, type Chain, keccak256, toHex, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, celo, gnosis, arbitrum } from 'viem/chains';
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
  100: gnosis,
  42161: arbitrum,
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

    // Ensure private key has 0x prefix
    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    
    // Validate private key format (should be 0x + 64 hex chars)
    if (!/^0x[0-9a-fA-F]{64}$/.test(formattedPrivateKey)) {
      console.error('[Aave Gasless Supply] Invalid private key format');
      return { success: false, error: 'Invalid wallet key format' };
    }

    const account = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
    const facilitatorAddress = await getFacilitatorAddress();

    console.log('[Aave Gasless Supply] Facilitator:', facilitatorAddress);

    const now = Math.floor(Date.now() / 1000);
    const validAfter = 0;
    const validBefore = now + 3600;
    const nonce = generateNonce();

    // EIP-712 domain names vary by chain:
    // - Celo: "USDC" (native Circle USDC)
    // - Gnosis: "Bridged USDC (Gnosis)" (USDC.e bridged token)
    // - Base, Arbitrum: "USD Coin" (native Circle USDC)
    const getDomainName = (chain: number): string => {
      if (chain === 42220) return 'USDC';
      if (chain === 100) return 'Bridged USDC (Gnosis)';
      return 'USD Coin';
    };

    const domain = {
      name: getDomainName(chainId),
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
      const backendError = result.error || result.details || 'Supply failed';
      return { success: false, error: getFriendlySupplyError(backendError) };
    }

    console.log('[Aave Gasless Supply] Success! TX:', result.txHash);
    return { success: true, txHash: result.txHash };
  } catch (error) {
    console.error('[Aave Gasless Supply] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: getFriendlySupplyError(errorMessage) };
  }
}

// Helper function to convert technical supply errors to user-friendly messages
function getFriendlySupplyError(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  
  // Preserve known explicit backend messages that are already user-friendly
  const preservePatterns = [
    'aave not supported',
    'unsupported chain',
    'invalid wallet',
    'missing required',
  ];
  for (const pattern of preservePatterns) {
    if (msg.includes(pattern)) {
      return errorMessage; // Return original - it's already clear
    }
  }
  
  // Short, simple messages without hex codes are likely already friendly
  if (errorMessage.length < 80 && !msg.includes('0x') && !msg.includes('error code') && 
      !msg.includes('reverted') && !msg.includes('exception')) {
    return errorMessage;
  }
  
  // Network/connectivity issues (specific patterns only)
  if (msg.includes('fetch failed') || msg.includes('failed to fetch') ||
      msg.includes('econnrefused') || msg.includes('etimedout') || msg.includes('getaddrinfo')) {
    return 'Network connection issue. Please check your internet and try again.';
  }
  
  // Authorization/signature issues
  if (msg.includes('signature') && msg.includes('expired')) {
    return 'The transaction signature expired. Please try again.';
  }
  
  // Reverted transactions with hex data
  if ((msg.includes('reverted') || msg.includes('revert')) && msg.includes('0x')) {
    return 'The deposit could not be completed. Please try again.';
  }
  
  // RPC/backend errors with technical details
  if (msg.includes('internal json-rpc') || msg.includes('rate limit') || msg.includes('502') || msg.includes('503')) {
    return 'The blockchain network is busy. Please try again in a moment.';
  }
  
  // Long technical messages - provide generic friendly message
  if (errorMessage.length > 100) {
    return 'Something went wrong with the deposit. Please try again.';
  }
  
  // Default: return original if reasonably short
  return errorMessage;
}

export async function withdrawFromAave(
  privateKey: string,
  chainId: number,
  amountMicroUsdc: bigint,
  _userAddress: string
): Promise<AaveTransactionResult> {
  try {
    const network = getNetworkByChainId(chainId);
    if (!network || !network.aavePoolAddress || !network.aUsdcAddress) {
      return { success: false, error: 'Aave not supported on this network' };
    }

    const chain = CHAIN_MAP[chainId];
    if (!chain) {
      return { success: false, error: `Unsupported chain ID: ${chainId}` };
    }

    // Ensure private key has 0x prefix
    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    
    // Validate private key format (should be 0x + 64 hex chars)
    if (!/^0x[0-9a-fA-F]{64}$/.test(formattedPrivateKey)) {
      console.error('[Aave Withdraw] Invalid private key format');
      return { success: false, error: 'Invalid wallet key format' };
    }

    const account = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
    const accountAddress = account.address;

    const publicClient = createPublicClient({
      chain,
      transport: http(network.rpcUrl),
    });

    const usdcAddress = network.usdcAddress as Address;
    const poolAddress = network.aavePoolAddress as Address;
    const aUsdcAddress = network.aUsdcAddress as Address;

    // First check the user's actual aUSDC balance
    console.log('[Aave Withdraw] Checking aUSDC balance...');
    const aUsdcBalance = await publicClient.readContract({
      address: aUsdcAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [accountAddress],
    }) as bigint;
    
    console.log('[Aave Withdraw] aUSDC balance:', aUsdcBalance.toString());
    console.log('[Aave Withdraw] Requested amount:', amountMicroUsdc.toString());
    
    if (aUsdcBalance === 0n) {
      return { success: false, error: 'No aUSDC balance to withdraw' };
    }
    
    // Check if user wants to withdraw full balance (within 1% tolerance for rounding)
    const isFullWithdraw = amountMicroUsdc >= (aUsdcBalance * 99n / 100n);
    
    // For full withdrawals, use the actual aUSDC balance to avoid rounding issues
    // For partial withdrawals, use the exact requested amount
    let withdrawAmount: bigint;
    if (isFullWithdraw) {
      // Use actual balance for full withdrawal
      withdrawAmount = aUsdcBalance;
      console.log('[Aave Withdraw] Full withdrawal detected, using actual balance:', withdrawAmount.toString());
    } else if (amountMicroUsdc > aUsdcBalance) {
      const balanceFormatted = (Number(aUsdcBalance) / 1e6).toFixed(2);
      const requestedFormatted = (Number(amountMicroUsdc) / 1e6).toFixed(2);
      return { 
        success: false, 
        error: `Insufficient balance. You have $${balanceFormatted} but requested $${requestedFormatted}` 
      };
    } else {
      withdrawAmount = amountMicroUsdc;
      console.log('[Aave Withdraw] Partial withdrawal:', withdrawAmount.toString());
    }
    
    console.log('[Aave Withdraw] Is full withdraw:', isFullWithdraw);
    console.log('[Aave Withdraw] Final withdraw amount:', withdrawAmount.toString());

    console.log('[Aave Withdraw] Checking gas balance...');

    const gasBalance = await publicClient.getBalance({ address: accountAddress });
    // Aave operations need ~250k gas, at 30 gwei = 0.0075 CELO, use 0.01 threshold
    const minGasRequired = chainId === 42220 ? BigInt(1e16) : BigInt(1e14);

    console.log('[Aave Withdraw] Gas balance:', gasBalance.toString(), 'Required:', minGasRequired.toString());

    if (gasBalance < minGasRequired) {
      console.log('[Aave Withdraw] Insufficient gas, requesting drip...');
      
      try {
        const dripResponse = await fetch('/api/gas-drip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: accountAddress, chainId }),
        });

        let dripResult;
        try {
          dripResult = await dripResponse.json();
        } catch (parseError) {
          console.error('[Aave Withdraw] Failed to parse drip response:', parseError);
          return { success: false, error: 'Gas drip service unavailable - please try again later' };
        }

        console.log('[Aave Withdraw] Drip response:', dripResult, 'Status:', dripResponse.status);

        if (!dripResponse.ok) {
          if (dripResponse.status === 429) {
            const nextDrip = dripResult.nextDripAvailable ? new Date(dripResult.nextDripAvailable) : null;
            const hoursRemaining = nextDrip ? Math.max(1, Math.ceil((nextDrip.getTime() - Date.now()) / (1000 * 60 * 60))) : 24;
            return { success: false, error: `Gas request limit reached. Try again in ${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''}.` };
          }
          if (dripResponse.status === 503) {
            return { success: false, error: 'Gas service temporarily unavailable. Please try again in a few minutes.' };
          }
          if (dripResult.alreadyHasGas) {
            console.log('[Aave Withdraw] User already has sufficient gas, proceeding...');
          } else {
            return { success: false, error: dripResult.error || 'Unable to provide gas at this time. Please try again.' };
          }
        } else {
          if (dripResult.alreadyHasGas) {
            console.log('[Aave Withdraw] User already has sufficient gas');
          } else {
            console.log('[Aave Withdraw] Gas drip sent:', dripResult.txHash);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const newGasBalance = await publicClient.getBalance({ address: accountAddress });
            console.log('[Aave Withdraw] New gas balance after drip:', newGasBalance.toString());
            
            if (newGasBalance < minGasRequired) {
              return { success: false, error: 'Gas is being sent to your wallet. Please try again in a few seconds.' };
            }
          }
        }
      } catch (dripError) {
        console.error('[Aave Withdraw] Gas drip request failed:', dripError);
        return { success: false, error: 'Gas service unavailable. Please try again shortly.' };
      }
    }

    console.log('[Aave Withdraw] Calling withdraw on Aave Pool...');
    console.log('[Aave Withdraw] Pool address:', poolAddress);
    console.log('[Aave Withdraw] USDC address:', usdcAddress);
    console.log('[Aave Withdraw] aUSDC address:', aUsdcAddress);
    console.log('[Aave Withdraw] Withdraw amount:', withdrawAmount.toString());
    
    // Use the actual aUSDC balance for withdrawals, NOT micro-USDC amount
    // Aave's withdraw function expects the aToken amount, which may differ from underlying due to interest
    const amountToWithdraw = withdrawAmount;
    console.log('[Aave Withdraw] Using amount:', amountToWithdraw.toString());

    const { createWalletClient } = await import('viem');
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(network.rpcUrl),
    });

    // Celo's forno RPC has simulation issues - skip simulation and use explicit gas limit
    // Base RPC is more reliable so we can still simulate there
    let withdrawHash: `0x${string}`;
    
    if (chainId === 42220) {
      // Celo: Skip simulation, use explicit gas limit
      // Aave withdrawals typically use 150-200k gas, using 250k for safety margin
      console.log('[Aave Withdraw] Celo chain - using direct write with explicit gas limit...');
      withdrawHash = await walletClient.writeContract({
        address: poolAddress,
        abi: AAVE_POOL_ABI,
        functionName: 'withdraw',
        args: [usdcAddress, amountToWithdraw, accountAddress],
        gas: 250000n, // 250k gas - typical Aave withdraw uses ~180k
      });
    } else {
      // Other chains: Simulate first for better error messages
      console.log('[Aave Withdraw] Simulating transaction...');
      const { request } = await publicClient.simulateContract({
        address: poolAddress,
        abi: AAVE_POOL_ABI,
        functionName: 'withdraw',
        args: [usdcAddress, amountToWithdraw, accountAddress],
        account: account,
      });
      console.log('[Aave Withdraw] Simulation successful, proceeding with transaction...');
      withdrawHash = await walletClient.writeContract(request);
    }

    console.log('[Aave Withdraw] Withdraw tx hash:', withdrawHash);
    const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    console.log('[Aave Withdraw] Withdraw confirmed, status:', withdrawReceipt.status);

    if (withdrawReceipt.status !== 'success') {
      return { success: false, error: 'Withdraw transaction failed on-chain' };
    }

    return { success: true, txHash: withdrawHash };
  } catch (error: unknown) {
    // Extract viem error properties - viem errors have special structure
    const viemError = error as { 
      shortMessage?: string; 
      details?: string; 
      cause?: { shortMessage?: string; details?: string; message?: string };
      message?: string;
      name?: string;
    };
    
    // Log all available error information for debugging
    console.error('[Aave Withdraw] Error name:', viemError.name);
    console.error('[Aave Withdraw] Error message:', viemError.message);
    console.error('[Aave Withdraw] Short message:', viemError.shortMessage);
    console.error('[Aave Withdraw] Details:', viemError.details);
    console.error('[Aave Withdraw] Cause:', viemError.cause);
    
    // Build comprehensive error string for matching
    const errorParts = [
      viemError.shortMessage,
      viemError.details,
      viemError.message,
      viemError.cause?.shortMessage,
      viemError.cause?.details,
      viemError.cause?.message,
    ].filter(Boolean);
    
    const errorMessage = errorParts.join(' | ') || 'Unknown error';
    console.error('[Aave Withdraw] Combined error:', errorMessage);
    
    // Convert technical errors to user-friendly messages
    const friendlyError = getFriendlyWithdrawError(errorMessage);
    return { success: false, error: friendlyError };
  }
}

// Helper function to convert technical blockchain errors to user-friendly messages
function getFriendlyWithdrawError(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  
  // Preserve known explicit backend messages that are already user-friendly
  const preservePatterns = [
    'aave not supported',
    'unsupported chain',
    'invalid wallet',
    'no ausdc balance',
    'gas drip',
    'gas request limit',
    'gas service',
  ];
  for (const pattern of preservePatterns) {
    if (msg.includes(pattern)) {
      return errorMessage; // Return original - it's already clear
    }
  }
  
  // Short, simple messages without hex codes are likely already friendly
  if (errorMessage.length < 80 && !msg.includes('0x') && !msg.includes('error code') && 
      !msg.includes('reverted') && !msg.includes('exception')) {
    return errorMessage;
  }
  
  // User cancelled
  if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('user cancelled')) {
    return 'Transaction cancelled';
  }
  
  // Gas/funding issues
  if (msg.includes('insufficient funds') || msg.includes('insufficient balance for gas')) {
    return 'Insufficient gas for this transaction. Please wait a moment and try again.';
  }
  
  // Nonce issues
  if (msg.includes('nonce')) {
    return 'Transaction conflict detected. Please wait a moment and try again.';
  }
  
  // Network/connectivity issues (specific patterns only - not generic "network")
  if (msg.includes('fetch failed') || msg.includes('failed to fetch') ||
      msg.includes('econnrefused') || msg.includes('etimedout') ||
      msg.includes('getaddrinfo') || msg.includes('socket hang up')) {
    return 'Network connection issue. Please check your internet and try again.';
  }
  
  // RPC specific errors
  if (msg.includes('internal json-rpc') || msg.includes('rpc error') || msg.includes('rate limit') ||
      msg.includes('too many requests') || msg.includes('503') || msg.includes('502')) {
    return 'The blockchain network is busy. Please try again in a few moments.';
  }
  
  // Aave-specific revert reasons
  if (msg.includes('execution reverted') || msg.includes('reverted')) {
    if (msg.includes('insufficient_balance') || msg.includes('not enough balance')) {
      return 'Your savings balance is lower than expected. Please refresh and try again.';
    }
    if (msg.includes('not_enough_available_user_balance')) {
      return 'Insufficient available balance. Some funds may be temporarily locked.';
    }
    if (msg.includes('health_factor') || msg.includes('liquidation')) {
      return 'Cannot withdraw this amount - it would put your account at risk.';
    }
    if (msg.includes('not_enough_liquidity')) {
      return 'The pool has low liquidity right now. Try withdrawing a smaller amount.';
    }
    if (msg.includes('invalid_amount') || msg.includes('0x32') || msg.includes('error code 32')) {
      return 'Invalid amount. Please try a different withdrawal amount.';
    }
    if (msg.includes('paused')) {
      return 'Withdrawals are temporarily paused. Please try again later.';
    }
    // Generic revert - don't expose technical details
    return 'The withdrawal could not be completed. Please try again or contact support if the issue persists.';
  }
  
  // Contract call failures
  if (msg.includes('call exception') || msg.includes('contract call')) {
    return 'Unable to complete the transaction. Please try again.';
  }
  
  // Gas estimation failures
  if (msg.includes('gas required exceeds') || msg.includes('out of gas') || msg.includes('gas estimation')) {
    return 'Transaction requires too much gas. Please try a smaller amount.';
  }
  
  // Default: generic user-friendly message (no technical details)
  console.error('[Aave Withdraw] Unhandled error, returning generic message. Original:', errorMessage);
  return 'Something went wrong with the withdrawal. Please try again in a few moments.';
}

export const supplyToAave = supplyToAaveGasless;

export { parseAmountToMicroUsdc };
