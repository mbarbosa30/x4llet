import { Button } from "@/components/ui/button";
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
  const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

  return (
    <div className="grid grid-cols-3 gap-2 w-full max-w-sm mx-auto">
      {numbers.map((num) => (
        <Button
          key={num}
          variant="outline"
          size="lg"
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
          className="h-16 text-lg font-medium"
          data-testid={`keypad-${num}`}
        >
          {num === 'del' ? <Delete className="h-5 w-5" /> : num}
        </Button>
      ))}
    </div>
  );
}
