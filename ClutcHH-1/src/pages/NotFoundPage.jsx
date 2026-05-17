import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import { Button } from '@/components/common';

export default function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        background: '#1a1a2e',
        color: '#E5E7EB',
        textAlign: 'center',
        padding: 32,
      }}
    >
      <div style={{ fontSize: 96, fontWeight: 800, color: '#E8364F', lineHeight: 1 }}>404</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>
        This page doesn't exist
      </h1>
      <p style={{ color: '#9CA3AF', maxWidth: 440, margin: 0 }}>
        The URL you tried isn't part of NoLag. Head back home or check the sidebar.
        The URL you tried isn't part of ClutcHH. Head back home or check the sidebar.
      </p>
      <Link to={ROUTES.home} style={{ textDecoration: 'none' }}>
        <Button>Take me home</Button>
      </Link>
    </div>
  );
}
