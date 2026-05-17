import { cn } from '@/utils/cn';
import './common.css';

export default function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('cc-tabs', className)} role="tablist">
      {tabs.map((tab) => {
        const key = typeof tab === 'string' ? tab : tab.value;
        const label = typeof tab === 'string' ? tab : tab.label;
        const isActive = value === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            className={cn('cc-tab', isActive && 'cc-tab--active')}
            onClick={() => onChange?.(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
