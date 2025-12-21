/**
 * MaxFlow API Integration
 * Provides social vouching and reputation scores via LocalHealth/ego scoring
 * API Docs: https://maxflow.one/api-docs
 * 
 * Note: All requests are proxied through our backend to avoid CORS issues
 */

const MAXFLOW_API = '/api/maxflow';

export interface MaxFlowScore {
  address: string;
  local_health: number;
  cached: boolean;
  cached_at: string | null;
  vouch_counts: {
    incoming_total: number;
    incoming_active: number;
    outgoing_total: number;
    unique_vouchers: number;
  };
  activity: {
    last_vouch_given_at: string | null;
  };
  algorithm_breakdown?: {
    flow_component: number;
    redundancy_component: number;
    direct_flow: number;
    actual_min_cut?: number;
    effective_redundancy: number;
    dilution_factor: number;
    vertex_disjoint_paths: number;
    ego_network_size: number;
    edge_density: number;
    baselines: {
      healthy_vouch_count: number;
      healthy_redundancy: number;
    };
  };
}

export interface MaxFlowNonce {
  epoch: number;
  nonce: number;
}

export interface VouchStatus {
  exists: boolean;
  status: 'active' | 'expiring_soon' | 'expired' | 'revoked' | null;
  days_remaining: number | null;
  created_at: string | null;
}

export interface RevokeInfo {
  exists: boolean;
  endorsement_id: number;
  already_revoked: boolean;
}

export interface VouchResponse {
  ok: boolean;
  error?: string;
  pendingXpAwarded?: number;
}

export interface RevokeResponse {
  ok: boolean;
  revoked: boolean;
  error?: string;
}

export interface Endorsement {
  id: number;
  communityId: number;
  scope: string;
  endorser: string;
  endorsee: string;
  epoch: number;
  nonce: number;
  sig: string;
  leafHash: string;
  promptHash: string | null;
  note: string | null;
  createdAt: string;
}

export interface EndorsementWithStatus extends Endorsement {
  expirationStatus: {
    isValid: boolean;
    isRevoked: boolean;
    isExpired: boolean;
    expiresAt: string | null;
    daysUntilExpiration: number | null;
  };
}

export interface EndorsementsResponse {
  endorsements: Endorsement[];
  count: number;
}

export interface EndorsementsWithStatusResponse {
  endorsements: EndorsementWithStatus[];
  count: number;
}

export interface UserProfile {
  address: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get LocalHealth score for an address (no auth required)
 * Returns full score including vouch_counts, activity, and algorithm_breakdown
 */
export async function getMaxFlowScore(address: string): Promise<MaxFlowScore> {
  const response = await fetch(`${MAXFLOW_API}/score/${address}`);
  if (!response.ok) {
    throw new Error('Failed to fetch MaxFlow score');
  }
  return response.json();
}

/**
 * Get epoch and nonce for signing (combined endpoint in v1 API)
 */
export async function getVouchNonce(address: string): Promise<MaxFlowNonce> {
  const response = await fetch(`${MAXFLOW_API}/nonce/${address}`);
  if (!response.ok) {
    throw new Error('Failed to fetch nonce');
  }
  return response.json();
}

/**
 * Check if a vouch exists and its current status
 */
export async function getVouchStatus(endorser: string, endorsee: string): Promise<VouchStatus> {
  const response = await fetch(`${MAXFLOW_API}/vouch-status?endorser=${endorser}&endorsee=${endorsee}`);
  if (!response.ok) {
    throw new Error('Failed to fetch vouch status');
  }
  return response.json();
}

/**
 * Submit a vouch to MaxFlow (flat request body for v1 API)
 * Supports EVM chains (default) and non-EVM chains (Stellar, Solana, Cosmos)
 */
export async function submitVouch(params: {
  endorser: string;
  endorsee: string;
  epoch: string;
  nonce: string;
  sig: string;
  chainId?: number;
  chainNamespace?: 'eip155' | 'stellar' | 'solana' | 'cosmos';
  externallyVerified?: boolean;
}): Promise<VouchResponse> {
  const response = await fetch(`${MAXFLOW_API}/vouch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to submit vouch' }));
    throw new Error(error.error || 'Failed to submit vouch');
  }
  
  return response.json();
}

/**
 * Get endorsement ID needed for revocation
 */
export async function getRevokeInfo(endorser: string, endorsee: string): Promise<RevokeInfo> {
  const response = await fetch(`${MAXFLOW_API}/revoke/info?endorser=${endorser}&endorsee=${endorsee}`);
  if (!response.ok) {
    throw new Error('Failed to fetch revoke info');
  }
  return response.json();
}

/**
 * Revoke a vouch using EIP-712 signature
 */
export async function submitRevoke(params: {
  endorser: string;
  endorsee: string;
  endorsementId: number;
  sig: string;
  chainId: number;
}): Promise<RevokeResponse> {
  const response = await fetch(`${MAXFLOW_API}/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to revoke vouch' }));
    throw new Error(error.error || 'Failed to revoke vouch');
  }
  
  return response.json();
}

/**
 * Get list of endorsements (vouches) with optional filtering
 */
export async function getEndorsements(params?: {
  endorser?: string;
  endorsee?: string;
  limit?: number;
  offset?: number;
}): Promise<EndorsementsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.endorser) searchParams.append('endorser', params.endorser);
  if (params?.endorsee) searchParams.append('endorsee', params.endorsee);
  if (params?.limit) searchParams.append('limit', params.limit.toString());
  if (params?.offset) searchParams.append('offset', params.offset.toString());
  
  const response = await fetch(`${MAXFLOW_API}/endorsements?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch endorsements');
  }
  return response.json();
}

/**
 * Get list of endorsements with expiration status
 */
export async function getEndorsementsWithStatus(params?: {
  endorser?: string;
  endorsee?: string;
  limit?: number;
}): Promise<EndorsementsWithStatusResponse> {
  const searchParams = new URLSearchParams();
  if (params?.endorser) searchParams.append('endorser', params.endorser);
  if (params?.endorsee) searchParams.append('endorsee', params.endorsee);
  if (params?.limit) searchParams.append('limit', params.limit.toString());
  
  const response = await fetch(`${MAXFLOW_API}/endorsements/with-status?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch endorsements with status');
  }
  return response.json();
}

/**
 * Get user profile (display name) for an address
 */
export async function getUserProfile(address: string): Promise<UserProfile | null> {
  const response = await fetch(`${MAXFLOW_API}/user/${address}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }
  return response.json();
}

/**
 * Helper function to vouch for an address
 * Handles all the signing and submission automatically
 */
export async function vouchFor(endorsedAddress: string): Promise<VouchResponse> {
  const { getWallet, getPrivateKey } = await import('./wallet');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { getAddress } = await import('viem');
  
  const wallet = await getWallet();
  if (!wallet) throw new Error('No wallet found');
  
  const privateKey = await getPrivateKey();
  if (!privateKey) throw new Error('No private key found');
  
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  // Validate and normalize addresses
  const validatedEndorser = getAddress(wallet.address);
  const validatedEndorsed = getAddress(endorsedAddress);
  
  // Get epoch and nonce (combined endpoint in v1 API)
  const { epoch, nonce } = await getVouchNonce(validatedEndorser.toLowerCase());
  
  // Use Celo as default chainId for MaxFlow vouching (EIP-712 signatures)
  // The chainId is part of the signature domain but doesn't restrict which chain the vouch is for
  const chainId = 42220;
  
  // Prepare EIP-712 message
  const domain = {
    name: 'MaxFlow',
    version: '1',
    chainId: chainId,
  };

  const types = {
    Endorsement: [
      { name: 'endorser', type: 'address' },
      { name: 'endorsee', type: 'address' },
      { name: 'epoch', type: 'uint64' },
      { name: 'nonce', type: 'uint64' },
    ],
  };

  const message = {
    endorser: validatedEndorser.toLowerCase(),
    endorsee: validatedEndorsed.toLowerCase(),
    epoch: BigInt(epoch),
    nonce: BigInt(nonce),
  };

  // Sign
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'Endorsement',
    message,
  });

  // Check if endorsee has no score before submitting (for post-vouch prefetch)
  let endorseeHadNoScore = false;
  try {
    const preScore = await getMaxFlowScore(validatedEndorsed.toLowerCase());
    endorseeHadNoScore = preScore.local_health === 0;
  } catch {
    // No score found = first time user
    endorseeHadNoScore = true;
  }

  // Submit vouch (flat structure for v1 API)
  const result = await submitVouch({
    endorser: validatedEndorser.toLowerCase(),
    endorsee: validatedEndorsed.toLowerCase(),
    epoch: epoch.toString(),
    nonce: nonce.toString(),
    sig: signature,
    chainId: chainId,
  });

  // If vouch succeeded AND endorsee had no score, prefetch to trigger recalculation
  // This ensures first-time vouched users see their score immediately
  if (result.ok && endorseeHadNoScore) {
    try {
      await getMaxFlowScore(validatedEndorsed.toLowerCase());
    } catch {
      // Non-critical - endorsee will get score on their next visit
    }
  }

  return result;
}

/**
 * Helper function to revoke a vouch
 * Handles all the signing and submission automatically
 */
export async function revokeVouchFor(endorsedAddress: string): Promise<RevokeResponse> {
  const { getWallet, getPrivateKey } = await import('./wallet');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { getAddress } = await import('viem');
  
  const wallet = await getWallet();
  if (!wallet) throw new Error('No wallet found');
  
  const privateKey = await getPrivateKey();
  if (!privateKey) throw new Error('No private key found');
  
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  // Validate and normalize addresses
  const validatedEndorser = getAddress(wallet.address);
  const validatedEndorsed = getAddress(endorsedAddress);
  
  // Get endorsement ID for revocation
  const revokeInfo = await getRevokeInfo(
    validatedEndorser.toLowerCase(),
    validatedEndorsed.toLowerCase()
  );
  
  if (!revokeInfo.exists) {
    throw new Error('No vouch exists to revoke');
  }
  
  if (revokeInfo.already_revoked) {
    throw new Error('Vouch has already been revoked');
  }
  
  // Use Celo as default chainId for MaxFlow vouching (EIP-712 signatures)
  // The chainId is part of the signature domain but doesn't restrict which chain the vouch is for
  const chainId = 42220;
  
  // Prepare EIP-712 message for revocation
  const domain = {
    name: 'MaxFlow',
    version: '1',
    chainId: chainId,
  };

  const types = {
    Revocation: [
      { name: 'endorser', type: 'address' },
      { name: 'endorsee', type: 'address' },
      { name: 'endorsementId', type: 'uint256' },
    ],
  };

  const message = {
    endorser: validatedEndorser.toLowerCase(),
    endorsee: validatedEndorsed.toLowerCase(),
    endorsementId: BigInt(revokeInfo.endorsement_id),
  };

  // Sign
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'Revocation',
    message,
  });

  // Submit revocation
  return submitRevoke({
    endorser: validatedEndorser.toLowerCase(),
    endorsee: validatedEndorsed.toLowerCase(),
    endorsementId: revokeInfo.endorsement_id,
    sig: signature,
    chainId: chainId,
  });
}
