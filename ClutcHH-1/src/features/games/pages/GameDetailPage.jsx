import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Badge, Button, Card } from '@/components/common';
import { gamesService, launch as launchGame } from '@/features/games/services/gamesService';
import { ROUTES } from '@/app/routes/paths';

export default function GameDetailPage() {
  const { id } = useParams();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    gamesService
      .byId(id)
      .then((g) => {
        if (!cancelled) setGame(g);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleLaunch = async () => {
    if (!game || launching) return;
    setError(null);
    setLaunching(true);
    try {
      await launchGame(game);
    } catch (err) {
      setError(err?.message || 'Launch failed.');
    } finally {
      setLaunching(false);
    }
  };

  if (loading) {
    return (
      <PlaceholderPage title="Loading…" backTo={ROUTES.mainGames}>
        <Card><div style={{ color: '#9CA3AF' }}>Fetching game…</div></Card>
      </PlaceholderPage>
    );
  }

  if (!game) {
    return (
      <PlaceholderPage title="Game not found" backTo={ROUTES.mainGames}>
        <Card>
          <div style={{ color: '#9CA3AF' }}>
            {error || 'This game is no longer in the admin catalog.'}
          </div>
        </Card>
      </PlaceholderPage>
    );
  }

  return (
    <PlaceholderPage title={game.name} subtitle={game.genre} backTo={ROUTES.mainGames}>
      <Card>
        {game.imageBackground && (
          <div
            style={{
              height: 240,
              borderRadius: 12,
              backgroundImage: `url(${game.imageBackground})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              marginBottom: 16,
            }}
          />
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {game.launcher && <Badge tone="info">{game.launcher}</Badge>}
          {game.rating && <Badge tone="muted">Rated {game.rating}</Badge>}
          {game.free && <Badge tone="success">Free to Play</Badge>}
          {game.tags.slice(0, 3).map((t) => (
            <Badge key={t} tone="muted">{t}</Badge>
          ))}
        </div>
        {game.website && (
          <div style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 10 }}>
            Official site:{' '}
            <span style={{ color: '#3ABEFF' }}>{game.website}</span>
          </div>
        )}
        {error && <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={handleLaunch} disabled={launching}>
            {launching ? 'Launching…' : `Launch ${game.launcher ? `via ${game.launcher}` : ''}`.trim()}
          </Button>
        </div>
      </Card>
    </PlaceholderPage>
  );
}
