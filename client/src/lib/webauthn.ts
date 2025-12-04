import { get, set, del } from 'idb-keyval';

const PASSKEY_CREDENTIAL_KEY = 'passkey_credential';
const PASSKEY_WRAPPED_DEK_KEY = 'passkey_wrapped_dek';
const PASSKEY_VERSION = 2;

interface StoredCredential {
  credentialId: string;
  rpId: string;
  prfSalt: string;
  createdAt: string;
}

interface PasskeyData {
  credential: StoredCredential;
  wrappedDek: string;
  version?: number;
}

async function migrateInsecurePasskeys(): Promise<void> {
  const data = await get<PasskeyData>(PASSKEY_WRAPPED_DEK_KEY);
  if (data && (!data.version || data.version < PASSKEY_VERSION)) {
    console.log('[WebAuthn] Removing insecure passkey data, re-enrollment required');
    await del(PASSKEY_WRAPPED_DEK_KEY);
  }
}

migrateInsecurePasskeys().catch(console.error);

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function isWebAuthnSupported(): boolean {
  return !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential === 'function'
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function isPrfSupported(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  
  try {
    const pkc = PublicKeyCredential as any;
    if (typeof pkc.getClientCapabilities === 'function') {
      const capabilities = await pkc.getClientCapabilities();
      return capabilities.get('prf') === true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface PasskeySupportStatus {
  supported: boolean;
  reason: 'supported' | 'no_webauthn' | 'no_platform_authenticator' | 'no_prf';
  message: string;
}

export async function getPasskeySupportStatus(): Promise<PasskeySupportStatus> {
  if (!isWebAuthnSupported()) {
    return {
      supported: false,
      reason: 'no_webauthn',
      message: 'WebAuthn not supported in this browser',
    };
  }
  
  const platformAvailable = await isPlatformAuthenticatorAvailable();
  if (!platformAvailable) {
    return {
      supported: false,
      reason: 'no_platform_authenticator',
      message: 'No biometric authenticator available',
    };
  }
  
  const prfAvailable = await isPrfSupported();
  if (!prfAvailable) {
    return {
      supported: false,
      reason: 'no_prf',
      message: 'Browser lacks PRF support. Use Chrome 116+ or Android.',
    };
  }
  
  return {
    supported: true,
    reason: 'supported',
    message: 'Passkey unlock available',
  };
}

export async function hasPasskeyEnrolled(): Promise<boolean> {
  const data = await get<PasskeyData>(PASSKEY_WRAPPED_DEK_KEY);
  return !!data?.credential?.credentialId;
}

export async function enrollPasskey(
  walletAddress: string,
  dek: Uint8Array
): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported on this device');
  }

  const rpId = window.location.hostname;
  const rpName = 'nanoPay';
  
  const userId = new TextEncoder().encode(walletAddress);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: rpName,
      id: rpId,
    },
    user: {
      id: userId,
      name: walletAddress,
      displayName: `nanoPay Wallet (${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)})`,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
      requireResidentKey: true,
    },
    timeout: 60000,
    attestation: 'none',
    extensions: {
      prf: {
        eval: {
          first: prfSalt.buffer,
        },
      },
    } as AuthenticationExtensionsClientInputs,
  };

  try {
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error('Failed to create passkey');
    }

    const extensionResults = credential.getClientExtensionResults() as any;
    
    if (!extensionResults?.prf?.enabled && !extensionResults?.prf?.results?.first) {
      throw new Error('PRF extension not supported on this device. Passkey unlock is not available.');
    }

    let prfOutput: ArrayBuffer;
    if (extensionResults.prf.results?.first) {
      prfOutput = extensionResults.prf.results.first;
    } else {
      const authResult = await authenticateForPrf(
        bufferToBase64(credential.rawId),
        rpId,
        prfSalt
      );
      if (!authResult) {
        throw new Error('Failed to get PRF output during enrollment');
      }
      prfOutput = authResult;
    }

    const credentialIdBase64 = bufferToBase64(credential.rawId);
    const wrappedDek = await wrapDekWithPrf(dek, prfOutput, rpId, credentialIdBase64);

    const passkeyData: PasskeyData = {
      credential: {
        credentialId: credentialIdBase64,
        rpId,
        prfSalt: bufferToBase64(prfSalt),
        createdAt: new Date().toISOString(),
      },
      wrappedDek: bufferToBase64(wrappedDek),
      version: PASSKEY_VERSION,
    };

    await set(PASSKEY_WRAPPED_DEK_KEY, passkeyData);

    return true;
  } catch (error: any) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Passkey enrollment was cancelled');
    }
    if (error.message?.includes('PRF')) {
      throw error;
    }
    throw new Error('Passkey enrollment failed: ' + error.message);
  }
}

async function authenticateForPrf(
  credentialId: string,
  rpId: string,
  prfSalt: Uint8Array
): Promise<ArrayBuffer | null> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  
  const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId,
    allowCredentials: [
      {
        id: base64ToBuffer(credentialId),
        type: 'public-key',
        transports: ['internal'],
      },
    ],
    userVerification: 'required',
    timeout: 60000,
    extensions: {
      prf: {
        eval: {
          first: prfSalt.buffer,
        },
      },
    } as AuthenticationExtensionsClientInputs,
  };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    }) as PublicKeyCredential;

    if (!assertion) {
      return null;
    }

    const extensionResults = assertion.getClientExtensionResults() as any;
    
    if (!extensionResults?.prf?.results?.first) {
      console.error('PRF output not available in assertion');
      return null;
    }

    return extensionResults.prf.results.first;
  } catch (error) {
    console.error('PRF authentication failed:', error);
    return null;
  }
}

async function wrapDekWithPrf(
  dek: Uint8Array,
  prfOutput: ArrayBuffer,
  rpId: string,
  credentialId: string
): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  const encoder = new TextEncoder();
  const salt = encoder.encode(`nanoPay:${rpId}:${credentialId}`);
  const info = encoder.encode('passkey-dek-wrap-v2');

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt,
      info,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    dek
  );

  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  
  return result.buffer;
}

async function unwrapDekWithPrf(
  wrappedDek: ArrayBuffer,
  prfOutput: ArrayBuffer,
  rpId: string,
  credentialId: string
): Promise<Uint8Array> {
  const wrappedBytes = new Uint8Array(wrappedDek);
  const iv = wrappedBytes.slice(0, 12);
  const encrypted = wrappedBytes.slice(12);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  const encoder = new TextEncoder();
  const salt = encoder.encode(`nanoPay:${rpId}:${credentialId}`);
  const info = encoder.encode('passkey-dek-wrap-v2');

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt,
      info,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    encrypted
  );

  return new Uint8Array(decrypted);
}

export async function authenticateWithPasskey(): Promise<Uint8Array | null> {
  const passkeyData = await get<PasskeyData>(PASSKEY_WRAPPED_DEK_KEY);
  if (!passkeyData?.credential) {
    return null;
  }

  const prfSalt = new Uint8Array(base64ToBuffer(passkeyData.credential.prfSalt));
  
  const prfOutput = await authenticateForPrf(
    passkeyData.credential.credentialId,
    passkeyData.credential.rpId,
    prfSalt
  );

  if (!prfOutput) {
    return null;
  }

  try {
    const dek = await unwrapDekWithPrf(
      base64ToBuffer(passkeyData.wrappedDek),
      prfOutput,
      passkeyData.credential.rpId,
      passkeyData.credential.credentialId
    );
    return dek;
  } catch (error) {
    console.error('Failed to unwrap DEK with PRF output:', error);
    return null;
  }
}

export async function removePasskey(): Promise<void> {
  await del(PASSKEY_WRAPPED_DEK_KEY);
}

export async function getPasskeyInfo(): Promise<StoredCredential | null> {
  const data = await get<PasskeyData>(PASSKEY_WRAPPED_DEK_KEY);
  return data?.credential || null;
}

export async function canEnrollPasskey(): Promise<boolean> {
  const platformAvailable = await isPlatformAuthenticatorAvailable();
  if (!platformAvailable) return false;
  
  return true;
}
