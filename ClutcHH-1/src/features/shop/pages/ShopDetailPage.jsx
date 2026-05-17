import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Button, Card } from '@/components/common';
import { shopService } from '@/features/shop/services/shopService';
import { invoke, hasBridge } from '@/app/bridge/invoke';
import useSessionStore from '@/app/store/useSessionStore';
import { ROUTES } from '@/app/routes/paths';

export default function ShopDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let cancelled = false;
    shopService.byId(id).then((p) => {
      if (cancelled) return;
      setPack(p);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const handleBuy = async () => {
    if (!pack || purchasing) return;
    if (!user?.id) {
      setFeedback({ type: 'error', text: 'Sign in before purchasing.' });
      return;
    }
    let pcId = null;
    if (hasBridge()) {
      try {
        const creds = await invoke('get_device_credentials');
        pcId = creds?.pc_id ?? null;
      } catch {/* ignore */}
    }
    if (!pcId) {
      setFeedback({ type: 'error', text: 'Kiosk device not registered.' });
      return;
    }
    setPurchasing(true);
    setFeedback(null);
    try {
      await shopService.purchase({ packId: pack.id, pcId, userId: user.id });
      setFeedback({ type: 'ok', text: 'Order placed. Wait for staff confirmation.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message || 'Purchase failed.' });
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return <PlaceholderPage title="Loading…" backTo={ROUTES.mainShop}><Card /></PlaceholderPage>;
  }
  if (!pack) {
    return (
      <PlaceholderPage title="Pack not found" backTo={ROUTES.mainShop}>
        <Card>
          <div style={{ color: '#9CA3AF' }}>
            This pack is no longer available.
          </div>
          <Button onClick={() => navigate(ROUTES.mainShop)}>Back to shop</Button>
        </Card>
      </PlaceholderPage>
    );
  }

  return (
    <PlaceholderPage title={pack.name} subtitle={`${pack.minutes} minutes`} backTo={ROUTES.mainShop}>
      <Card>
        {pack.description && (
          <div style={{ color: '#9CA3AF', marginBottom: 14, lineHeight: 1.55 }}>
            {pack.description}
          </div>
        )}
        <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 14 }}>
          ₹ {Number(pack.priceRupees || pack.price || 0).toLocaleString()}
        </div>
        {feedback && (
          <div
            role="status"
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
              background: feedback.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              border: `1px solid ${feedback.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
              color: feedback.type === 'error' ? '#fca5a5' : '#86efac',
            }}
          >
            {feedback.text}
          </div>
        )}
        <Button onClick={handleBuy} disabled={purchasing}>
          {purchasing ? 'Placing order…' : 'Place Order'}
        </Button>
      </Card>
    </PlaceholderPage>
  );
}
