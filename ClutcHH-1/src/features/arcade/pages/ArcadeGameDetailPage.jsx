import { useParams } from 'react-router-dom';
import { ComingSoonPage } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';

export default function ArcadeGameDetailPage() {
  const { id } = useParams();
  const name = String(id || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <ComingSoonPage
      title={name}
      subtitle="Arcade classic"
      backTo={ROUTES.mainArcade}
      summary="Individual arcade game pages are pending backend support."
    />
  );
}
