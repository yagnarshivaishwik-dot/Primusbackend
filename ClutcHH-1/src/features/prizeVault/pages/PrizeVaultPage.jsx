import { useEffect, useState } from 'react';

import * as prizesService from '@/features/prizeVault/services/prizesService';
import { homeService } from '@/features/home/services/homeService';
import useWalletStore from '@/app/store/useWalletStore';
import AppHeader from '@/components/layout/AppHeader';

import PrizeCarousel from './PrizeCarousel';
import ChallengeCarousel from './ChallengeCarousel';
import './PrizeVaultPage.css';

/**
 * Rewards page (Pavan's design — `prizeVault` route, "Rewards" label).
 * Splits into two carousels:
 *   - Prizes: redeem coins for real items (data from prizesService).
 *   - Challenges: home-page placeholder quests, exposed here too so the
 *     customer can see and claim them from the Rewards tab as well.
 * Both share the existing `shopcard glassyfinish` visual language.
 */
export default function PrizeVaultPage() {
  const coins = useWalletStore((s) => s.coins);
  const hydrate = useWalletStore((s) => s.hydrate);

  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [redeeming, setRedeeming] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const [claimedKinds, setClaimedKinds] = useState([]);
  const [claimingKind, setClaimingKind] = useState(null);
  const [claimError, setClaimError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await prizesService.list();
        if (!cancelled) setPrizes(list);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load prizes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Pull claim-status so the badge state is consistent with HomePage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await homeService.getClaimStatus();
        if (cancelled) return;
        const already = Object.entries(status || {})
          .filter(([, claimed]) => claimed)
          .map(([kind]) => kind);
        if (already.length > 0) setClaimedKinds(already);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRedeem = async (prize) => {
    if (redeeming) return;
    if (coins != null && coins < prize.coinCost) {
      setFeedback({ type: 'error', text: `Need ${prize.coinCost - coins} more coins.` });
      return;
    }
    setRedeeming(prize.id);
    setFeedback(null);
    try {
      await prizesService.redeem(prize.id);
      setFeedback({ type: 'ok', text: `Redeemed "${prize.name}". Check your notifications.` });
      const list = await prizesService.list();
      setPrizes(list);
      try { await hydrate({}); } catch { /* ignore */ }
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message || 'Redemption failed.' });
    } finally {
      setRedeeming(null);
    }
  };

  const handleClaim = async (kind) => {
    if (!kind || claimingKind) return;
    setClaimError(null);
    setClaimingKind(kind);
    try {
      await homeService.claimPlaceholder(kind);
      setClaimedKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
      try { await hydrate({}); } catch { /* ignore */ }
    } catch (err) {
      if (err?.status === 409) {
        setClaimedKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
      } else {
        setClaimError(err?.message || 'Claim failed.');
      }
    } finally {
      setClaimingKind(null);
    }
  };

  return (
    <div className="prizeVaultContainer">
      <AppHeader />

      <div className="prizeVaultBody">
        <div className="prizeVaultIntro">
          <h1 className="prizeVaultTitle">Rewards</h1>
          <p className="prizeVaultSubtitle">
            {coins != null ? `You have ${coins.toLocaleString()} coins to spend` : 'Redeem coins for real gear'}
          </p>
        </div>

        {(feedback || claimError) && (
          <div
            role="status"
            style={{
              margin: '0 auto 16px',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              maxWidth: 600,
              background: (feedback?.type === 'error' || claimError) ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              border: `1px solid ${(feedback?.type === 'error' || claimError) ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
              color: (feedback?.type === 'error' || claimError) ? '#fca5a5' : '#86efac',
              textAlign: 'center',
            }}
          >
            {feedback?.text || claimError}
          </div>
        )}

        <ChallengeCarousel
          claimedKinds={claimedKinds}
          claimingKind={claimingKind}
          onClaim={handleClaim}
        />

        <PrizeCarousel
          prizes={prizes}
          loading={loading}
          error={error}
          coins={coins}
          redeemingId={redeeming}
          onRedeem={handleRedeem}
        />
      </div>
    </div>
  );
}
