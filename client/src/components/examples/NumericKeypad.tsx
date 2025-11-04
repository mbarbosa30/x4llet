import NumericKeypad from '../NumericKeypad';

export default function NumericKeypadExample() {
  return (
    <NumericKeypad 
      onNumberClick={(num) => console.log('Number clicked:', num)}
      onBackspace={() => console.log('Backspace clicked')}
      onDecimal={() => console.log('Decimal clicked')}
    />
  );
}
