import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Card } from '@/components/ui/card';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
}

export default function QRCodeDisplay({ value, size = 256 }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    }
  }, [value, size]);

  return (
    <Card className="p-4 inline-flex items-center justify-center bg-white">
      <canvas ref={canvasRef} data-testid="qr-canvas" />
    </Card>
  );
}
