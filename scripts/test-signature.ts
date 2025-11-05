import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, verifyTypedData, type Hex } from 'viem';
import { hashTypedData } from 'viem';

const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY!;

const account = privateKeyToAccount(
  FACILITATOR_PRIVATE_KEY.startsWith('0x') 
    ? FACILITATOR_PRIVATE_KEY as Hex 
    : `0x${FACILITATOR_PRIVATE_KEY}` as Hex
);

console.log('Testing EIP-712 signature generation and recovery\n');
console.log('Signer address:', account.address);
console.log('='.repeat(80));

const testConfigs = [
  {
    name: 'Base Mainnet',
    chainId: 8453,
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    domainName: 'USD Coin',
  },
  {
    name: 'Celo Mainnet',
    chainId: 42220,
    usdcAddress: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    domainName: 'USDC',
  },
];

async function testSignature(config: typeof testConfigs[0]) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${config.name}`);
  console.log('='.repeat(80));
  
  const from = account.address;
  const to = '0x1116E33F241a3ff3D05276e8B0c895361AA669b3';
  const value = '10000'; // 0.01 USDC
  const validAfter = '0';
  const validBefore = Math.floor(Date.now() / 1000 + 600).toString();
  
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as Hex;
  
  console.log('\nTransaction Parameters:');
  console.log('  from:', from);
  console.log('  to:', to);
  console.log('  value:', value);
  console.log('  validAfter:', validAfter);
  console.log('  validBefore:', validBefore);
  console.log('  nonce:', nonce);
  
  const domain = {
    name: config.domainName,
    version: '2',
    chainId: config.chainId,
    verifyingContract: getAddress(config.usdcAddress),
  } as const;
  
  console.log('\nDomain:');
  console.log('  name:', domain.name);
  console.log('  version:', domain.version);
  console.log('  chainId:', domain.chainId);
  console.log('  verifyingContract:', domain.verifyingContract);
  
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
  
  console.log('\nMessage (typed):');
  console.log('  from:', message.from);
  console.log('  to:', message.to);
  console.log('  value:', message.value.toString());
  console.log('  validAfter:', message.validAfter.toString());
  console.log('  validBefore:', message.validBefore.toString());
  console.log('  nonce:', message.nonce);
  
  const typedDataHash = hashTypedData({
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message,
  });
  
  console.log('\nTyped Data Hash:', typedDataHash);
  
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message,
  });
  
  console.log('\nSignature:', signature);
  console.log('Signature length:', signature.length);
  
  const [v, r, s] = [
    parseInt(signature.slice(130, 132), 16),
    signature.slice(0, 66) as Hex,
    `0x${signature.slice(66, 130)}` as Hex,
  ];
  
  console.log('\nSignature Components:');
  console.log('  v:', v);
  console.log('  r:', r);
  console.log('  s:', s);
  
  const isValid = await verifyTypedData({
    address: account.address,
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message,
    signature,
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`Signature Valid: ${isValid ? '✅ YES' : '❌ NO'}`);
  console.log('='.repeat(80));
  
  if (!isValid) {
    console.log('\n⚠️  SIGNATURE VERIFICATION FAILED!');
    console.log('The signature does not match the expected signer.');
  }
  
  return { isValid, signature, v, r, s, domain, message };
}

async function main() {
  for (const config of testConfigs) {
    await testSignature(config);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('Diagnostic Complete');
  console.log('='.repeat(80));
}

main().catch(console.error);
