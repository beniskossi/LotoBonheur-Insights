'use client';

import SidebarContentInternal from './sidebar-content-internal';

export default function Sidebar() {
  return (
    // Desktop sidebar: hidden by default, shown on sm+ screens as a fixed, flex-column container.
    // The pt-16 accounts for the fixed header.
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r bg-card pt-16 sm:flex">
      <SidebarContentInternal />
    </aside>
  );
}
