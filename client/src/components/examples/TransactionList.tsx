import TransactionList, { Transaction } from '../TransactionList';

const mockTransactions: Transaction[] = [
  {
    id: '1',
    type: 'receive',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    amount: '250.00',
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
    status: 'completed'
  },
  {
    id: '2',
    type: 'send',
    address: '0x9f8a26F2C9F90C4E3c8b12D7E3A4B5C6D7E8F9A0',
    amount: '50.00',
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
    status: 'completed'
  },
  {
    id: '3',
    type: 'receive',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    amount: '1,000.00',
    timestamp: new Date(Date.now() - 24 * 60 * 60000).toISOString(),
    status: 'completed'
  }
];

export default function TransactionListExample() {
  return (
    <div className="max-w-md mx-auto p-4">
      <TransactionList 
        transactions={mockTransactions}
        onTransactionClick={(tx) => console.log('Transaction clicked:', tx)}
      />
    </div>
  );
}
