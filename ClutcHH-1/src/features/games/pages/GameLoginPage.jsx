import { ComingSoonPage } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';

export default function GameLoginPage() {
  return (
    <ComingSoonPage
      title="Game Login"
      subtitle="Per-game credential sign-in"
      backTo={ROUTES.mainGames}
      summary="Stored per-game credentials (e.g. Steam / Epic account vault) is not implemented yet. Games currently launch with the native launcher's own sign-in."
    />
  );
}
