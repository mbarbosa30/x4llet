import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Share2, QrCode, Scan } from 'lucide-react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import QRScanner from '@/components/QRScanner';
import AddressDisplay from '@/components/AddressDisplay';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getWallet, getPreferences } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import { getNetworkConfig } from '@shared/networks';
import { apiRequest } from '@/lib/queryClient';
import type { PaymentRequest, AuthorizationQR, TransferResponse } from '@shared/schema';

export default function Receive() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<'base' | 'celo'>('celo');
  const [amount, setAmount] = useState('');
  const [ttl, setTtl] = useState('600');
  const [description, setDescription] = useState('');
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const wallet = await getWallet();
        if (!wallet) {
          setLocation('/');
          return;
        }
        setAddress(wallet.address);
        
        const prefs = await getPreferences();
        setNetwork(prefs.network);
      } catch (error: any) {
        if (error.message === 'RECOVERY_CODE_REQUIRED') {
          setLocation('/unlock');
        } else {
          setLocation('/');
        }
      }
    };
    loadWallet();
  }, [setLocation]);

  const submitAuthMutation = useMutation({
    mutationFn: async (authQR: AuthorizationQR) => {
      const res = await apiRequest('POST', '/api/relay/submit-authorization', {
        authorization: authQR,
        useReceiveWith: true,
      });
      return res.json() as Promise<TransferResponse>;
    },
    onSuccess: (data: TransferResponse) => {
      toast({
        title: "Payment Received!",
        description: `Transaction: ${data.txHash.slice(0, 10)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/balance'] });
      setShowScanner(false);
    },
    onError: (error: any) => {
      toast({
        title: "Payment Failed",
        description: error.message || "Failed to process authorization",
        variant: "destructive",
      });
    },
  });

  const handleGenerateRequest = () => {
    if (!address || !amount) return;
    
    const networkConfig = getNetworkConfig(network);
    const facilitatorUrl = `${window.location.origin}/api/relay/submit-authorization`;
    
    const request: PaymentRequest = {
      v: 1,
      chainId: networkConfig.chainId,
      token: networkConfig.usdcAddress,
      to: address,
      amount: (parseFloat(amount) * 1000000).toString(),
      decimals: 6,
      ttl: parseInt(ttl),
      facilitatorUrl,
      description: description || undefined,
    };
    
    setPaymentRequest(request);
    
    toast({
      title: "Payment Request Created!",
      description: "Show this QR to the payer",
    });
  };

  const handleScanAuthorization = (data: string) => {
    try {
      const authQR: AuthorizationQR = JSON.parse(data);
      
      if (authQR.message.to.toLowerCase() !== address?.toLowerCase()) {
        toast({
          title: "Wrong Recipient",
          description: "This authorization is for a different address",
          variant: "destructive",
        });
        return;
      }
      
      submitAuthMutation.mutate(authQR);
    } catch (error) {
      toast({
        title: "Invalid QR Code",
        description: "Could not parse authorization",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    if (!address) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Wallet Address',
          text: `Send USDC to: ${address}`,
        });
      } catch (err) {
        console.log('Share cancelled or failed:', err);
      }
    } else {
      await navigator.clipboard.writeText(address);
      toast({
        title: "Copied!",
        description: "Address copied to clipboard",
      });
    }
  };

  if (!address) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b flex items-center px-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setLocation('/home')}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold ml-2">Receive USDC</h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        <Tabs defaultValue="simple" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="simple" data-testid="tab-simple">Simple</TabsTrigger>
            <TabsTrigger value="request" data-testid="tab-request">Payment Request</TabsTrigger>
          </TabsList>

          <TabsContent value="simple" className="space-y-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <QRCodeDisplay value={address} size={256} />
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Your Address</div>
                <AddressDisplay address={address} truncate={false} />
              </div>
            </div>

            <Button 
              variant="outline" 
              onClick={handleShare}
              className="w-full"
              data-testid="button-share"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share Address
            </Button>
          </TabsContent>

          <TabsContent value="request" className="space-y-6">
            {!paymentRequest ? (
              <Card className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (USDC)</Label>
                  <Input 
                    id="amount"
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    data-testid="input-request-amount"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ttl">Valid For (seconds)</Label>
                  <Input 
                    id="ttl"
                    type="number"
                    placeholder="600"
                    value={ttl}
                    onChange={(e) => setTtl(e.target.value)}
                    data-testid="input-ttl"
                  />
                  <p className="text-xs text-muted-foreground">
                    How long the payment request is valid
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Input 
                    id="description"
                    type="text"
                    placeholder="Payment for..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    data-testid="input-description"
                  />
                </div>

                <Button 
                  onClick={handleGenerateRequest}
                  disabled={!amount || parseFloat(amount) <= 0}
                  className="w-full"
                  data-testid="button-generate-request"
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Generate Payment Request
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                <Card className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-medium">{(parseInt(paymentRequest.amount) / 1000000).toFixed(2)} USDC</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valid For:</span>
                    <span className="font-medium">{paymentRequest.ttl}s</span>
                  </div>
                  {paymentRequest.description && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Description:</span>
                      <span className="font-medium">{paymentRequest.description}</span>
                    </div>
                  )}
                </Card>

                <div className="text-center space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Show this QR to the payer
                  </div>
                  <div className="flex justify-center">
                    <QRCodeDisplay value={JSON.stringify(paymentRequest)} size={256} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => setPaymentRequest(null)}
                    data-testid="button-new-request"
                  >
                    New Request
                  </Button>
                  <Button 
                    onClick={() => setShowScanner(true)}
                    data-testid="button-scan-auth"
                  >
                    <Scan className="h-4 w-4 mr-2" />
                    Scan Payment
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {!paymentRequest && (
          <div className="text-center">
            <Button 
              variant="outline"
              onClick={() => setShowScanner(true)}
              className="w-full"
              data-testid="button-scan-simple"
            >
              <Scan className="h-4 w-4 mr-2" />
              Scan Authorization QR
            </Button>
          </div>
        )}
      </main>

      {showScanner && (
        <QRScanner
          onScan={handleScanAuthorization}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
