import { cn } from '@/utils/cn';
import './common.css';

export default function Badge({ tone = 'primary', className, children, ...props }) {
  const toneClass =
    tone === 'muted' ? 'cc-badge--muted'
    : tone === 'success' ? 'cc-badge--success'
    : tone === 'warning' ? 'cc-badge--warning'
    : tone === 'info' ? 'cc-badge--info'
    : '';
  return (
    <span className={cn('cc-badge', toneClass, className)} {...props}>
      {children}
    </span>
  );
}
