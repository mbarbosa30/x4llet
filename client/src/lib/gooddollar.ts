import { createPublicClient, http, type Address } from 'viem';
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

const celoClient = createPublicClient({
  chain: celo,
  transport: http('https://forno.celo.org'),
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
  activeUsers: number;
  nextClaimTime: Date | null;
}

export interface GoodDollarBalance {
  balance: bigint;
  balanceFormatted: string;
  decimals: number;
}

export async function getIdentityStatus(address: Address): Promise<IdentityStatus> {
  const client = getCeloClient();
  
  try {
    const [isWhitelisted, whitelistedRoot, lastAuthenticatedBigInt, authPeriodBigInt] = await Promise.all([
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
    ]);

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
  
  try {
    const [entitlement, currentDay, dailyUbi, lastClaimedDay, activeUsers] = await Promise.all([
      client.readContract({
        address: GOODDOLLAR_CONTRACTS.ubi.celo,
        abi: UBI_SCHEME_ABI,
        functionName: 'checkEntitlement',
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
        functionName: 'activeUsersCount',
      }),
    ]);

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

    return {
      canClaim,
      entitlement,
      entitlementFormatted: formatGoodDollar(entitlement),
      lastClaimedDay: Number(lastClaimedDay),
      currentDay: Number(currentDay),
      dailyUbi,
      dailyUbiFormatted: formatGoodDollar(dailyUbi),
      activeUsers: Number(activeUsers),
      nextClaimTime,
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
      activeUsers: 0,
      nextClaimTime: null,
    };
  }
}

export async function getGoodDollarBalance(address: Address): Promise<GoodDollarBalance> {
  const client = getCeloClient();
  
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

export function formatGoodDollar(amount: bigint, decimals: number = 2): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return `${wholePart}.${fractionalStr}`;
}

const GOODDOLLAR_FV_BASE_URL = 'https://goodid.gooddollar.org';

export interface FVLinkParams {
  address: Address;
  firstName?: string;
  callbackUrl?: string;
  popupMode?: boolean;
  chainId?: number;
}

export interface FVResult {
  isVerified: boolean;
  reason?: string;
}

export async function generateSignedFVLink(params: {
  address: Address;
  signMessage: (message: string) => Promise<string>;
  firstName?: string;
  callbackUrl?: string;
  popupMode?: boolean;
  chainId?: number;
}): Promise<string> {
  const {
    address,
    signMessage,
    firstName = 'User',
    callbackUrl = window.location.href,
    popupMode = false,
    chainId = 42220,
  } = params;

  const identifierMessage = `Sign this message to verify your identity for address ${address}`;
  
  try {
    const signature = await signMessage(identifierMessage);
    
    const identifier = btoa(JSON.stringify({
      a: address.toLowerCase(),
      s: signature,
      t: Date.now(),
    }));

    const fvParams = new URLSearchParams({
      identifier,
      firstName,
      callbackUrl,
      popupMode: popupMode.toString(),
      chainId: chainId.toString(),
      env: 'production',
    });

    return `${GOODDOLLAR_FV_BASE_URL}?${fvParams.toString()}`;
  } catch (error) {
    throw new Error('User rejected signature request');
  }
}

export function generateFaceVerificationLink(
  address: Address,
  callbackUrl?: string,
  popupMode: boolean = false
): string {
  const baseUrl = 'https://wallet.gooddollar.org';
  const params = new URLSearchParams();
  
  params.set('address', address);
  if (callbackUrl) {
    params.set('callbackUrl', callbackUrl);
  }
  params.set('popupMode', popupMode.toString());
  params.set('chainId', '42220');
  
  return `${baseUrl}?${params.toString()}`;
}

export function parseFVCallback(): FVResult | null {
  const params = new URLSearchParams(window.location.search);
  const isVerified = params.get('isVerified');
  const reason = params.get('reason');
  
  if (isVerified !== null) {
    return {
      isVerified: isVerified === 'true',
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
