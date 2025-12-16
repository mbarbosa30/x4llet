import { get, set } from 'idb-keyval';

const STORAGE_TOKEN_KEY = 'nanopay_device_token';

export interface BrowserFingerprint {
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  platform: string;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  storageToken: string;
}

async function getOrCreateStorageToken(): Promise<string> {
  try {
    const existingToken = await get<string>(STORAGE_TOKEN_KEY);
    if (existingToken) {
      return existingToken;
    }
    const newToken = crypto.randomUUID();
    await set(STORAGE_TOKEN_KEY, newToken);
    return newToken;
  } catch (error) {
    console.error('[Fingerprint] Error with storage token:', error);
    return crypto.randomUUID();
  }
}

export async function collectFingerprint(): Promise<BrowserFingerprint> {
  const storageToken = await getOrCreateStorageToken();
  
  const screenResolution = `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio || 1}`;
  
  return {
    userAgent: navigator.userAgent,
    screenResolution,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: (navigator as any).deviceMemory || null,
    storageToken,
  };
}

let cachedFingerprint: BrowserFingerprint | null = null;

export async function getFingerprint(): Promise<BrowserFingerprint> {
  if (!cachedFingerprint) {
    cachedFingerprint = await collectFingerprint();
  }
  return cachedFingerprint;
}
