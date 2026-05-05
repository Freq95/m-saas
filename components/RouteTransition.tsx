'use client';

import { usePathname } from 'next/navigation';

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const disableMobileMotion = pathname.startsWith('/settings') || pathname.startsWith('/inbox');
  return (
    <div className={`route-fade-in${disableMobileMotion ? ' route-mobile-motion-static' : ''}`}>
      {children}
    </div>
  );
}
