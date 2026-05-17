import { Link } from 'react-router-dom';
import { Badge, Card } from '@/components/common';
import { buildPath } from '@/app/routes/paths';
import { formatCoins } from '@/utils/format';

export default function ShopItemCard({ item }) {
  return (
    <Link to={buildPath.shop(item.id)} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card>
        <div style={{ fontSize: 48 }}>{item.icon}</div>
        {item.badge && <Badge tone="primary">{item.badge}</Badge>}
        <div style={{ fontWeight: 700, color: '#fff', marginTop: 8 }}>{item.name}</div>
        <div style={{ color: '#9CA3AF', fontSize: 13 }}>{formatCoins(item.price)} coins</div>
      </Card>
    </Link>
  );
}
