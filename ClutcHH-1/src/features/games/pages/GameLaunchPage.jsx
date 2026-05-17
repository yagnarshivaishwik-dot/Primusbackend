import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Card } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';

/**
 * Transient launch screen shown after the native host is told to launch a
 * game. Auto-returns to the Games page after a few seconds.
 */
export default function GameLaunchPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const name = params.get('game') || 'your game';

  useEffect(() => {
    const t = window.setTimeout(() => navigate(ROUTES.mainGames, { replace: true }), 4000);
    return () => window.clearTimeout(t);
  }, [navigate]);

  return (
    <PlaceholderPage title="Launching…" subtitle={name} backTo={ROUTES.mainGames}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid #3ABEFF',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite',
            }}
          />
          <div style={{ color: '#E5E7EB' }}>
            Opening {name}… keep this window open for session tracking.
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </Card>
    </PlaceholderPage>
  );
}
