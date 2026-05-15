import { ComingSoonPage } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';

export default function ProfileFriendsPage() {
  return (
    <ComingSoonPage
      title="Friends"
      subtitle="Squad up"
      backTo={ROUTES.mainProfile}
      summary="Social graph (friends, presence, squad invites) is not implemented in the Primus backend yet. This page will light up once those endpoints ship."
    />
  );
}
