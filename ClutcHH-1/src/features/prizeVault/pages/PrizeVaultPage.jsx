import { useEffect, useState } from 'react';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Badge, Button, Card } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';
import * as prizesService from '@/features/prizeVault/services/prizesService';
import useWalletStore from '@/app/store/useWalletStore';

function tierTone(tier) {
  const t = (tier || '').toLowerCase();
  if (t === 'gold') return 'warning';
  if (t === 'silver') return 'muted';
  return 'info';
}

export default function PrizeVaultPage() {
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [redeeming, setRedeeming] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const coins = useWalletStore((s) => s.coins);

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
    return () => {
      cancelled = true;
    };
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
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message || 'Redemption failed.' });
    } finally {
      setRedeeming(null);
    }
  };

  return (
    <PlaceholderPage
      title="Prize Vault"
      subtitle={coins != null ? `Your balance: ${coins.toLocaleString()} coins` : 'Redeem your coins for real gear'}
      backTo={ROUTES.home}
    >
      {feedback && (
        <div
          role="status"
          style={{
            marginBottom: 14,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 13,
            background: feedback.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            border: `1px solid ${feedback.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
            color: feedback.type === 'error' ? '#fca5a5' : '#86efac',
          }}
        >
          {feedback.text}
        </div>
      )}

      {loading && <Card><div style={{ color: '#9CA3AF' }}>Loading prizes…</div></Card>}
      {error && !loading && (
        <Card>
          <div style={{ color: '#fca5a5' }}>{error}</div>
        </Card>
      )}
      {!loading && !error && prizes.length === 0 && (
        <Card>
          <div style={{ color: '#9CA3AF' }}>
            No prizes are configured yet. Ask an admin to add items to the Prize Vault.
          </div>
        </Card>
      )}

      {!loading && !error && prizes.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {prizes.map((p) => {
            const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
            const canAfford = coins == null || coins >= p.coinCost;
            return (
              <Card key={p.id}>
                {p.image && (
                  <img
                    src={p.image}
                    alt=""
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: 120,
                      objectFit: 'cover',
                      borderRadius: 8,
                      marginBottom: 10,
                      background: '#1f2937',
                    }}
                  />
                )}
                <Badge tone={tierTone(p.tier)}>{p.tier.toUpperCase()}</Badge>
                <div style={{ fontWeight: 700, color: '#fff', marginTop: 10 }}>{p.name}</div>
                {p.description && (
                  <div style={{ color: '#9CA3AF', fontSize: 12, margin: '4px 0 8px' }}>
                    {p.description}
                  </div>
                )}
                <div style={{ color: '#9CA3AF', fontSize: 13, margin: '6px 0 12px' }}>
                  🪙 {p.coinCost.toLocaleString()} coins
                  {typeof p.stock === 'number' && (
                    <span style={{ marginLeft: 8, color: outOfStock ? '#fca5a5' : '#9CA3AF' }}>
                      · {outOfStock ? 'Out of stock' : `${p.stock} left`}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  disabled={outOfStock || !canAfford || redeeming === p.id}
                  onClick={() => handleRedeem(p)}
                >
                  {redeeming === p.id
                    ? 'Redeeming…'
                    : outOfStock
                      ? 'Sold Out'
                      : canAfford
                        ? 'Redeem'
                        : 'Need more coins'}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </PlaceholderPage>
  );
}
