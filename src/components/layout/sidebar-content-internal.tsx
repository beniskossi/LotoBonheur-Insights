'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Home, Layers, Lightbulb, ShieldCheck, Settings, CalendarDays } from 'lucide-react';

import { DRAW_SCHEDULE, slugifyDrawName } from '@/config/draw-schedule';
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
  hrefPart: string;
  label: string;
  icon: LucideIcon;
}

const mainNavItems: NavItem[] = [
  { href: '/', label: 'Accueil', icon: Home, matchExact: true },
];

const drawSubNavItems: SubNavItem[] = [
  { label: 'Données', hrefPart: 'donnees', icon: Layers },
  { label: 'Consulter', hrefPart: 'consulter', icon: Lightbulb },
  { label: 'Statistiques', hrefPart: 'statistiques', icon: BarChart3 },
  { label: 'Prédiction', hrefPart: 'prediction', icon: ShieldCheck },
];

// Define the order of days for the sidebar
const orderedDays = [
  "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"
];


export default function SidebarContentInternal() {
  const pathname = usePathname();

  const isLinkActive = (href: string, matchExact: boolean = false) => {
    if (matchExact) {
      return pathname === href;
    }
    // For parent items, check if the current path starts with the href
    // This is a broader check for parent accordion items to be active
    const isSubItemPath = drawSubNavItems.some(subItem => href.endsWith(`/${subItem.hrefPart}`));
    if (isSubItemPath) {
        return pathname === href; // Exact match for sub-items
    }
    return pathname.startsWith(href); // StartsWith for parent items (like a draw name accordion)
  };


  return (
    <>
      <ScrollArea className="flex-grow py-4">
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
            {orderedDays.map((day) => {
              const daySchedule = DRAW_SCHEDULE[day];
              if (!daySchedule) return null;

              const daySlug = slugifyDrawName(day);
              
              const isDayEffectivelyActive = Object.values(daySchedule).some(drawNameForDay => {
                const drawSlugForDay = slugifyDrawName(drawNameForDay);
                const baseDrawPathForDay = `/draw/${drawSlugForDay}`;
                return drawSubNavItems.some(subItem => pathname === `${baseDrawPathForDay}/${subItem.hrefPart}`);
              });

              return (
                <AccordionItem key={daySlug} value={daySlug}>
                  <AccordionTrigger
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted hover:no-underline',
                      isDayEffectivelyActive && 'bg-muted text-accent-foreground'
                    )}
                  >
                    <div className="flex items-center">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {day}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0 pl-2">
                    <Accordion type="multiple" className="w-full">
                      {Object.entries(daySchedule).map(([time, drawName]) => {
                        const drawSlug = slugifyDrawName(drawName);
                        const baseDrawPath = `/draw/${drawSlug}`;
                        const isDrawNameEffectivelyActive = drawSubNavItems.some(subItem => pathname === `${baseDrawPath}/${subItem.hrefPart}`);
                        
                        // Ensure unique value for nested accordion items
                        const uniqueAccordionValue = `${daySlug}-${drawSlug}`;

                        return (
                          <AccordionItem key={uniqueAccordionValue} value={uniqueAccordionValue}>
                            <AccordionTrigger
                              className={cn(
                                'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted hover:no-underline',
                                isDrawNameEffectivelyActive && 'bg-muted text-accent-foreground'
                              )}
                            >
                              {time}: {drawName}
                            </AccordionTrigger>
                            <AccordionContent className="pb-0">
                              <div className="mt-1 flex flex-col space-y-1 pl-4">
                                {drawSubNavItems.map((subItem) => {
                                  const subHref = `${baseDrawPath}/${subItem.hrefPart}`;
                                  return (
                                    <Button
                                      key={subItem.label}
                                      variant={isLinkActive(subHref, true) ? 'secondary' : 'ghost'}
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
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

           <Button
              variant={isLinkActive('/admin', true) ? 'secondary' : 'ghost'}
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
      <div className="w-full border-t p-4">
        <InstallPwaButton />
      </div>
    </>
  );
}
