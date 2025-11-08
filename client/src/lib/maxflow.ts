/**
 * MaxFlow API Integration
 * Provides social vouching and reputation scores
 * API Docs: https://maxflow.one/api-docs
 * 
 * Note: All requests are proxied through our backend to avoid CORS issues
 */

const MAXFLOW_API = '/api/maxflow';

export interface MaxFlowScore {
  ownerAddress: string;
  localHealth: number;
  seedAddresses: string[];
  metrics: {
    totalNodes: number;
    acceptedUsers: number;
    avgResidualFlow: number;
    medianMinCut: number;
    maxPossibleFlow: number;
  };
  nodeDetails: any[];
}

export interface MaxFlowEpoch {
  epochId: number;
  status: string;
  createdAt: string;
  closedAt: string | null;
}

export interface MaxFlowNonce {
  nextNonce: number;
}

export interface VouchRequest {
  endorsement: {
    endorser: string;
    endorsee: string;
    epoch: string;
    nonce: string;
    sig: string;
    chainId: number;
    note?: string;
  };
}

export interface VouchResponse {
  success: boolean;
  endorsement: {
    id: number;
    communityId: number;
    scope: string;
    endorser: string;
    endorsee: string;
    leafHash: string;
    createdAt: string;
  };
  message: string;
}

/**
 * Get LocalHealth score for an address (no auth required)
 */
export async function getMaxFlowScore(address: string): Promise<MaxFlowScore> {
  const response = await fetch(`${MAXFLOW_API}/score/${address}`);
  if (!response.ok) {
    throw new Error('Failed to fetch MaxFlow score');
  }
  return response.json();
}

/**
 * Get current epoch (needed for vouching)
 */
export async function getCurrentEpoch(): Promise<MaxFlowEpoch> {
  const response = await fetch(`${MAXFLOW_API}/epoch/current`);
  if (!response.ok) {
    throw new Error('Failed to fetch current epoch');
  }
  return response.json();
}

/**
 * Get next nonce for signing (prevents replay attacks)
 */
export async function getNextNonce(address: string, epoch: number): Promise<number> {
  const response = await fetch(`${MAXFLOW_API}/nonce/${address}/${epoch}`);
  if (!response.ok) {
    throw new Error('Failed to fetch nonce');
  }
  const data: MaxFlowNonce = await response.json();
  return data.nextNonce;
}

/**
 * Submit a vouch to MaxFlow
 */
export async function submitVouch(vouchRequest: VouchRequest): Promise<VouchResponse> {
  const response = await fetch(`${MAXFLOW_API}/vouch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(vouchRequest),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to submit vouch' }));
    throw new Error(error.message || 'Failed to submit vouch');
  }
  
  return response.json();
}

/**
 * Helper function to vouch for an address
 * Handles all the signing and submission automatically
 */
export async function vouchFor(endorsedAddress: string): Promise<VouchResponse> {
  const { getWallet, getPrivateKey, getPreferences } = await import('./wallet');
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
  
  // Get epoch and nonce
  const epoch = await getCurrentEpoch();
  const nonce = await getNextNonce(validatedEndorser.toLowerCase(), epoch.epochId);
  
  // Get chainId from user's network preference
  const prefs = await getPreferences();
  if (!prefs) throw new Error('Failed to load preferences');
  const chainId = prefs.network === 'celo' ? 42220 : 8453;
  
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
    epoch: BigInt(epoch.epochId),
    nonce: BigInt(nonce),
  };

  // Sign
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'Endorsement',
    message,
  });

  // Submit vouch
  const vouchRequest: VouchRequest = {
    endorsement: {
      endorser: validatedEndorser.toLowerCase(),
      endorsee: validatedEndorsed.toLowerCase(),
      epoch: epoch.epochId.toString(),
      nonce: nonce.toString(),
      sig: signature,
      chainId: chainId,
    },
  };

  return submitVouch(vouchRequest);
}
