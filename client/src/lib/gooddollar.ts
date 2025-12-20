import { createPublicClient, http, fallback, type Address } from 'viem';
import { celo } from 'viem/chains';

export const GOODDOLLAR_CONTRACTS = {
  identity: {
    celo: '0xC361A6E67822a0EDc17D899227dd9FC50BD62F42' as Address,
  },
  ubi: {
    celo: '0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1' as Address,
  },
  token: {
    celo: '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A' as Address,
  }
} as const;

export const SENADOR_TOKEN = {
  address: '0xc48d80f75bef8723226dcac5e61304df7277d2a2' as Address,
  decimals: 18,
  symbol: 'SENADOR',
} as const;

const IDENTITY_ABI = [
  {
    name: 'isWhitelisted',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'getWhitelistedRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'whitelisted', type: 'address' }],
  },
  {
    name: 'lastAuthenticated',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'authenticationPeriod',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const UBI_SCHEME_ABI = [
  {
    name: 'checkEntitlement',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'checkEntitlement',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'currentDay',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'periodStart',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'dailyUbi',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'lastClaimed',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'activeUsersCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

// Celo RPC endpoints with fallback
const CELO_RPCS = [
  'https://forno.celo.org',
  'https://1rpc.io/celo',
  'https://celo.drpc.org',
  'https://rpc.ankr.com/celo',
];

const celoClient = createPublicClient({
  chain: celo,
  transport: fallback(CELO_RPCS.map(url => http(url))),
});

function getCeloClient() {
  return celoClient;
}

export interface IdentityStatus {
  isWhitelisted: boolean;
  whitelistedRoot: Address | null;
  lastAuthenticated: Date | null;
  authenticationPeriod: number;
  expiresAt: Date | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

export interface ClaimStatus {
  canClaim: boolean;
  entitlement: bigint;
  entitlementFormatted: string;
  lastClaimedDay: number;
  currentDay: number;
  dailyUbi: bigint;
  dailyUbiFormatted: string;
  activeUsers: number | null;
  nextClaimTime: Date | null;
  dailyPool: bigint | null;
  dailyPoolFormatted: string | null;
  daysSinceLastClaim: number | null;
  hasActiveStreak: boolean;
}

export interface GoodDollarBalance {
  balance: bigint;
  balanceFormatted: string;
  decimals: number;
}

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[GoodDollar] Attempt ${attempt} failed, retrying in ${delay}ms...`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function getIdentityStatus(address: Address): Promise<IdentityStatus> {
  const client = getCeloClient();
  
  console.log('[GoodDollar] Checking identity status for:', address);
  
  try {
    const [isWhitelisted, whitelistedRoot, lastAuthenticatedBigInt, authPeriodBigInt] = await withRetry(() => Promise.all([
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.identity.celo,
        abi: IDENTITY_ABI,
        functionName: 'isWhitelisted',
        args: [address],
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.identity.celo,
        abi: IDENTITY_ABI,
        functionName: 'getWhitelistedRoot',
        args: [address],
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.identity.celo,
        abi: IDENTITY_ABI,
        functionName: 'lastAuthenticated',
        args: [address],
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.identity.celo,
        abi: IDENTITY_ABI,
        functionName: 'authenticationPeriod',
      }),
    ]));
    
    console.log('[GoodDollar] Identity contract responses:', {
      isWhitelisted,
      whitelistedRoot,
      lastAuthenticated: lastAuthenticatedBigInt.toString(),
      authPeriod: authPeriodBigInt.toString(),
    });

    const authPeriodDays = Number(authPeriodBigInt);
    const lastAuthSeconds = Number(lastAuthenticatedBigInt);
    const lastAuthenticated = lastAuthSeconds > 0 ? new Date(lastAuthSeconds * 1000) : null;
    
    let expiresAt: Date | null = null;
    let isExpired = false;
    let daysUntilExpiry: number | null = null;

    if (lastAuthenticated && authPeriodDays > 0) {
      expiresAt = new Date(lastAuthenticated.getTime() + authPeriodDays * 24 * 60 * 60 * 1000);
      isExpired = new Date() > expiresAt;
      daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      if (daysUntilExpiry < 0) daysUntilExpiry = 0;
    }

    const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;
    
    return {
      isWhitelisted,
      whitelistedRoot: whitelistedRoot !== zeroAddress ? whitelistedRoot : null,
      lastAuthenticated,
      authenticationPeriod: authPeriodDays,
      expiresAt,
      isExpired,
      daysUntilExpiry,
    };
  } catch (error) {
    console.error('Error fetching identity status:', error);
    return {
      isWhitelisted: false,
      whitelistedRoot: null,
      lastAuthenticated: null,
      authenticationPeriod: 0,
      expiresAt: null,
      isExpired: true,
      daysUntilExpiry: null,
    };
  }
}

export async function getClaimStatus(address: Address): Promise<ClaimStatus> {
  const client = getCeloClient();
  
  console.log('[GoodDollar] Checking claim status for:', address);
  
  try {
    // Fetch UBI scheme data and token decimals in parallel with retry
    const [entitlement, currentDay, dailyUbi, lastClaimedTimestamp, periodStart, tokenDecimals] = await withRetry(() => Promise.all([
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.ubi.celo,
        abi: UBI_SCHEME_ABI,
        functionName: 'checkEntitlement',
        args: [address],
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.ubi.celo,
        abi: UBI_SCHEME_ABI,
        functionName: 'currentDay',
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.ubi.celo,
        abi: UBI_SCHEME_ABI,
        functionName: 'dailyUbi',
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.ubi.celo,
        abi: UBI_SCHEME_ABI,
        functionName: 'lastClaimed',
        args: [address],
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.ubi.celo,
        abi: UBI_SCHEME_ABI,
        functionName: 'periodStart',
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.token.celo,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]));
    
    // lastClaimed returns a Unix timestamp (seconds) - convert to day number using periodStart
    // Formula: day = (timestamp - periodStart) / 86400
    const periodStartNum = Number(periodStart);
    const lastClaimedTs = Number(lastClaimedTimestamp);
    const lastClaimedDay = lastClaimedTs > 0 ? Math.floor((lastClaimedTs - periodStartNum) / 86400) : 0;
    
    console.log('[GoodDollar] Claim status contract responses:', {
      entitlement: entitlement.toString(),
      currentDay: currentDay.toString(),
      dailyUbi: dailyUbi.toString(),
      lastClaimedTimestamp: lastClaimedTimestamp.toString(),
      periodStart: periodStart.toString(),
      lastClaimedDay,
      canClaim: entitlement > 0n,
      tokenDecimals,
    });

    let activeUsers: number | null = null;
    try {
      const activeUsersResult = await client.readContract({
        address: GOODDOLLAR_CONTRACTS.ubi.celo,
        abi: UBI_SCHEME_ABI,
        functionName: 'activeUsersCount',
      });
      activeUsers = Number(activeUsersResult);
    } catch (e) {
      console.warn('Could not fetch activeUsersCount (optional):', e);
      activeUsers = null;
    }

    const canClaim = entitlement > 0n;
    
    let nextClaimTime: Date | null = null;
    if (!canClaim) {
      const now = new Date();
      nextClaimTime = new Date(now);
      nextClaimTime.setUTCHours(12, 0, 0, 0);
      if (nextClaimTime <= now) {
        nextClaimTime.setDate(nextClaimTime.getDate() + 1);
      }
    }

    // Calculate daily pool (total distributed to all claimers)
    // Return null if activeUsers is unavailable to avoid showing misleading data
    const dailyPool = activeUsers !== null && activeUsers > 0 ? dailyUbi * BigInt(activeUsers) : null;
    
    // Calculate days since last claim and streak status
    const currentDayNum = Number(currentDay);
    const lastClaimedDayNum = Number(lastClaimedDay);
    // Guard against negative values (e.g., clock drift or edge cases)
    const daysSinceLastClaim = lastClaimedDayNum > 0 ? Math.max(0, currentDayNum - lastClaimedDayNum) : null;
    // User has active streak if they claimed today or yesterday
    const hasActiveStreak = daysSinceLastClaim !== null && daysSinceLastClaim <= 1;

    return {
      canClaim,
      entitlement,
      entitlementFormatted: formatGoodDollar(entitlement, tokenDecimals),
      lastClaimedDay: lastClaimedDayNum,
      currentDay: currentDayNum,
      dailyUbi,
      dailyUbiFormatted: formatGoodDollar(dailyUbi, tokenDecimals),
      activeUsers,
      nextClaimTime,
      dailyPool,
      dailyPoolFormatted: dailyPool !== null ? formatGoodDollar(dailyPool, tokenDecimals) : null,
      daysSinceLastClaim,
      hasActiveStreak,
    };
  } catch (error) {
    console.error('Error fetching claim status:', error);
    return {
      canClaim: false,
      entitlement: 0n,
      entitlementFormatted: '0.00',
      lastClaimedDay: 0,
      currentDay: 0,
      dailyUbi: 0n,
      dailyUbiFormatted: '0.00',
      activeUsers: null,
      nextClaimTime: null,
      dailyPool: null,
      dailyPoolFormatted: null,
      daysSinceLastClaim: null,
      hasActiveStreak: false,
    };
  }
}

export interface GoodDollarPrice {
  priceUSD: number;
  lastUpdated: Date;
}

export async function getGoodDollarPrice(): Promise<GoodDollarPrice> {
  try {
    // Use CoinGecko API for G$ price (GoodDollar token on Celo)
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=gooddollar&vs_currencies=usd',
      { 
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch G$ price');
    }
    
    const data = await response.json();
    const priceUSD = data?.gooddollar?.usd || 0;
    
    return {
      priceUSD,
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.error('Error fetching G$ price:', error);
    return {
      priceUSD: 0,
      lastUpdated: new Date(),
    };
  }
}

export async function getGoodDollarBalance(address: Address): Promise<GoodDollarBalance> {
  const client = getCeloClient();
  
  console.log('[GoodDollar] Checking G$ balance for:', address);
  
  try {
    const [balance, decimals] = await Promise.all([
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.token.celo,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.token.celo,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);
    
    console.log('[GoodDollar] G$ balance result:', {
      balance: balance.toString(),
      decimals,
      formatted: formatGoodDollar(balance, decimals),
    });

    return {
      balance,
      balanceFormatted: formatGoodDollar(balance, decimals),
      decimals,
    };
  } catch (error) {
    console.error('Error fetching G$ balance:', error);
    return {
      balance: 0n,
      balanceFormatted: '0.00',
      decimals: 2,
    };
  }
}

// G$ token uses 2 decimals for display (like USD cents)
const G_DOLLAR_DISPLAY_DECIMALS = 2;

export function formatGoodDollar(amount: bigint, tokenDecimals: number = 2): string {
  if (amount === 0n) return '0.00';
  
  // Use BigInt exponentiation to avoid Number precision loss for large decimals (e.g., 18)
  const divisor = 10n ** BigInt(tokenDecimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  // Convert fractional part to display decimals (always show 2 decimal places)
  let fractionalStr = fractionalPart.toString().padStart(tokenDecimals, '0');
  // Take first 2 digits for display (truncate extra precision)
  fractionalStr = fractionalStr.slice(0, G_DOLLAR_DISPLAY_DECIMALS).padEnd(G_DOLLAR_DISPLAY_DECIMALS, '0');
  
  return `${wholePart.toLocaleString()}.${fractionalStr}`;
}

export interface FVResult {
  isVerified: boolean;
  reason?: string;
}

// GoodDollar SDK constants - aligned with @goodsdks/citizen-sdk
// See: https://github.com/GoodDollar/GoodSDKs/blob/main/packages/citizen-sdk/src/constants.ts
const GOODDOLLAR_IDENTITY_URL = 'https://goodid.gooddollar.org';

// This is FV_IDENTIFIER_MSG2 from the GoodDollar SDK
const FV_IDENTIFIER_MSG = `Sign this message to request verifying your account <account> and to create your own secret unique identifier for your anonymized record.
You can use this identifier in the future to delete this anonymized record.
WARNING: do not sign this message unless you trust the website/application requesting this signature.`;

export interface GenerateFVLinkParams {
  address: Address;
  signMessage: (message: string) => Promise<string>;
  callbackUrl?: string;
  popupMode?: boolean;
  chainId?: number;
}

/**
 * Generate a Face Verification Link following the GoodDollar SDK pattern.
 * This matches the IdentitySDK.generateFVLink() implementation.
 * See: https://github.com/GoodDollar/GoodSDKs/blob/main/packages/citizen-sdk/src/sdks/viem-identity-sdk.ts
 */
export async function generateFVLink(params: GenerateFVLinkParams): Promise<string> {
  const {
    address,
    signMessage,
    callbackUrl,
    popupMode = false,
    chainId = 42220, // Default to Celo
  } = params;

  if (!popupMode && !callbackUrl) {
    throw new Error('Callback URL is required for redirect mode');
  }

  const nonce = Math.floor(Date.now() / 1000).toString();
  
  // Sign the FV identifier message (SDK only uses this one signature)
  const fvSigMessage = FV_IDENTIFIER_MSG.replace('<account>', address);
  const fvSig = await signMessage(fvSigMessage);

  // Build params matching SDK's generateFVLink
  const fvParams: Record<string, string | number> = {
    account: address,
    nonce,
    fvsig: fvSig,
    chain: chainId,
  };

  if (callbackUrl) {
    fvParams[popupMode ? 'cbu' : 'rdu'] = callbackUrl;
  }

  const { compressToEncodedURIComponent } = await import('./lz-string-mini');
  const compressed = compressToEncodedURIComponent(JSON.stringify(fvParams));
  
  return `${GOODDOLLAR_IDENTITY_URL}?lz=${compressed}`;
}

export function getGoodWalletSignupUrl(address: Address): string {
  return `https://wallet.gooddollar.org/?inviteCode=${address}`;
}

export function parseFVCallback(): FVResult | null {
  const params = new URLSearchParams(window.location.search);
  
  const isVerified = params.get('isVerified');
  const verified = params.get('verified');
  const success = params.get('success');
  
  const reason = params.get('reason') || params.get('error') || params.get('err');
  
  const verifiedValue = isVerified || verified || success;
  
  if (verifiedValue !== null) {
    return {
      isVerified: verifiedValue === 'true' || verifiedValue === '1',
      reason: reason || undefined,
    };
  }
  return null;
}

export function getClaimTransaction(address: Address) {
  return {
    to: GOODDOLLAR_CONTRACTS.ubi.celo,
    data: '0x4e71d92d' as `0x${string}`,
    chainId: 42220,
  };
}

const CELO_GAS_THRESHOLD = BigInt('10000000000000000'); // 0.01 CELO

export interface ClaimResult {
  success: boolean;
  txHash?: string;
  amountClaimed?: string;
  error?: string;
  gasDripTxHash?: string;
}

export async function getCeloBalance(address: Address): Promise<bigint> {
  const client = getCeloClient();
  
  // Retry up to 3 times with small delays to handle transient RPC failures
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const balance = await client.getBalance({ address });
      console.log(`[GoodDollar] CELO balance fetch attempt ${attempt}: ${balance.toString()}`);
      return balance;
    } catch (error) {
      console.error(`[GoodDollar] CELO balance fetch attempt ${attempt} failed:`, error);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  
  console.error('[GoodDollar] All CELO balance fetch attempts failed');
  return 0n;
}

export async function requestCeloGasDrip(address: Address): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const response = await fetch('/api/gas-drip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, chainId: 42220 }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to get gas' };
    }
    
    if (data.alreadyHasGas) {
      return { success: true };
    }
    
    return { success: true, txHash: data.txHash };
  } catch (error) {
    console.error('Error requesting CELO gas drip:', error);
    return { success: false, error: 'Network error' };
  }
}

export async function claimGoodDollar(
  address: Address,
  signTransaction: (tx: { to: Address; data: `0x${string}` }) => Promise<`0x${string}`>,
  sendRawTransaction: (signedTx: `0x${string}`) => Promise<`0x${string}`>
): Promise<ClaimResult> {
  const client = getCeloClient();
  
  try {
    // Step 1: Check CELO balance for gas
    const celoBalance = await getCeloBalance(address);
    let gasDripTxHash: string | undefined;
    
    if (celoBalance < CELO_GAS_THRESHOLD) {
      console.log('[GoodDollar] Low CELO balance, requesting gas drip...');
      const dripResult = await requestCeloGasDrip(address);
      
      if (!dripResult.success) {
        return { success: false, error: dripResult.error || 'Failed to get gas for claim' };
      }
      
      gasDripTxHash = dripResult.txHash;
      
      // Wait a bit for the drip transaction to be confirmed
      if (gasDripTxHash) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Step 2: Check entitlement and get token decimals
    const [entitlement, tokenDecimals] = await Promise.all([
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.ubi.celo,
        abi: UBI_SCHEME_ABI,
        functionName: 'checkEntitlement',
        args: [address],
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.token.celo,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);
    
    if (entitlement === 0n) {
      return { success: false, error: 'No G$ available to claim yet' };
    }
    
    // Step 3: Sign and send the claim transaction
    const claimTx = getClaimTransaction(address);
    const signedTx = await signTransaction({
      to: claimTx.to,
      data: claimTx.data,
    });
    
    const txHash = await sendRawTransaction(signedTx);
    
    // Step 4: Wait for confirmation
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    
    if (receipt.status === 'success') {
      return {
        success: true,
        txHash,
        amountClaimed: formatGoodDollar(entitlement, tokenDecimals),
        gasDripTxHash,
      };
    } else {
      return { success: false, error: 'Transaction failed', txHash };
    }
  } catch (error: any) {
    console.error('[GoodDollar] Claim error:', error);
    return { success: false, error: error.message || 'Failed to claim G$' };
  }
}

export async function claimGoodDollarWithWallet(
  address: Address,
  privateKey: `0x${string}`
): Promise<ClaimResult> {
  const { createWalletClient, http } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { celo } = await import('viem/chains');
  
  const account = privateKeyToAccount(privateKey);
  const client = getCeloClient();
  
  try {
    // Step 1: Check CELO balance for gas
    let celoBalance = await getCeloBalance(address);
    let gasDripTxHash: string | undefined;
    
    if (celoBalance < CELO_GAS_THRESHOLD) {
      console.log('[GoodDollar] Low CELO balance:', celoBalance.toString(), 'requesting gas drip...');
      const dripResult = await requestCeloGasDrip(address);
      
      if (!dripResult.success) {
        return { success: false, error: dripResult.error || 'Failed to get gas for claim' };
      }
      
      // If we got a txHash, wait for the drip transaction to be confirmed
      if (dripResult.txHash) {
        gasDripTxHash = dripResult.txHash;
        console.log('[GoodDollar] Waiting for gas drip confirmation:', gasDripTxHash);
        
        try {
          await client.waitForTransactionReceipt({ 
            hash: gasDripTxHash as `0x${string}`,
            timeout: 30_000,
          });
          console.log('[GoodDollar] Gas drip confirmed');
        } catch (e) {
          console.error('[GoodDollar] Failed to confirm gas drip:', e);
          return { success: false, error: 'Gas drip failed to confirm. Please try again.' };
        }
        
        // Verify we now have enough gas
        celoBalance = await getCeloBalance(address);
        console.log('[GoodDollar] CELO balance after drip:', celoBalance.toString());
        
        if (celoBalance < CELO_GAS_THRESHOLD) {
          return { success: false, error: 'Insufficient gas after drip. Please try again later.' };
        }
      } else if (!dripResult.success) {
        // Drip request failed without a txHash
        return { success: false, error: dripResult.error || 'Failed to get gas for claim' };
      }
      // If alreadyHasGas is true but no txHash, we can proceed (user already had enough)
    }
    
    // Step 2: Check entitlement and get token decimals
    const [entitlement, tokenDecimals] = await Promise.all([
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.ubi.celo,
        abi: UBI_SCHEME_ABI,
        functionName: 'checkEntitlement',
        args: [address],
      }),
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.token.celo,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);
    
    if (entitlement === 0n) {
      return { success: false, error: 'No G$ available to claim yet' };
    }
    
    console.log('[GoodDollar] Entitlement:', formatGoodDollar(entitlement, tokenDecimals), 'G$');
    
    // Step 3: Create wallet client and send claim transaction (with fallback RPCs)
    const { fallback: fb } = await import('viem');
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: fb(CELO_RPCS.map(url => http(url))),
    });
    
    // Estimate gas first to ensure transaction will succeed
    const gasEstimate = await client.estimateContractGas({
      address: GOODDOLLAR_CONTRACTS.ubi.celo,
      abi: UBI_SCHEME_ABI,
      functionName: 'claim',
      account: address,
    });
    
    console.log('[GoodDollar] Gas estimate:', gasEstimate.toString());
    
    const txHash = await walletClient.writeContract({
      address: GOODDOLLAR_CONTRACTS.ubi.celo,
      abi: UBI_SCHEME_ABI,
      functionName: 'claim',
      gas: gasEstimate + (gasEstimate / 10n), // Add 10% buffer
    });
    
    console.log('[GoodDollar] Claim transaction submitted:', txHash);
    
    // Step 4: Wait for confirmation
    const receipt = await client.waitForTransactionReceipt({ 
      hash: txHash,
      timeout: 60_000,
    });
    
    if (receipt.status === 'success') {
      console.log('[GoodDollar] Claim successful!');
      return {
        success: true,
        txHash,
        amountClaimed: formatGoodDollar(entitlement, tokenDecimals),
        gasDripTxHash,
      };
    } else {
      return { success: false, error: 'Transaction failed', txHash };
    }
  } catch (error: any) {
    console.error('[GoodDollar] Claim error:', error);
    return { success: false, error: error.shortMessage || error.message || 'Failed to claim G$' };
  }
}

// ===== G$ to XP Exchange =====

const TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

async function getFacilitatorAddress(): Promise<string> {
  const response = await fetch('/api/facilitator/address');
  if (!response.ok) {
    throw new Error('Failed to get facilitator address');
  }
  const data = await response.json();
  return data.address;
}

export interface GdToXpExchangeResult {
  success: boolean;
  txHash?: string;
  gdExchanged?: string;
  xpReceived?: number;
  newXpBalance?: number;
  error?: string;
}

export async function exchangeGdForXp(
  userAddress: Address,
  privateKey: `0x${string}`,
  gdAmount: string // Amount in G$ display units (e.g., "10.00")
): Promise<GdToXpExchangeResult> {
  const client = getCeloClient();
  
  try {
    // Convert display amount to raw units (G$ has 18 decimals)
    const gdFloat = parseFloat(gdAmount);
    const gdRaw = BigInt(Math.floor(gdFloat * 1e18));
    
    // Minimum 10 G$ for 1 XP
    const minGdRaw = BigInt(10) * BigInt(1e18);
    if (gdRaw < minGdRaw) {
      return { success: false, error: 'Minimum exchange is 10 G$' };
    }
    
    // Get facilitator address
    const facilitatorAddress = await getFacilitatorAddress();
    console.log('[G$ Exchange] Facilitator:', facilitatorAddress);
    
    // Check user's G$ balance
    const balance = await getGoodDollarBalance(userAddress);
    const balanceRaw = BigInt(balance.balance);
    
    if (balanceRaw < gdRaw) {
      return { success: false, error: `Insufficient G$ balance. You have ${balance.balanceFormatted} G$` };
    }
    
    // Check CELO balance for gas
    let celoBalance = await getCeloBalance(userAddress);
    console.log('[G$ Exchange] CELO balance:', celoBalance.toString());
    
    if (celoBalance < CELO_GAS_THRESHOLD) {
      console.log('[G$ Exchange] Low CELO balance, requesting gas drip...');
      const dripResult = await requestCeloGasDrip(userAddress);
      
      if (!dripResult.success) {
        // Gas drip failed - re-check balance in case initial check had network issues
        celoBalance = await getCeloBalance(userAddress);
        console.log('[G$ Exchange] Re-checked CELO balance:', celoBalance.toString());
        
        if (celoBalance < CELO_GAS_THRESHOLD) {
          return { success: false, error: dripResult.error || 'Failed to get gas for transfer' };
        }
        // User actually has enough gas, proceed
        console.log('[G$ Exchange] User has sufficient gas, proceeding...');
      } else if (dripResult.txHash) {
        // Wait for drip to confirm
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Create wallet client for signing
    const { createWalletClient, http, fallback: fb } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: fb(CELO_RPCS.map(url => http(url))),
    });
    
    // Transfer G$ to facilitator
    console.log(`[G$ Exchange] Transferring ${gdAmount} G$ to facilitator...`);
    
    const txHash = await walletClient.writeContract({
      address: GOODDOLLAR_CONTRACTS.token.celo,
      abi: TRANSFER_ABI,
      functionName: 'transfer',
      args: [facilitatorAddress as Address, gdRaw],
    });
    
    console.log('[G$ Exchange] Transfer submitted:', txHash);
    
    // Wait for confirmation
    const receipt = await client.waitForTransactionReceipt({ 
      hash: txHash,
      timeout: 60_000,
    });
    
    if (receipt.status !== 'success') {
      return { success: false, error: 'Transfer transaction failed', txHash };
    }
    
    console.log('[G$ Exchange] Transfer confirmed, crediting XP...');
    
    // Call backend to credit XP
    const response = await fetch('/api/xp/exchange-gd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: userAddress,
        gdAmount: gdRaw.toString(),
        txHash,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { 
        success: false, 
        // Prefer detailed 'message' field over generic 'error' field
        error: data.message || data.error || 'Failed to credit XP',
        txHash, // Include txHash so user knows transfer succeeded
      };
    }
    
    return {
      success: true,
      txHash,
      gdExchanged: data.gdExchanged,
      xpReceived: data.xpReceived,
      newXpBalance: data.newXpBalance,
    };
  } catch (error: any) {
    console.error('[G$ Exchange] Error:', error);
    return { success: false, error: error.shortMessage || error.message || 'Failed to exchange G$' };
  }
}

export interface SenadorBalance {
  balance: bigint;
  balanceFormatted: string;
  decimals: number;
}

export async function getSenadorBalance(address: Address): Promise<SenadorBalance> {
  console.log('[SENADOR] Checking balance for:', address);
  
  try {
    // Use backend API for reliable balance fetching
    const response = await fetch(`/api/senador/balance/${address}`);
    const data = await response.json();
    
    // Validate response has required fields
    if (typeof data.balance !== 'string' && typeof data.balance !== 'number') {
      console.warn('[SENADOR] Invalid balance response:', data);
      return {
        balance: 0n,
        balanceFormatted: data.balanceFormatted || '0.00',
        decimals: data.decimals || SENADOR_TOKEN.decimals,
      };
    }
    
    // Safely convert to BigInt
    let balance: bigint;
    try {
      balance = BigInt(data.balance);
    } catch {
      console.warn('[SENADOR] Could not parse balance as BigInt:', data.balance);
      balance = 0n;
    }
    
    console.log('[SENADOR] Balance result:', { 
      balance: balance.toString(), 
      decimals: data.decimals, 
      formatted: data.balanceFormatted 
    });
    
    return {
      balance,
      balanceFormatted: data.balanceFormatted || (Number(balance) / 1e18).toFixed(2),
      decimals: data.decimals || SENADOR_TOKEN.decimals,
    };
  } catch (error) {
    console.error('[SENADOR] Failed to get balance:', error);
    return {
      balance: 0n,
      balanceFormatted: '0.00',
      decimals: SENADOR_TOKEN.decimals,
    };
  }
}
