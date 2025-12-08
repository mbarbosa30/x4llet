import { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatAmount } from '@/lib/formatAmount';

export interface Transaction {
  id: string;
  type: 'send' | 'receive';
  address: string;
  amount: string;
  timestamp: string;
  status?: 'pending' | 'completed' | 'failed';
  fiatAmount?: string;
  fiatCurrency?: string;
  chainId?: number;
}

interface TransactionListProps {
  transactions: Transaction[];
  onTransactionClick?: (tx: Transaction) => void;
}

export default function TransactionList({ transactions, onTransactionClick }: TransactionListProps) {
  const [showAll, setShowAll] = useState(false);
  
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="text-no-transactions">
        No transactions yet
      </div>
    );
  }

  const displayedTransactions = showAll ? transactions : transactions.slice(0, 10);
  const hasMore = transactions.length > 10;

  return (
    <div className="space-y-0">
      {displayedTransactions.map((tx, index) => (
        <div
          key={tx.id}
          onClick={() => onTransactionClick?.(tx)}
          className={`flex items-center gap-4 py-4 ${
            index !== displayedTransactions.length - 1 ? 'border-b' : ''
          } ${onTransactionClick ? 'hover-elevate cursor-pointer' : ''}`}
          data-testid={`transaction-item-${tx.id}`}
        >
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            tx.type === 'send' ? 'bg-muted' : 'bg-primary/10'
          }`}>
            {tx.type === 'send' ? (
              <ArrowUpRight className="h-5 w-5 text-foreground" />
            ) : (
              <ArrowDownLeft className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">
                {tx.type === 'send' ? 'Sent to' : 'Received from'}
              </div>
              {tx.chainId && (
                <Badge 
                  variant="outline" 
                  className={`text-[10px] px-1.5 py-0 h-4 border-0 ${
                    tx.chainId === 8453 
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' 
                      : tx.chainId === 100 
                        ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400' 
                        : tx.chainId === 42161
                          ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                          : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                  }`}
                  data-testid={`badge-chain-${tx.chainId === 8453 ? 'base' : tx.chainId === 100 ? 'gnosis' : tx.chainId === 42161 ? 'arbitrum' : 'celo'}`}
                >
                  {tx.chainId === 8453 ? 'Base' : tx.chainId === 100 ? 'Gnosis' : tx.chainId === 42161 ? 'Arbitrum' : 'Celo'}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-mono truncate">
              {tx.address.slice(0, 6)}...{tx.address.slice(-4)} • {formatTime(tx.timestamp)}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`text-sm font-medium tabular-nums ${
              tx.type === 'send' ? 'text-foreground' : 'text-primary'
            }`}>
              {tx.type === 'send' ? '-' : '+'}{formatAmount(tx.amount)}
            </div>
            {tx.fiatAmount && tx.fiatCurrency && (
              <div className="text-xs text-muted-foreground tabular-nums">
                ≈ {tx.fiatAmount} {tx.fiatCurrency}
              </div>
            )}
          </div>
        </div>
      ))}
      
      {hasMore && (
        <div className="pt-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowAll(!showAll)}
            data-testid="button-toggle-transactions"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show All ({transactions.length} total)
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
