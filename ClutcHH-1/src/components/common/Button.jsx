import { cn } from '@/utils/cn';
import './common.css';

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}) {
  const variantClass =
    variant === 'ghost' ? 'btn--ghost' : variant === 'secondary' ? 'btn--secondary' : '';
  const sizeClass = size === 'sm' ? 'btn--sm' : size === 'lg' ? 'btn--lg' : '';

  return (
    <button className={cn('btn', variantClass, sizeClass, className)} {...props}>
      {children}
    </button>
  );
}
