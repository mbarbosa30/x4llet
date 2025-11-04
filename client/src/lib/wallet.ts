import { get, set, del } from 'idb-keyval';
import { privateKeyToAccount } from 'viem/accounts';
import { generatePrivateKey } from 'viem/accounts';
import type { Wallet, UserPreferences } from '@shared/schema';

const WALLET_KEY = 'wallet_encrypted_key';
const PREFERENCES_KEY = 'user_preferences';

let sessionRecoveryCode: string | null = null;

function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function encryptPrivateKey(privateKey: string, recoveryCode: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(privateKey);
  const passwordKey = encoder.encode(recoveryCode);
  
  const key = await crypto.subtle.importKey(
    'raw',
    passwordKey,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    data
  );
  
  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return btoa(String.fromCharCode.apply(null, Array.from(result)));
}

async function decryptPrivateKey(encryptedData: string, recoveryCode: string): Promise<string> {
  const data = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const encrypted = data.slice(28);
  
  const encoder = new TextEncoder();
  const passwordKey = encoder.encode(recoveryCode);
  
  const key = await crypto.subtle.importKey(
    'raw',
    passwordKey,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export function setSessionRecoveryCode(code: string) {
  sessionRecoveryCode = code;
}

export function getSessionRecoveryCode(): string | null {
  return sessionRecoveryCode;
}

export function clearSessionRecoveryCode() {
  sessionRecoveryCode = null;
}

export async function createWallet(password: string): Promise<{ wallet: Wallet }> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  const encryptedKey = await encryptPrivateKey(privateKey, password);
  await set(WALLET_KEY, encryptedKey);
  
  setSessionRecoveryCode(password);
  
  const wallet: Wallet = {
    address: account.address,
    publicKey: account.address,
    createdAt: new Date().toISOString(),
  };
  
  return { wallet };
}

export async function getWallet(recoveryCode?: string): Promise<Wallet | null> {
  const encrypted = await get<string>(WALLET_KEY);
  if (!encrypted) return null;
  
  const code = recoveryCode || sessionRecoveryCode;
  if (!code) {
    throw new Error('RECOVERY_CODE_REQUIRED');
  }
  
  try {
    const privateKey = await decryptPrivateKey(encrypted, code);
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    
    if (!sessionRecoveryCode) {
      setSessionRecoveryCode(code);
    }
    
    return {
      address: account.address,
      publicKey: account.address,
      createdAt: new Date().toISOString(),
    };
  } catch {
    throw new Error('INVALID_RECOVERY_CODE');
  }
}

export async function exportWalletBackup(recoveryCode: string): Promise<string> {
  const encrypted = await get<string>(WALLET_KEY);
  if (!encrypted) throw new Error('No wallet found');
  
  try {
    await decryptPrivateKey(encrypted, recoveryCode);
    return encrypted;
  } catch {
    throw new Error('Invalid recovery code');
  }
}

export async function restoreWallet(encryptedBackup: string, recoveryCode: string): Promise<Wallet> {
  const privateKey = await decryptPrivateKey(encryptedBackup, recoveryCode);
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  await set(WALLET_KEY, encryptedBackup);
  setSessionRecoveryCode(recoveryCode);
  
  return {
    address: account.address,
    publicKey: account.address,
    createdAt: new Date().toISOString(),
  };
}

export async function deleteWallet(): Promise<void> {
  await del(WALLET_KEY);
  clearSessionRecoveryCode();
}

export async function getPrivateKey(): Promise<string | null> {
  const encrypted = await get<string>(WALLET_KEY);
  if (!encrypted || !sessionRecoveryCode) return null;
  
  try {
    return await decryptPrivateKey(encrypted, sessionRecoveryCode);
  } catch {
    return null;
  }
}

export async function hasWallet(): Promise<boolean> {
  const encrypted = await get<string>(WALLET_KEY);
  return !!encrypted;
}

export async function getPreferences(): Promise<UserPreferences> {
  const prefs = await get<UserPreferences>(PREFERENCES_KEY);
  return prefs || {
    currency: 'USD',
    language: 'en',
    network: 'base',
  };
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  await set(PREFERENCES_KEY, prefs);
}
