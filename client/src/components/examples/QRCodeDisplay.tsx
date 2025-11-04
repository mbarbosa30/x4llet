import QRCodeDisplay from '../QRCodeDisplay';

export default function QRCodeDisplayExample() {
  return (
    <div className="flex items-center justify-center p-8">
      <QRCodeDisplay value="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" size={256} />
    </div>
  );
}
