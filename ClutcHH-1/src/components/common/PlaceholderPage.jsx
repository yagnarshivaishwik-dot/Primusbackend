import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import PageHeader from '@/components/layout/PageHeader';
import { Button, Card } from './index';

export default function PlaceholderPage({
  title,
  subtitle,
  description,
  backTo,
  children,
}) {
  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#1a1a2e', color: '#E5E7EB' }}>
      <PageHeader title={title} subtitle={subtitle} backTo={backTo} />
      <div style={{ padding: '12px 32px 32px', maxWidth: 1200 }}>
        {description && (
          <Card className="cc-card" style={{ marginBottom: 20 }}>
            <p style={{ color: '#9CA3AF', lineHeight: 1.6, margin: 0 }}>{description}</p>
          </Card>
        )}
        {children}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <Link to={ROUTES.home} style={{ textDecoration: 'none' }}>
            <Button variant="ghost">Back to Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
