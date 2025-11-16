import { type Address, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { PaymentRail, TransferParams, SignedTransfer, BalanceInfo } from './types';
import { apiRequest } from '../queryClient';

interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  usdcAddress: string;
  usdcName: string; // "USD Coin" for Base, "USDC" for Celo
  explorerUrl: string;
}

const NETWORKS: Record<number, NetworkConfig> = {
  8453: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdcName: 'USD Coin',
    explorerUrl: 'https://basescan.org',
  },
  42220: {
    chainId: 42220,
    name: 'Celo',
    rpcUrl: 'https://forno.celo.org',
    usdcAddress: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    usdcName: 'USDC',
    explorerUrl: 'https://celoscan.io',
  },
};

export class PublicRail implements PaymentRail {
  name = 'Public (EIP-3009)';

  async canPay(chainId: number, token: string): Promise<boolean> {
    // Public rail supports USDC on Base and Celo
    return (chainId === 8453 || chainId === 42220) && token === 'USDC';
  }

  async getBalance(address: Address, chainId: number): Promise<BalanceInfo | null> {
    try {
      const res = await fetch(`/api/balance/${address}?chainId=${chainId}`);
      if (!res.ok) return null;
      
      const data = await res.json();
      
      // Single-chain API response format (when chainId is specified)
      // Returns: { balance, balanceMicro, decimals, nonce }
      if (data.balance && data.balanceMicro) {
        return {
          balanceMicro: data.balanceMicro,
          balance: data.balance,
        };
      }
      
      return null;
    } catch (error) {
      console.error('PublicRail: Failed to fetch balance:', error);
      return null;
    }
  }

  async buildTransfer(params: TransferParams, privateKey: `0x${string}`): Promise<SignedTransfer> {
    const account = privateKeyToAccount(privateKey);
    const network = NETWORKS[params.chainId];
    
    if (!network) {
      throw new Error(`Unsupported chainId: ${params.chainId}`);
    }

    // Generate random nonce
    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    const nonce = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
    
    const validAfter = '0';
    const validBefore = Math.floor(Date.now() / 1000 + (params.ttl || 600)).toString();

    const domain = {
      name: network.usdcName,
      version: '2',
      chainId: network.chainId,
      verifyingContract: getAddress(network.usdcAddress),
    };

    const message = {
      from: account.address,
      to: getAddress(params.to),
      value: BigInt(params.amount),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce as `0x${string}`,
    };

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

    const typedData = {
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
      message: {
        from: message.from,
        to: message.to,
        value: params.amount,
        validAfter,
        validBefore,
        nonce,
      },
    };

    return {
      chainId: params.chainId,
      token: 'USDC',
      typedData,
      signature,
    };
  }

  async submitTransfer(transfer: SignedTransfer): Promise<{ txHash?: string; message: string }> {
    try {
      const res = await apiRequest('POST', '/api/relay/transfer-3009', transfer);
      const data = await res.json();
      return {
        txHash: data.txHash,
        message: data.message || 'Transfer submitted successfully',
      };
    } catch (error: any) {
      throw new Error(error.message || 'Failed to submit transfer');
    }
  }
}
