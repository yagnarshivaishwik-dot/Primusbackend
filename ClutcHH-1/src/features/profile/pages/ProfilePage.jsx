import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Badge, Button, Card } from '@/components/common';
import useSessionStore from '@/app/store/useSessionStore';
import useWalletStore from '@/app/store/useWalletStore';
import { ROUTES } from '@/app/routes/paths';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, signOut, refreshMe } = useSessionStore();
  const { balance, coins, minutesLeft, hydrate } = useWalletStore();

  useEffect(() => {
    refreshMe();
    hydrate({});
  }, [refreshMe, hydrate]);

  const display = user || { name: 'Guest', email: '', avatar: 'G' };
  const avatar = display.avatar || (display.name || 'U').substring(0, 2).toUpperCase();

  const onSignOut = async () => {
    await signOut();
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <PlaceholderPage title="Profile" subtitle={display.email || 'Signed-in user'} backTo={ROUTES.home}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#E8364F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {avatar}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#fff' }}>{display.name}</div>
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>{display.email}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {display.role && <Badge tone="info">{display.role}</Badge>}
            {minutesLeft > 0 && (
              <Badge tone="success">
                {Math.floor(minutesLeft / 60)}h {minutesLeft % 60}m left
              </Badge>
            )}
          </div>
        </Card>

        <Card title="Wallet" subtitle="Live balance">
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginTop: 10 }}>
            🪙 {(coins ?? 0).toLocaleString()}
          </div>
          <div style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>
            ₹ {Number(balance ?? 0).toLocaleString()} cash balance
          </div>
        </Card>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
          marginTop: 20,
        }}
      >
        <Link to={ROUTES.profileStats} style={{ textDecoration: 'none' }}>
          <Card>
            <strong>Stats</strong>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Hours played, wins</div>
          </Card>
        </Link>
        <Link to={ROUTES.profileAchievements} style={{ textDecoration: 'none' }}>
          <Card>
            <strong>Achievements</strong>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Badges earned</div>
          </Card>
        </Link>
        <Link to={ROUTES.profileFriends} style={{ textDecoration: 'none' }}>
          <Card>
            <strong>Friends</strong>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Squad up</div>
          </Card>
        </Link>
        <Link to={ROUTES.profileEdit} style={{ textDecoration: 'none' }}>
          <Card>
            <strong>Edit Profile</strong>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Change avatar, handle</div>
          </Card>
        </Link>
      </div>

      <div style={{ marginTop: 24 }}>
        <Button variant="ghost" onClick={onSignOut}>
          Sign Out
        </Button>
      </div>
    </PlaceholderPage>
  );
}
