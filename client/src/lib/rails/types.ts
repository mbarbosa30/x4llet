import type { Address } from 'viem';

export interface TransferParams {
  from: Address;
  to: Address;
  amount: string; // micro-USDC (6 decimals)
  chainId: number;
  ttl?: number; // time-to-live in seconds
}

export interface SignedTransfer {
  chainId: number;
  token: string;
  typedData: any;
  signature: `0x${string}`;
}

export interface BalanceInfo {
  balanceMicro: string; // micro-USDC
  balance: string; // formatted USDC
}

export interface PaymentRail {
  name: string;
  
  canPay(chainId: number, token: string): Promise<boolean>;
  
  getBalance(address: Address, chainId: number): Promise<BalanceInfo | null>;
  
  buildTransfer(params: TransferParams, privateKey: `0x${string}`): Promise<SignedTransfer>;
  
  submitTransfer(transfer: SignedTransfer): Promise<{ txHash?: string; message: string }>;
}
