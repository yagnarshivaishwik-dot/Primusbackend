import PlaceholderPage from './PlaceholderPage';
import { Card } from './index';
import { ROUTES } from '@/app/routes/paths';

/**
 * Honest "not-yet-wired" page shown where a feature exists in the UI nav
 * but has no backend implementation yet. Not a dead-end — still has a
 * back-link, and the copy is specific about what's missing.
 */
export default function ComingSoonPage({
  title,
  subtitle = 'Coming soon',
  summary,
  bullets,
  backTo = ROUTES.home,
}) {
  return (
    <PlaceholderPage title={title} subtitle={subtitle} backTo={backTo}>
      <Card>
        <div style={{ fontSize: 15, color: '#E5E7EB', lineHeight: 1.55 }}>
          {summary ||
            'This screen is part of the ClutcHH roadmap but is not yet connected to a backend. Once an admin configures the matching feature it will show up here live.'}
        </div>
        {Array.isArray(bullets) && bullets.length > 0 && (
          <ul style={{ marginTop: 14, color: '#9CA3AF', fontSize: 13, lineHeight: 1.8 }}>
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
      </Card>
    </PlaceholderPage>
  );
}
