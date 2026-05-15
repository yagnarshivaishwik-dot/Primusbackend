import { Card } from '@/components/common';

export default function FeedSection({ title, items = [] }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 20, color: '#fff', marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {items.map((item, i) => (
          <Card key={i} title={item.title} subtitle={item.subtitle} />
        ))}
      </div>
    </section>
  );
}
