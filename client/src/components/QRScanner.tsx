import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X } from 'lucide-react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);
  const qrRegionId = 'qr-reader';

  useEffect(() => {
    const startScanner = async () => {
      try {
        const html5QrCode = new Html5Qrcode(qrRegionId);
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          async (decodedText) => {
            // Prevent duplicate scans
            if (hasScannedRef.current) {
              return;
            }
            
            hasScannedRef.current = true;
            
            // Stop scanner immediately to prevent further scans
            await stopScanner();
            
            // Notify parent component and close scanner
            onScan(decodedText);
            onClose();
          },
          () => {
            // Scan error callback - ignore individual scan failures
          }
        );

        setIsScanning(true);
      } catch (err: any) {
        console.error('Scanner error:', err);
        
        // Provide user-friendly error messages
        let errorMessage = 'Failed to start camera';
        
        if (err.message?.includes('NotAllowedError') || err.message?.includes('Permission')) {
          errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
        } else if (err.message?.includes('NotFoundError') || err.message?.includes('NotReadableError')) {
          errorMessage = 'No camera found or camera is already in use by another application.';
        } else if (err.message?.includes('NotSupportedError')) {
          errorMessage = 'Camera not supported in this browser. Try using Chrome, Safari, or Firefox.';
        } else if (err.message?.includes('OverconstrainedError')) {
          errorMessage = 'Could not find a suitable camera. Try using the rear camera.';
        }
        
        setError(errorMessage);
      }
    };

    startScanner();

    return () => {
      stopScanner();
    };
  }, []);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
        setIsScanning(false);
        hasScannedRef.current = false;
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-background/95 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Scan QR Code</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            data-testid="button-close-scanner"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <Card className="p-4">
          {error ? (
            <div className="text-center py-8">
              <p className="text-destructive mb-4">{error}</p>
              <p className="text-sm text-muted-foreground">
                Please ensure camera permissions are granted
              </p>
            </div>
          ) : (
            <div id={qrRegionId} className="w-full" />
          )}
        </Card>

        <p className="text-sm text-muted-foreground text-center">
          Position the QR code within the frame
        </p>
      </div>
    </div>
  );
}
