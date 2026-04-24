import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function MainLayout() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="layout__main">
        <Header />
        <main className="layout__content">
          <Outlet />
        </main>
      </div>

      <style>{`
        .layout {
          display: flex;
          min-height: 100vh;
        }

        .layout__main {
          flex: 1;
          margin-left: var(--sidebar-width);
          display: flex;
          flex-direction: column;
          transition: margin-left var(--duration-base) var(--ease-out);
        }

        .layout__content {
          flex: 1;
          padding: var(--space-8);
          overflow-y: auto;
        }

        /* Handle collapsed sidebar */
        .sidebar--collapsed ~ .layout__main,
        .sidebar--collapsed + .layout__main {
          margin-left: var(--sidebar-collapsed);
        }

        @media (max-width: 1024px) {
          .layout__main {
            margin-left: 0;
          }
          
          .layout__content {
            padding: var(--space-5);
          }
        }
      `}</style>
    </div>
  );
}
