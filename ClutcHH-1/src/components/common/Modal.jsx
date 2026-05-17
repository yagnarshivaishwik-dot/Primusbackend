import { useEffect } from 'react';
import Button from './Button';
import './common.css';

export default function Modal({ open, title, children, onClose, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="cc-modal__overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
        {title && <div className="cc-modal__title">{title}</div>}
        <div className="cc-modal__body">{children}</div>
        <div className="cc-modal__actions">
          {footer ?? (
            <Button variant="ghost" onClick={onClose}>Close</Button>
          )}
        </div>
      </div>
    </div>
  );
}
