import './common.css';

export default function Toggle({ checked, onChange, label, id }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span className="cc-toggle">
        <input
          id={id}
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="cc-toggle__slider" />
      </span>
      {label && <span style={{ fontSize: 13, color: '#E5E7EB' }}>{label}</span>}
    </label>
  );
}
