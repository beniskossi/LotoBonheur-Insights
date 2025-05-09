import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Menu, BarChartBig } from 'lucide-react';
import SidebarContentInternal from './sidebar-content-internal'; // Import the internal content

export default function Header() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b bg-card px-4 sm:px-6">
      <div className="flex items-center">
        <Sheet>
          <SheetTrigger asChild>
            {/* Button visible only on screens smaller than sm (mobile) */}
            <Button variant="outline" size="icon" className="sm:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Ouvrir le menu</span>
            </Button>
          </SheetTrigger>
          {/* SheetContent for mobile: hidden on sm+ screens, flex-column for layout */}
          <SheetContent side="left" className="flex w-3/4 flex-col bg-card p-0 pt-10 sm:hidden">
            <SheetTitle className="sr-only">Menu Principal</SheetTitle>
            <SheetDescription className="sr-only">Naviguez à travers les sections de Lotocrack.</SheetDescription>
            <SidebarContentInternal /> {/* Embed internal sidebar content */}
          </SheetContent>
        </Sheet>
        <Link href="/" className="ml-2 flex items-center gap-2 sm:ml-0" prefetch={false}>
          <BarChartBig className="h-7 w-7 text-primary" />
          <span className="text-xl font-semibold">Lotocrack</span>
        </Link>
      </div>
      {/* Placeholder for any header actions on the right */}
      <div></div>
    </header>
  );
}
