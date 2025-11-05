import { recoverAddress, hashTypedData, getAddress, type Hex } from 'viem';

// Exact values from the failed transaction
const from = '0x463c23E968AAB02E44977Dea5c1B0b16e61924ca' as Hex;
const to = '0x1116E33F241a3ff3D05276e8B0c895361AA669b3' as Hex;
const value = '10000';
const validAfter = '0';
const validBefore = '1762323021';
const nonce = '0x01325bbfb2998e8610d90110fc6b686319d1930a7c0fdf91163b16fe272276d6' as Hex;
const v = 28;
const r = '0x395f3032f18282287d8b720f8629b68754ee27c32b480d85634c1a42bc4d5f6e' as Hex;
const s = '0x06d49355f9944a259fb68a3a920a5beb34dcca65f69698bb32181ca999fb67ab' as Hex;

// Reconstruct signature
const signature = `${r}${s.slice(2)}${v.toString(16).padStart(2, '0')}` as Hex;

console.log('Validating failed transaction signature\n');
console.log('='.repeat(80));
console.log('\nTransaction Parameters:');
console.log('  from:', from);
console.log('  to:', to);
console.log('  value:', value);
console.log('  validAfter:', validAfter);
console.log('  validBefore:', validBefore);
console.log('  nonce:', nonce);
console.log('\nSignature Components:');
console.log('  v:', v);
console.log('  r:', r);
console.log('  s:', s);
console.log('  reconstructed:', signature);

// Create the domain and message
const domain = {
  name: 'USDC',
  version: '2',
  chainId: 42220,
  verifyingContract: getAddress('0xcebA9300f2b948710d2653dD7B07f33A8B32118C'),
} as const;

const types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

const message = {
  from: getAddress(from),
  to: getAddress(to),
  value: BigInt(value),
  validAfter: BigInt(validAfter),
  validBefore: BigInt(validBefore),
  nonce,
};

console.log('\nDomain:');
console.log('  name:', domain.name);
console.log('  version:', domain.version);
console.log('  chainId:', domain.chainId);
console.log('  verifyingContract:', domain.verifyingContract);

console.log('\nMessage:');
console.log('  from:', message.from);
console.log('  to:', message.to);
console.log('  value:', message.value.toString());
console.log('  validAfter:', message.validAfter.toString());
console.log('  validBefore:', message.validBefore.toString());
console.log('  nonce:', message.nonce);

// Compute the typed data hash
const typedDataHash = hashTypedData({
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message,
});

console.log('\nTyped Data Hash:', typedDataHash);

// Try to recover the signer from the signature
try {
  const recoveredAddress = await recoverAddress({
    hash: typedDataHash,
    signature,
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('Recovered Signer:', recoveredAddress);
  console.log('Expected Signer:', from);
  console.log('Match:', recoveredAddress.toLowerCase() === from.toLowerCase() ? '✅ YES' : '❌ NO');
  console.log('='.repeat(80));
  
  if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
    console.log('\n❌ SIGNATURE DOES NOT MATCH!');
    console.log('The signature was not created by the expected signer.');
    console.log('This explains why the contract rejected it.\n');
  } else {
    console.log('\n✅ SIGNATURE IS VALID!');
    console.log('The signature correctly proves ownership by the "from" address.');
    console.log('The contract should accept this signature.\n');
  }
} catch (error) {
  console.error('\n❌ Error recovering address:', error);
}
