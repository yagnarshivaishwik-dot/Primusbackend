import { cn } from '@/utils/cn';
import './common.css';

export default function Card({ title, subtitle, className, children, ...props }) {
  return (
    <div className={cn('cc-card', className)} {...props}>
      {title && <div className="cc-card__title">{title}</div>}
      {subtitle && <div className="cc-card__sub">{subtitle}</div>}
      {children}
    </div>
  );
}
