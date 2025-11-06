import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Shield, Scan } from 'lucide-react';
import { getWallet, getPrivateKey } from '@/lib/wallet';
import { getMaxFlowScore, getCurrentEpoch, getNextNonce, submitVouch } from '@/lib/maxflow';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { useToast } from '@/hooks/use-toast';
import QRScanner from '@/components/QRScanner';
import Footer from '@/components/Footer';

export default function Signal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [address, setAddress] = useState<string | null>(null);
  const [showVouchInput, setShowVouchInput] = useState(false);
  const [vouchAddress, setVouchAddress] = useState('');
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

  const { data: scoreData, isLoading } = useQuery({
    queryKey: ['/maxflow/score', address],
    queryFn: () => getMaxFlowScore(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const vouchMutation = useMutation({
    mutationFn: async (endorseeAddress: string) => {
      if (!address) throw new Error('No wallet found');
      
      const privateKey = await getPrivateKey();
      if (!privateKey) throw new Error('No private key found');
      
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      
      // Get epoch and nonce
      const epoch = await getCurrentEpoch();
      const nonce = await getNextNonce(address, epoch.epochId);
      
      // Prepare EIP-712 message
      const domain = {
        name: 'MaxFlow',
        version: '1',
        chainId: 42220, // Celo
      };

      const types = {
        Endorsement: [
          { name: 'endorser', type: 'address' },
          { name: 'endorsee', type: 'address' },
          { name: 'epoch', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
        ],
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const message = {
        endorser: getAddress(address),
        endorsee: getAddress(endorseeAddress),
        epoch: BigInt(epoch.epochId),
        nonce: BigInt(nonce),
        timestamp: BigInt(timestamp),
      };

      // Sign
      const signature = await account.signTypedData({
        domain,
        types,
        primaryType: 'Endorsement',
        message,
      });

      // Submit vouch
      return submitVouch({
        endorser: message.endorser,
        endorsee: message.endorsee,
        epoch: message.epoch.toString(),
        nonce: message.nonce.toString(),
        timestamp: message.timestamp.toString(),
        sig: signature,
        chainId: 42220,
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Vouch Submitted!",
        description: `Successfully vouched for ${data.endorsement.endorsee.slice(0, 6)}...${data.endorsement.endorsee.slice(-4)}`,
      });
      setVouchAddress('');
      setShowVouchInput(false);
      // Refresh score
      queryClient.invalidateQueries({ queryKey: ['/maxflow/score', address] });
    },
    onError: (error) => {
      toast({
        title: "Vouch Failed",
        description: error instanceof Error ? error.message : "Failed to submit vouch",
        variant: "destructive",
      });
    },
  });

  const handleVouch = () => {
    if (!vouchAddress) return;
    vouchMutation.mutate(vouchAddress);
  };

  const handleScan = (data: string) => {
    // Check if it looks like an Ethereum address
    if (/^0x[a-fA-F0-9]{40}$/.test(data.trim())) {
      setVouchAddress(data.trim());
      setShowScanner(false);
      setShowVouchInput(true);
    } else {
      toast({
        title: "Invalid QR Code",
        description: "Please scan a valid wallet address",
        variant: "destructive",
      });
    }
  };

  const score = scoreData?.localHealth ?? 0;
  const vouchCount = scoreData?.metrics?.acceptedUsers ?? 0;

  return (
    <div className="flex flex-col h-screen max-w-[448px] mx-auto bg-background">
      <header className="flex-shrink-0 flex items-center gap-3 p-4 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation('/home')}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Signal</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <Card className="p-6 space-y-6">
          {!isLoading && score === 0 ? (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <h2 className="text-lg font-semibold mb-2">Build Your Network Signal</h2>
                  <p className="text-sm text-muted-foreground">
                    Your network signal is currently at zero. Here's how to get started.
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-left">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">What is LocalHealth?</h3>
                  <p className="text-sm text-muted-foreground">
                    Your LocalHealth score (0-100) measures your network quality through flow and path redundancy—not just who vouches for you. It's Sybil-resistant by design, using graph algorithms to detect authentic connections.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">How Vouching Works</h3>
                  <p className="text-sm text-muted-foreground">
                    Vouches create network flow between people. Multiple independent paths to trusted contacts matter more than single endorsements. Who you vouch for affects your own score—vouching indiscriminately can reduce your network quality, creating an economic cost to spam vouching.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Get Started</h3>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Share your wallet address with people you trust</li>
                    <li>Ask them to vouch for you on offPay</li>
                    <li>Vouch thoughtfully—it affects your own score</li>
                  </ol>
                </div>

                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">
                    Your address: <span className="font-mono" data-testid="text-user-address">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <Shield className="h-12 w-12 mx-auto text-primary" />
              <div>
                <h2 className="text-sm text-muted-foreground mb-2">Your MaxFlow Score</h2>
                {isLoading ? (
                  <div className="text-4xl font-bold text-foreground">--</div>
                ) : (
                  <div className="text-5xl font-bold text-foreground" data-testid="text-score">
                    {Math.round(score)}
                  </div>
                )}
              </div>
              
              <div className="flex justify-center gap-2">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 w-2 rounded-full ${
                      i < Math.round(score / 10) ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                ))}
              </div>

              {!isLoading && (
                <p className="text-sm text-muted-foreground" data-testid="text-vouch-count">
                  Vouched by {vouchCount} {vouchCount === 1 ? 'person' : 'people'}
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                MaxFlow measures your trust network health through flow-driven computation
              </p>
            </div>
          )}

          {!showVouchInput && (
            <Button
              onClick={() => setShowVouchInput(true)}
              className="w-full"
              size="lg"
              data-testid="button-vouch"
            >
              Vouch for Someone
            </Button>
          )}

          {showVouchInput && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vouch-address">Address to Vouch</Label>
                <div className="flex gap-2">
                  <Input
                    id="vouch-address"
                    placeholder="0x..."
                    value={vouchAddress}
                    onChange={(e) => setVouchAddress(e.target.value)}
                    className="font-mono text-sm flex-1"
                    data-testid="input-vouch-address"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowScanner(true)}
                    data-testid="button-scan"
                  >
                    <Scan className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowVouchInput(false);
                    setVouchAddress('');
                  }}
                  className="flex-1"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleVouch}
                  disabled={!vouchAddress || vouchMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit-vouch"
                >
                  {vouchMutation.isPending ? 'Submitting...' : 'Submit Vouch'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>

      <Footer />

      {showScanner && (
        <QRScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
