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
  id: number;
  status: string;
  createdAt: string;
  closedAt: string | null;
}

export interface MaxFlowNonce {
  nextNonce: number;
}

export interface VouchRequest {
  endorser: string;
  endorsee: string;
  epoch: string;
  nonce: string;
  timestamp: string;
  sig: string;
  chainId: number;
  note?: string;
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
    body: JSON.stringify({
      endorsement: vouchRequest,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to submit vouch' }));
    throw new Error(error.message || 'Failed to submit vouch');
  }
  
  return response.json();
}
