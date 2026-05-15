export default function HeroBanner({ title, subtitle, cta, onCta }) {
  return (
    <section style={{ padding: '40px 32px', background: 'linear-gradient(135deg, #E8364F, #7c3aed)', borderRadius: 16, color: '#fff' }}>
      <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0 }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 16, opacity: 0.9, marginTop: 8 }}>{subtitle}</p>}
      {cta && (
        <button
          onClick={onCta}
          style={{ marginTop: 20, padding: '12px 24px', borderRadius: 10, background: '#fff', color: '#1a1a2e', border: 0, fontWeight: 700, cursor: 'pointer' }}
        >
          {cta}
        </button>
      )}
    </section>
  );
}
