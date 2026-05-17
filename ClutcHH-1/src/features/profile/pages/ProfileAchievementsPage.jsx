import { ComingSoonPage } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';

export default function ProfileAchievementsPage() {
  return (
    <ComingSoonPage
      title="Achievements"
      subtitle="Badges earned"
      backTo={ROUTES.mainProfile}
      summary="Achievements rely on the quests/events system, which is active but per-user badge tracking is not yet exposed in the backend."
    />
  );
}
