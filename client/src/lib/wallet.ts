import { get, set, del } from 'idb-keyval';
import { privateKeyToAccount } from 'viem/accounts';
import { generatePrivateKey } from 'viem/accounts';
import type { Wallet, UserPreferences } from '@shared/schema';
import { 
  isWebAuthnSupported, 
  hasPasskeyEnrolled, 
  enrollPasskey, 
  authenticateWithPasskey,
  removePasskey 
} from './webauthn';

const WALLET_KEY = 'wallet_encrypted_key';
const WALLET_V2_KEY = 'wallet_v2';
const PREFERENCES_KEY = 'user_preferences';

interface WalletV2Data {
  encryptedPrivateKey: string;
  dekWrappedByPassword: string;
  salt: string;
  version: 2;
}

let memoryDek: Uint8Array | null = null;
let memoryPassword: string | null = null;

function getSessionDek(): Uint8Array | null {
  return memoryDek;
}

function setSessionDek(dek: Uint8Array): void {
  memoryDek = dek;
}

function clearSessionDek(): void {
  memoryDek = null;
}

function getSessionPassword(): string | null {
  return memoryPassword;
}

function setSessionPassword(password: string): void {
  memoryPassword = password;
}

function clearSessionPassword(): void {
  memoryPassword = null;
}

function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function validateRecoveryCode(code: string): { valid: boolean; error?: string } {
  const trimmed = code.trim();
  
  if (!trimmed) {
    return { valid: false, error: 'Recovery code is required' };
  }
  
  const normalized = trimmed.replace(/-/g, '').toUpperCase();
  
  if (normalized.length !== 12) {
    return { valid: false, error: 'Recovery code must be 12 characters (XXXX-XXXX-XXXX)' };
  }
  
  const validChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
  if (!validChars.test(normalized)) {
    return { valid: false, error: 'Recovery code contains invalid characters' };
  }
  
  return { valid: true };
}

export function formatRecoveryCode(code: string): string {
  const normalized = code.replace(/-/g, '').toUpperCase();
  
  if (normalized.length === 0) return '';
  
  let formatted = '';
  for (let i = 0; i < normalized.length && i < 12; i++) {
    if (i > 0 && i % 4 === 0) formatted += '-';
    formatted += normalized[i];
  }
  
  return formatted;
}

function generateDek(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function encryptWithDek(data: string, dek: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  
  const key = await crypto.subtle.importKey(
    'raw',
    dek,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBytes
  );
  
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...result));
}

async function decryptWithDek(encryptedData: string, dek: Uint8Array): Promise<string> {
  const data = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  
  const key = await crypto.subtle.importKey(
    'raw',
    dek,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return new TextDecoder().decode(decrypted);
}

async function wrapDekWithPassword(dek: Uint8Array, password: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const passwordKey = encoder.encode(password);
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordKey,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    dek
  );
  
  const result = new Uint8Array(iv.length + wrapped.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(wrapped), iv.length);
  
  return btoa(String.fromCharCode(...result));
}

async function unwrapDekWithPassword(wrappedDek: string, password: string, salt: Uint8Array): Promise<Uint8Array> {
  const data = Uint8Array.from(atob(wrappedDek), c => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  
  const encoder = new TextEncoder();
  const passwordKey = encoder.encode(password);
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordKey,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const unwrapped = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    encrypted
  );
  
  return new Uint8Array(unwrapped);
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
  setSessionPassword(code);
}

export function getSessionRecoveryCode(): string | null {
  return getSessionPassword();
}

export function clearSessionRecoveryCode() {
  clearSessionPassword();
  clearSessionDek();
}

async function isV2Wallet(): Promise<boolean> {
  const v2Data = await get<WalletV2Data>(WALLET_V2_KEY);
  return v2Data?.version === 2;
}

async function migrateToV2(privateKey: string, password: string): Promise<void> {
  const dek = generateDek();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const encryptedPrivateKey = await encryptWithDek(privateKey, dek);
  const dekWrappedByPassword = await wrapDekWithPassword(dek, password, salt);
  
  const v2Data: WalletV2Data = {
    encryptedPrivateKey,
    dekWrappedByPassword,
    salt: btoa(String.fromCharCode(...salt)),
    version: 2,
  };
  
  await set(WALLET_V2_KEY, v2Data);
  setSessionDek(dek);
}

export async function createWallet(password: string): Promise<{ wallet: Wallet; privateKey: string }> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  const dek = generateDek();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const encryptedPrivateKey = await encryptWithDek(privateKey, dek);
  const dekWrappedByPassword = await wrapDekWithPassword(dek, password, salt);
  
  const v2Data: WalletV2Data = {
    encryptedPrivateKey,
    dekWrappedByPassword,
    salt: btoa(String.fromCharCode(...salt)),
    version: 2,
  };
  
  await set(WALLET_V2_KEY, v2Data);
  
  const legacyEncrypted = await encryptPrivateKey(privateKey, password);
  await set(WALLET_KEY, legacyEncrypted);
  
  setSessionDek(dek);
  setSessionRecoveryCode(password);
  
  const wallet: Wallet = {
    address: account.address,
    publicKey: account.address,
    createdAt: new Date().toISOString(),
  };
  
  return { wallet, privateKey };
}

export async function getWallet(recoveryCode?: string): Promise<Wallet | null> {
  const sessionDek = getSessionDek();
  if (sessionDek) {
    const v2Data = await get<WalletV2Data>(WALLET_V2_KEY);
    if (v2Data) {
      try {
        const privateKey = await decryptWithDek(v2Data.encryptedPrivateKey, sessionDek);
        const account = privateKeyToAccount(privateKey as `0x${string}`);
        return {
          address: account.address,
          publicKey: account.address,
          createdAt: new Date().toISOString(),
        };
      } catch {
      }
    }
  }

  const encrypted = await get<string>(WALLET_KEY);
  if (!encrypted) return null;
  
  const code = recoveryCode || getSessionPassword();
  if (!code) {
    throw new Error('RECOVERY_CODE_REQUIRED');
  }
  
  try {
    const privateKey = await decryptPrivateKey(encrypted, code);
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    
    if (!getSessionPassword()) {
      setSessionPassword(code);
    }
    
    const isV2 = await isV2Wallet();
    if (!isV2) {
      await migrateToV2(privateKey, code);
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

export async function unlockWithPasskey(): Promise<Wallet | null> {
  if (!isWebAuthnSupported()) {
    return null;
  }
  
  const hasPasskey = await hasPasskeyEnrolled();
  if (!hasPasskey) {
    return null;
  }
  
  const dek = await authenticateWithPasskey();
  if (!dek) {
    return null;
  }
  
  const v2Data = await get<WalletV2Data>(WALLET_V2_KEY);
  if (!v2Data) {
    return null;
  }
  
  try {
    const privateKey = await decryptWithDek(v2Data.encryptedPrivateKey, dek);
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    
    setSessionDek(dek);
    
    return {
      address: account.address,
      publicKey: account.address,
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function enrollWalletPasskey(): Promise<boolean> {
  const sessionDek = getSessionDek();
  if (!sessionDek) {
    throw new Error('Wallet must be unlocked to enroll passkey');
  }
  
  const v2Data = await get<WalletV2Data>(WALLET_V2_KEY);
  if (!v2Data) {
    throw new Error('Wallet not found');
  }
  
  try {
    const privateKey = await decryptWithDek(v2Data.encryptedPrivateKey, sessionDek);
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    
    const enrolled = await enrollPasskey(account.address, sessionDek);
    return enrolled;
  } catch (error) {
    throw error;
  }
}

export async function removeWalletPasskey(): Promise<void> {
  await removePasskey();
}

export async function canUsePasskey(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  const hasPasskey = await hasPasskeyEnrolled();
  return hasPasskey;
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
  
  await migrateToV2(privateKey, recoveryCode);
  setSessionRecoveryCode(recoveryCode);
  
  return {
    address: account.address,
    publicKey: account.address,
    createdAt: new Date().toISOString(),
  };
}

export async function importFromPrivateKey(privateKey: string, newPassword: string): Promise<Wallet> {
  let cleanedKey = privateKey.trim();
  if (!cleanedKey.startsWith('0x')) {
    cleanedKey = '0x' + cleanedKey;
  }
  
  const account = privateKeyToAccount(cleanedKey as `0x${string}`);
  
  const dek = generateDek();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const encryptedPrivateKey = await encryptWithDek(cleanedKey, dek);
  const dekWrappedByPassword = await wrapDekWithPassword(dek, newPassword, salt);
  
  const v2Data: WalletV2Data = {
    encryptedPrivateKey,
    dekWrappedByPassword,
    salt: btoa(String.fromCharCode(...salt)),
    version: 2,
  };
  
  await set(WALLET_V2_KEY, v2Data);
  
  const legacyEncrypted = await encryptPrivateKey(cleanedKey, newPassword);
  await set(WALLET_KEY, legacyEncrypted);
  
  setSessionDek(dek);
  setSessionPassword(newPassword);
  
  return {
    address: account.address,
    publicKey: account.address,
    createdAt: new Date().toISOString(),
  };
}

export async function deleteWallet(): Promise<void> {
  await del(WALLET_KEY);
  await del(WALLET_V2_KEY);
  await removePasskey();
  clearSessionRecoveryCode();
}

export async function getPrivateKey(password?: string): Promise<string | null> {
  const sessionDek = getSessionDek();
  if (sessionDek) {
    const v2Data = await get<WalletV2Data>(WALLET_V2_KEY);
    if (v2Data) {
      try {
        return await decryptWithDek(v2Data.encryptedPrivateKey, sessionDek);
      } catch {
      }
    }
  }

  const encrypted = await get<string>(WALLET_KEY);
  if (!encrypted) return null;
  
  const code = password || getSessionPassword();
  if (!code) return null;
  
  try {
    return await decryptPrivateKey(encrypted, code);
  } catch {
    return null;
  }
}

export async function hasWallet(): Promise<boolean> {
  const encrypted = await get<string>(WALLET_KEY);
  const v2Data = await get<WalletV2Data>(WALLET_V2_KEY);
  return !!(encrypted || v2Data);
}

export function isWalletUnlocked(): boolean {
  return !!(getSessionPassword() || getSessionDek());
}

export function lockWallet(): void {
  clearSessionPassword();
  clearSessionDek();
}

const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  'US': 'USD', 'CA': 'CAD', 'MX': 'MXN',
  'AT': 'EUR', 'BE': 'EUR', 'CY': 'EUR', 'EE': 'EUR', 'FI': 'EUR',
  'FR': 'EUR', 'DE': 'EUR', 'GR': 'EUR', 'IE': 'EUR', 'IT': 'EUR',
  'LV': 'EUR', 'LT': 'EUR', 'LU': 'EUR', 'MT': 'EUR', 'NL': 'EUR',
  'PT': 'EUR', 'SK': 'EUR', 'SI': 'EUR', 'ES': 'EUR',
  'GB': 'GBP', 'CH': 'CHF', 'NO': 'NOK', 'SE': 'SEK', 'DK': 'DKK',
  'PL': 'PLN', 'CZ': 'CZK', 'HU': 'HUF', 'RO': 'RON', 'BG': 'BGN',
  'HR': 'HRK', 'IS': 'ISK', 'TR': 'TRY', 'RU': 'RUB', 'UA': 'UAH',
  'JP': 'JPY', 'CN': 'CNY', 'KR': 'KRW', 'IN': 'INR', 'ID': 'IDR',
  'TH': 'THB', 'MY': 'MYR', 'SG': 'SGD', 'PH': 'PHP', 'VN': 'VND',
  'HK': 'HKD', 'TW': 'TWD', 'BD': 'BDT', 'PK': 'PKR', 'LK': 'LKR',
  'IL': 'ILS', 'SA': 'SAR', 'AE': 'AED', 'KW': 'KWD', 'QA': 'QAR',
  'AU': 'AUD', 'NZ': 'NZD',
  'BR': 'BRL', 'AR': 'ARS', 'CL': 'CLP', 'CO': 'COP', 'PE': 'PEN',
  'UY': 'UYU', 'VE': 'VES', 'BO': 'BOB', 'PY': 'PYG', 'EC': 'USD',
  'ZA': 'ZAR', 'NG': 'NGN', 'EG': 'EGP', 'KE': 'KES', 'GH': 'GHS',
  'MA': 'MAD', 'TN': 'TND', 'UG': 'UGX', 'TZ': 'TZS', 'ET': 'ETB',
};

export function detectCurrencyFromLocale(): string {
  if (typeof navigator === 'undefined') return 'USD';
  
  try {
    const locale = navigator.language || 'en-US';
    const countryCode = locale.split('-')[1]?.toUpperCase();
    
    if (countryCode && COUNTRY_CURRENCY_MAP[countryCode]) {
      return COUNTRY_CURRENCY_MAP[countryCode];
    }
    
    return 'USD';
  } catch (error) {
    console.error('Failed to detect currency from locale:', error);
    return 'USD';
  }
}

export async function getPreferences(): Promise<UserPreferences> {
  const prefs = await get<UserPreferences>(PREFERENCES_KEY);
  return prefs || {
    currency: 'USD',
    language: 'en',
  };
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  await set(PREFERENCES_KEY, prefs);
}
