import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Card } from '@/components/common';
import { getCenterInfo, getCafe } from '@/features/cafe/services/cafeService';
import { ROUTES } from '@/app/routes/paths';

/**
 * Help page — reads the admin-configured contact info (`center_info`
 * settings category) and cafe record. No mocks: what the admin types is
 * what the user sees.
 */
export default function HelpPage() {
  const [info, setInfo] = useState({});
  const [cafe, setCafe] = useState(null);

  useEffect(() => {
    getCenterInfo().then(setInfo).catch(() => setInfo({}));
    getCafe().then(setCafe).catch(() => setCafe(null));
  }, []);

  const rows = [
    ['Email', info.email || cafe?.email || ''],
    ['Phone', info.phone || cafe?.phone || ''],
    ['Address', info.address || cafe?.location || cafe?.address_line || ''],
    ['Discord', info.discord_link || ''],
    ['Instagram', info.instagram_username ? `@${info.instagram_username}` : ''],
    ['Twitter', info.twitter_url || ''],
    ['YouTube', info.youtube_channel_url || ''],
    ['Twitch', info.twitch_url || ''],
  ].filter(([, v]) => v);

  return (
    <PlaceholderPage title="Help & Contact" subtitle={cafe?.name || ''} backTo={ROUTES.home}>
      <Card>
        {rows.length === 0 ? (
          <div style={{ color: '#9CA3AF' }}>
            Contact info hasn't been configured in the admin panel yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#E5E7EB' }}>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} style={{ borderTop: '1px solid #374151' }}>
                  <td style={{ padding: '10px 12px', color: '#9CA3AF', width: 120 }}>{label}</td>
                  <td style={{ padding: '10px 12px' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div style={{ height: 14 }} />

      <Link to={ROUTES.settingsInstalled} style={{ textDecoration: 'none' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#fff' }}>Installed apps &amp; games</div>
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                Live scan of games, apps and launchers detected on this PC
              </div>
            </div>
            <span style={{ color: '#3ABEFF' }}>→</span>
          </div>
        </Card>
      </Link>
    </PlaceholderPage>
  );
}
