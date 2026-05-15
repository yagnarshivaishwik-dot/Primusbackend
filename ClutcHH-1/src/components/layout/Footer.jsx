import { APP_NAME } from '@/constants/app';

export default function Footer() {
  return (
    <footer
      style={{
        padding: '20px 24px',
        color: '#9CA3AF',
        fontSize: 12,
        textAlign: 'center',
        borderTop: '1px solid #2E3033',
      }}
    >
      © {new Date().getFullYear()} {APP_NAME} · All rights reserved
    </footer>
  );
}
