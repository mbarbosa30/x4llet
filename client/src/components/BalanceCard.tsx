import { Card } from '@/components/ui/card';

interface BalanceCardProps {
  balance: string;
  currency: string;
  fiatValue?: string;
  fiatCurrency?: string;
}

export default function BalanceCard({ 
  balance, 
  currency, 
  fiatValue, 
  fiatCurrency = 'USD' 
}: BalanceCardProps) {
  return (
    <Card className="p-8 text-center" data-testid="card-balance">
      <div className="text-sm text-muted-foreground mb-2">{currency} Balance</div>
      <div className="text-5xl font-medium tabular-nums mb-2" data-testid="text-balance">
        {balance}
      </div>
      {fiatValue && (
        <div className="text-sm text-muted-foreground" data-testid="text-fiat-value">
          ≈ {fiatCurrency} {fiatValue}
        </div>
      )}
    </Card>
  );
}
