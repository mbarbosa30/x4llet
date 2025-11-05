import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, type Hex } from 'viem';

// The two addresses we're seeing
const expectedFrom = '0x463c23E968AAB02E44977Dea5c1B0b16e61924ca';
const recoveredSigner = '0x7bbE61da4ed05a2da881C368A9e82Db57BA99879';

console.log('Diagnosing Address Mismatch\n');
console.log('='.repeat(80));
console.log('\nExpected "from" address:', expectedFrom);
console.log('Signature recovers to:  ', recoveredSigner);
console.log('\n' + '='.repeat(80));

console.log('\nPossible Causes:');
console.log('1. The user has multiple wallets and is using the wrong one');
console.log('2. The private key in storage doesn\'t match the expected address');
console.log('3. The signature was created with different message/domain parameters');
console.log('\n' + '='.repeat(80));

console.log('\nDEBUGGING STEPS FOR USER:\n');
console.log('Step 1: Check which address is shown in your wallet');
console.log('  - Open the app and go to /home');
console.log('  - Look at the address displayed at the top');
console.log('  - Does it match', expectedFrom, '?');
console.log('  - Or does it match', recoveredSigner, '?');
console.log();
console.log('Step 2: If it matches', recoveredSigner);
console.log('  - Then there\'s a bug: the app is showing one address');
console.log('    but using a different one in the "from" field');
console.log('  - This would be a critical bug in Send.tsx');
console.log();
console.log('Step 3: If it matches', expectedFrom);
console.log('  - Then the private key being used for signing is wrong');
console.log('  - The app might be loading a different private key');
console.log('  - Or there\'s an issue with the signature generation');
console.log();
console.log('Step 4: Check IndexedDB for wallet data');
console.log('  - Open DevTools > Application > IndexedDB > keyval-store');
console.log('  - Look for "wallet_encrypted_key"');
console.log('  - Try decrypting it with your password');
console.log();
console.log('='.repeat(80));

// Test if maybe it's a checksum issue
const normalizedExpected = getAddress(expectedFrom.toLowerCase() as Hex);
const normalizedRecovered = getAddress(recoveredSigner.toLowerCase() as Hex);

console.log('\nChecksum Normalization Test:');
console.log('  Expected (normalized):', normalizedExpected);
console.log('  Recovered (normalized):', normalizedRecovered);
console.log('  Match:', normalizedExpected === normalizedRecovered ? '✅ YES (just a checksum difference)' : '❌ NO (different addresses)');
console.log();
