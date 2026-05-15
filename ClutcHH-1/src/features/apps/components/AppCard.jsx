import { Card } from '@/components/common';

export default function AppCard({ app }) {
  return (
    <Card>
      <div style={{ fontSize: 36, marginBottom: 8 }}>{app.icon}</div>
      <div style={{ fontWeight: 700, color: '#fff' }}>{app.name}</div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{app.category}</div>
    </Card>
  );
}
