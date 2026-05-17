import { Link } from 'react-router-dom';

export default function PageHeader({ title, subtitle, backTo, actions }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '28px 32px 12px',
        color: '#E5E7EB',
      }}
    >
      <div>
        {backTo && (
          <Link
            to={backTo}
            style={{
              fontSize: 12,
              color: '#9CA3AF',
              textDecoration: 'none',
              display: 'inline-block',
              marginBottom: 6,
            }}
          >
            ← Back
          </Link>
        )}
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>{title}</h1>
        {subtitle && (
          <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 4 }}>{subtitle}</p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10 }}>{actions}</div>}
    </header>
  );
}
