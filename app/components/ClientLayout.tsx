'use client';
import { usePathname } from 'next/navigation';
import Sidebar from '@/app/components/Sidebar'
import TopNavbar from '@/app/components/TopNavbar'
import styles from './ClientLayout.module.css';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = pathname?.startsWith('/chat') ||
    pathname?.startsWith('/pricing');

  return (
    <div className={styles.container}>
      {/* Sidebar for desktop */}
      {showSidebar && (
        <Sidebar className={styles.sidebarVisible} />
      )}

      {/* Top navbar for mobile */}
      <TopNavbar className={showSidebar ? styles.topNavbarVisible : styles.topNavbarHidden} />

      {/* Main content area */}
      <main className={`${styles.mainContent} ${showSidebar ? styles.mainContentWithSidebar : ''}`}>
        {children}
      </main>
    </div>
  );
}