import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, Settings, QrCode } from 'lucide-react';
import BalanceCard from '@/components/BalanceCard';
import TransactionList, { Transaction } from '@/components/TransactionList';

export default function Home() {
  // TODO: remove mock functionality
  const [balance] = useState('1,250.00');
  const [fiatValue] = useState('1,250.00');
  const [transactions] = useState<Transaction[]>([
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
  ]);

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b flex items-center justify-between px-4">
        <h1 className="text-lg font-semibold">Wallet</h1>
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => console.log('Scan QR')}
            data-testid="button-scan"
          >
            <QrCode className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => console.log('Open settings')}
            data-testid="button-settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        <BalanceCard 
          balance={balance}
          currency="USDC"
          fiatValue={fiatValue}
          fiatCurrency="USD"
        />

        <div className="grid grid-cols-2 gap-2">
          <Button 
            size="lg" 
            className="w-full"
            onClick={() => console.log('Navigate to send')}
            data-testid="button-send"
          >
            <ArrowUpRight className="h-5 w-5 mr-2" />
            Send
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            className="w-full"
            onClick={() => console.log('Navigate to receive')}
            data-testid="button-receive"
          >
            <ArrowDownLeft className="h-5 w-5 mr-2" />
            Receive
          </Button>
        </div>

        <div>
          <h2 className="text-sm font-medium mb-4">Recent Activity</h2>
          <TransactionList 
            transactions={transactions}
            onTransactionClick={(tx) => console.log('Transaction clicked:', tx)}
          />
        </div>
      </main>
    </div>
  );
}
