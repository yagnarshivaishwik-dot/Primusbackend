import './common.css';

export default function Loader({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#9CA3AF' }}
    >
      <span className="cc-loader" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
