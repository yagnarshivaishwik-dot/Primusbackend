import { ComingSoonPage } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';

export default function ArcadePage() {
  return (
    <ComingSoonPage
      title="Arcade"
      subtitle="Classic games, instant play"
      backTo={ROUTES.home}
      summary="Browser-based arcade classics are on the roadmap. There's no backend catalog for them yet — once it's live this page will show real tiles with leaderboards."
      bullets={[
        'Requires a /api/v1/arcade/ endpoint (not yet implemented in the Primus backend)',
        'Will feature: game catalog, per-user best scores, global leaderboards',
      ]}
    />
  );
}
