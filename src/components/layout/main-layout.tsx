import type { ReactNode } from 'react';
import Sidebar from './sidebar';
import Header from './header';


interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1 pt-16"> {/* pt-16 to offset fixed header */}
        <Sidebar />
        <main className="flex-1 sm:ml-64"> {/* ml-64 to offset fixed sidebar on sm+ screens */}
          <div className="container mx-auto p-4 sm:p-6 lg:p-8">
             {children}
          </div>
        </main>
      </div>
    </div>
  );
}
