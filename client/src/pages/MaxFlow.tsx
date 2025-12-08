import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Scan, Shield, Loader2 } from 'lucide-react';
import { getWallet, getPrivateKey } from '@/lib/wallet';
import { getMaxFlowScore, getCurrentEpoch, getNextNonce, submitVouch } from '@/lib/maxflow';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { useToast } from '@/hooks/use-toast';
import QRScanner from '@/components/QRScanner';

export default function MaxFlow() {
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

  const { data: scoreData, isLoading: isLoadingMaxFlow } = useQuery({
    queryKey: ['/maxflow/score', address],
    queryFn: () => getMaxFlowScore(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  const vouchMutation = useMutation({
    mutationFn: async (endorsedAddress: string) => {
      if (!address) throw new Error('No wallet found');
      
      const privateKey = await getPrivateKey();
      if (!privateKey) throw new Error('No private key found');
      
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      
      const validatedEndorser = getAddress(address);
      const validatedEndorsed = getAddress(endorsedAddress);
      
      const epoch = await getCurrentEpoch();
      const nonce = await getNextNonce(validatedEndorser.toLowerCase(), epoch.epochId);
      
      const chainId = 42220;
      
      const domain = {
        name: 'MaxFlow',
        version: '1',
        chainId: chainId,
      };

      const types = {
        Endorsement: [
          { name: 'endorser', type: 'address' },
          { name: 'endorsee', type: 'address' },
          { name: 'epoch', type: 'uint64' },
          { name: 'nonce', type: 'uint64' },
        ],
      };

      const message = {
        endorser: validatedEndorser.toLowerCase(),
        endorsee: validatedEndorsed.toLowerCase(),
        epoch: BigInt(epoch.epochId),
        nonce: BigInt(nonce),
      };

      const signature = await account.signTypedData({
        domain,
        types,
        primaryType: 'Endorsement',
        message,
      });

      return submitVouch({
        endorsement: {
          endorser: message.endorser,
          endorsee: message.endorsee,
          epoch: message.epoch.toString(),
          nonce: message.nonce.toString(),
          sig: signature,
          chainId: chainId,
        },
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Vouch submitted",
        description: `You vouched for ${vouchAddress.slice(0, 6)}...${vouchAddress.slice(-4)}`,
      });
      setVouchAddress('');
      setShowVouchInput(false);
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
    if (/^0x[a-fA-F0-9]{40}$/.test(data.trim())) {
      const scannedAddress = data.trim();
      setShowScanner(false);
      setVouchAddress(scannedAddress);
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

  if (!address) {
    return (
      <div 
        className="min-h-screen bg-background flex items-center justify-center"
        style={{ 
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
        }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
      }}
    >
      {showScanner && (
        <QRScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      <main className="max-w-md mx-auto p-4 space-y-4">
        <Card className="p-6 space-y-6">
          {!isLoadingMaxFlow && score === 0 ? (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <h2 className="text-lg font-bold font-heading mb-2">Build Your Network Signal</h2>
                  <p className="text-sm text-muted-foreground">
                    Your network signal is currently at zero. Here's how to get started.
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-left">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground/80">What is Network Signal?</h3>
                  <p className="text-sm text-muted-foreground">
                    Network signal measures your trust network health through max flow computation. It's not a reputation score — it's based on how well you're connected through authentic vouches.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground/80">How Vouching Works</h3>
                  <p className="text-sm text-muted-foreground">
                    When someone vouches for you, they add you to their trust network. But here's the key: <strong>who you vouch for affects your own score</strong>. Vouching indiscriminately dilutes your network quality, so vouch thoughtfully.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-foreground/80">Get Started</h3>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Share your address with people you trust</li>
                    <li>Ask them to vouch for you on nanoPay</li>
                    <li>Vouch for others carefully — it impacts your score</li>
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
              <div>
                <h2 className="text-sm text-muted-foreground mb-2">Your MaxFlow Score</h2>
                {isLoadingMaxFlow ? (
                  <div className="text-4xl font-bold text-foreground tracking-tight">--</div>
                ) : (
                  <div className="text-5xl font-bold tabular-nums text-foreground tracking-tight" data-testid="text-score">
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

              {!isLoadingMaxFlow && (
                <p className="text-sm text-muted-foreground" data-testid="text-vouch-count">
                  Vouched by {vouchCount} {vouchCount === 1 ? 'person' : 'people'}
                </p>
              )}

              {!isLoadingMaxFlow && scoreData?.metrics && (
                <div className="pt-4 border-t space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Your Network Metrics</h3>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div className="flex justify-between items-center" data-testid="metric-redundancy">
                      <span className="text-muted-foreground">Path Redundancy</span>
                      <span className="font-mono font-medium">{scoreData.metrics.medianMinCut.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center" data-testid="metric-maxflow">
                      <span className="text-muted-foreground">Maximum Flow</span>
                      <span className="font-mono font-medium">{scoreData.metrics.maxPossibleFlow.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center" data-testid="metric-residual">
                      <span className="text-muted-foreground">Average Residual</span>
                      <span className="font-mono font-medium">{scoreData.metrics.avgResidualFlow.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                This score is a sybil-resistant neutral graph signal of your trust-network health.
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
                    data-testid="button-scan-vouch"
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
                  data-testid="button-cancel-vouch"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleVouch}
                  disabled={!vouchAddress || vouchMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit-vouch"
                >
                  {vouchMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : 'Submit Vouch'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="pt-6 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <a 
              href="https://maxflow.one" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#0055FF] hover:underline"
            >
              MaxFlow.one
            </a>{' '}
            is a neutral reputation infrastructure that converts public binary endorsements ("vouches") into verifiable graph signals using max-flow/min-cut algorithms and recursive trust weighting. It computes mathematical signals that applications interpret according to their own policies—for creditworthiness, governance weight, access control, or grant allocation.
          </p>
          <a 
            href="https://maxflow.one/whitepaper" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block text-xs text-[#0055FF] hover:underline font-medium"
            data-testid="link-whitepaper"
          >
            Read the Whitepaper →
          </a>
        </div>
      </main>
    </div>
  );
}
