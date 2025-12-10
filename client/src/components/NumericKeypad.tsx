import { Delete } from "lucide-react";

interface NumericKeypadProps {
  onNumberClick: (num: string) => void;
  onBackspace: () => void;
  onDecimal?: () => void;
  disabled?: boolean;
}

export default function NumericKeypad({ 
  onNumberClick, 
  onBackspace, 
  onDecimal,
  disabled = false 
}: NumericKeypadProps) {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'del'],
  ];

  return (
    <div className="border border-foreground/10 w-full max-w-sm mx-auto bg-background">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className={`grid grid-cols-3 ${rowIndex < 3 ? 'border-b border-foreground/10' : ''}`}>
          {row.map((num, colIndex) => (
            <button
              key={num}
              disabled={disabled || (num === '.' && !onDecimal)}
              onClick={() => {
                if (num === 'del') {
                  onBackspace();
                } else if (num === '.' && onDecimal) {
                  onDecimal();
                } else if (num !== '.') {
                  onNumberClick(num);
                }
              }}
              className={`h-12 flex items-center justify-center font-mono text-xl font-bold bg-background hover:bg-muted active:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed ${colIndex < 2 ? 'border-r border-foreground/10' : ''}`}
              data-testid={`keypad-${num}`}
            >
              {num === 'del' ? <Delete className="h-5 w-5" /> : num}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
