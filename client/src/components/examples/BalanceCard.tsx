import BalanceCard from '../BalanceCard';

export default function BalanceCardExample() {
  return (
    <div className="max-w-md mx-auto p-4">
      <BalanceCard 
        balance="1,250.00"
        currency="USDC"
        fiatValue="1,250.00"
        fiatCurrency="USD"
      />
    </div>
  );
}
