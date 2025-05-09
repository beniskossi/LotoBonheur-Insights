import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Menu, BarChartBig } from 'lucide-react';
import Sidebar from './sidebar'; // Import sidebar for mobile sheet

export default function Header() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b bg-card px-4 sm:px-6">
      <div className="flex items-center">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="sm:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Ouvrir le menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="sm:hidden w-3/4 p-0 pt-10">
            {/* Visible title for screen readers, but visually styled if needed or kept minimal */}
            <SheetTitle className="sr-only">Menu Principal</SheetTitle>
            {/* Optional: A brief description for screen readers if the title isn't enough context */}
            <SheetDescription className="sr-only">Naviguez à travers les sections de Lotocrack.</SheetDescription>
            {/* Embed sidebar content directly for mobile */}
            <Sidebar />
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
