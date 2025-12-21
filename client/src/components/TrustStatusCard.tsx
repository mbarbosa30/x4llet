import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, UserCheck, Users, AlertTriangle, CheckCircle, XCircle, ChevronRight, Gift, Sparkles } from 'lucide-react';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'wouter';

interface TrustStatusCardProps {
  address: string | null;
  onFaceVerify?: () => void;
  compact?: boolean;
}

export function TrustStatusCard({ address, onFaceVerify, compact = false }: TrustStatusCardProps) {
  const { data: profile, isLoading } = useTrustProfile(address);

  if (!address) return null;

  if (isLoading) {
    return (
      <Card data-testid="card-trust-status-loading">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Trust Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!profile) return null;

  const getSybilStatusDisplay = () => {
    switch (profile.sybil.tier) {
      case 'clear':
        return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950', label: 'Verified', badge: 'default' as const };
      case 'warn':
        return { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950', label: 'Limited', badge: 'secondary' as const };
      case 'limit':
        return { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950', label: 'Restricted', badge: 'secondary' as const };
      case 'block':
        return { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950', label: 'Blocked', badge: 'destructive' as const };
      default:
        return { icon: Shield, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Unknown', badge: 'secondary' as const };
    }
  };

  const getMaxflowTierDisplay = () => {
    switch (profile.maxflow.tier) {
      case 'verified':
        return { color: 'text-green-600', label: 'Verified', badge: 'default' as const };
      case 'trusted':
        return { color: 'text-blue-600', label: 'Trusted', badge: 'default' as const };
      case 'standard':
        return { color: 'text-muted-foreground', label: 'Standard', badge: 'secondary' as const };
      case 'new':
      default:
        return { color: 'text-muted-foreground', label: 'New', badge: 'outline' as const };
    }
  };

  const sybilStatus = getSybilStatusDisplay();
  const maxflowTier = getMaxflowTierDisplay();
  const SybilIcon = sybilStatus.icon;

  if (compact) {
    return (
      <Card data-testid="card-trust-status-compact">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${sybilStatus.bg}`}>
                <SybilIcon className={`h-4 w-4 ${sybilStatus.color}`} />
              </div>
              <div>
                <div className="font-medium text-sm">Trust Status</div>
                <div className="text-xs text-muted-foreground">
                  {profile.localFace.enrolled ? 'Face verified' : 'Face not verified'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={sybilStatus.badge} data-testid="badge-sybil-tier">
                {sybilStatus.label}
              </Badge>
              {!profile.localFace.enrolled && onFaceVerify && (
                <Button size="sm" variant="outline" onClick={onFaceVerify} data-testid="button-verify-face-compact">
                  Verify
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-trust-status">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Trust & Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {profile.limits.pendingFaceXp > 0 && (
          <Link href="/trust">
            <div className="p-4 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border border-amber-200 dark:border-amber-800 cursor-pointer hover-elevate" data-testid="banner-pending-xp">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900">
                  <Gift className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {profile.limits.pendingFaceXp} XP waiting!
                  </div>
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    Vouch for a friend or whoever invited you to claim it
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </Link>
        )}

        <div className="flex items-center justify-between p-3 rounded-lg border" data-testid="row-sybil-status">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${sybilStatus.bg}`}>
              <SybilIcon className={`h-4 w-4 ${sybilStatus.color}`} />
            </div>
            <div>
              <div className="font-medium text-sm">Device Status</div>
              <div className="text-xs text-muted-foreground">
                {profile.sybil.tier === 'clear' 
                  ? 'No suspicious activity detected'
                  : profile.sybil.signals.length > 0 
                    ? profile.sybil.signals[0]
                    : 'Activity under review'}
              </div>
            </div>
          </div>
          <Badge variant={sybilStatus.badge}>{sybilStatus.label}</Badge>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border" data-testid="row-face-status">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${profile.localFace.enrolled ? 'bg-green-50 dark:bg-green-950' : 'bg-muted'}`}>
              <UserCheck className={`h-4 w-4 ${profile.localFace.enrolled ? 'text-green-600' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <div className="font-medium text-sm">Face Verification</div>
              <div className="text-xs text-muted-foreground">
                {profile.localFace.enrolled 
                  ? 'Enrolled for USDC redemptions'
                  : 'Required to redeem XP for USDC'}
              </div>
            </div>
          </div>
          {profile.localFace.enrolled ? (
            <Badge variant="default">Verified</Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={onFaceVerify} data-testid="button-verify-face">
              Verify
            </Button>
          )}
        </div>

        <Link href="/trust">
          <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid="row-maxflow-status">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${profile.maxflow.tier !== 'new' ? 'bg-blue-50 dark:bg-blue-950' : 'bg-muted'}`}>
                <Users className={`h-4 w-4 ${profile.maxflow.tier !== 'new' ? 'text-blue-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <div className="font-medium text-sm">Reputation</div>
                <div className="text-xs text-muted-foreground">
                  {profile.maxflow.vouches} {profile.maxflow.vouches === 1 ? 'vouch' : 'vouches'} received
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={maxflowTier.badge}>{maxflowTier.label}</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </Link>

        {profile.limits.usdcBlockReason && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg" data-testid="text-block-reason">
            {profile.limits.usdcBlockReason}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
