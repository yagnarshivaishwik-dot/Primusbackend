import { ComingSoonPage } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';

export default function ProfileStatsPage() {
  return (
    <ComingSoonPage
      title="Stats"
      subtitle="Your performance at ClutcHH"
      backTo={ROUTES.mainProfile}
      summary="Per-user play stats aren't aggregated server-side yet. Once the analytics pipeline exposes a per-user view, hours/K-D/win-rate will appear here automatically."
      bullets={[
        'Needs /api/v1/analytics/users/{me} (the cafe-wide summary exists, per-user does not)',
        'Data will include: hours played, matches, win rate, current/best streak',
      ]}
    />
  );
}
