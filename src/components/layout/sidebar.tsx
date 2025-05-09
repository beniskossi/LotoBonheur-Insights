'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Home, Layers, Lightbulb, ShieldCheck, Settings, Download } from 'lucide-react';

import { getUniqueDrawNames, slugifyDrawName } from '@/config/draw-schedule';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import InstallPwaButton from '@/components/install-pwa-button';


interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  matchExact?: boolean;
}

interface SubNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const mainNavItems: NavItem[] = [
  { href: '/', label: 'Accueil', icon: Home, matchExact: true },
];

const drawSubNavItems: Omit<SubNavItem, 'href'>[] = [
  { label: 'Données', icon: Layers },
  { label: 'Consultant', icon: Lightbulb },
  { label: 'Statistiques', icon: BarChart3 },
  { label: 'Prédiction', icon: ShieldCheck },
];

export default function Sidebar() {
  const pathname = usePathname();
  const uniqueDrawNames = getUniqueDrawNames();

  const isLinkActive = (href: string, matchExact: boolean = false) => {
    if (matchExact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 -translate-x-full border-r bg-card pt-16 sm:translate-x-0">
      <ScrollArea className="h-full py-4">
        <nav className="flex flex-col gap-1 px-4">
          {mainNavItems.map((item) => (
            <Button
              key={item.label}
              variant={isLinkActive(item.href, item.matchExact) ? 'secondary' : 'ghost'}
              className="justify-start"
              asChild
            >
              <Link href={item.href}>
                <item.icon className="mr-2 h-5 w-5" />
                {item.label}
              </Link>
            </Button>
          ))}

          <Accordion type="multiple" className="w-full">
            {uniqueDrawNames.map((drawName) => {
              const drawSlug = slugifyDrawName(drawName);
              const baseDrawPath = `/draw/${drawSlug}`;
              const isParentActive = pathname.startsWith(baseDrawPath);

              return (
                <AccordionItem key={drawSlug} value={drawSlug}>
                  <AccordionTrigger
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted hover:no-underline',
                      isParentActive && 'bg-muted'
                    )}
                  >
                    {drawName}
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="mt-1 flex flex-col space-y-1 pl-4">
                      {drawSubNavItems.map((subItem) => {
                        const subHref = `${baseDrawPath}/${subItem.label.toLowerCase()}`;
                        return (
                          <Button
                            key={subItem.label}
                            variant={isLinkActive(subHref) ? 'secondary' : 'ghost'}
                            size="sm"
                            className="justify-start"
                            asChild
                          >
                            <Link href={subHref}>
                              <subItem.icon className="mr-2 h-4 w-4" />
                              {subItem.label}
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

           <Button
              variant={isLinkActive('/admin') ? 'secondary' : 'ghost'}
              className="justify-start mt-4"
              asChild
            >
              <Link href="/admin">
                <Settings className="mr-2 h-5 w-5" />
                Admin
              </Link>
            </Button>
        </nav>
      </ScrollArea>
       <div className="absolute bottom-0 w-full border-t p-4">
          <InstallPwaButton />
        </div>
    </aside>
  );
}
