'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react'; 
import { BarChart3, Home, Layers, Lightbulb, ShieldCheck, Settings, CalendarDays, FileText } from 'lucide-react';

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
  { label: 'Stats Détaillées', hrefPart: 'statistiques-detaillees', icon: FileText },
  { label: 'Prédiction', hrefPart: 'prediction', icon: ShieldCheck },
];

const orderedDays = [
  "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"
];


export default function SidebarContentInternal() {
  const pathname = usePathname();
  const [defaultOpenDays, setDefaultOpenDays] = useState<string[]>([]);
  const [defaultOpenDraws, setDefaultOpenDraws] = useState<string[]>([]);

  useEffect(() => {
    const activeDaySlugsSet = new Set<string>();
    const activeDrawSlugsSet = new Set<string>();

    orderedDays.forEach(day => {
        const daySchedule = DRAW_SCHEDULE[day];
        if (!daySchedule) return;
        const currentDaySlug = slugifyDrawName(day);

        let dayHasActiveChild = false;
        Object.entries(daySchedule).forEach(([_, drawName]) => {
            const currentDrawSlug = slugifyDrawName(drawName);
            const baseDrawPath = `/draw/${currentDrawSlug}`;
            const uniqueAccordionValue = `${currentDaySlug}-${currentDrawSlug}`; 

            const drawHasActiveChild = drawSubNavItems.some(subItem => {
                const subHref = `${baseDrawPath}/${subItem.hrefPart}`;
                return pathname === subHref;
            });

            if (drawHasActiveChild) {
                activeDrawSlugsSet.add(uniqueAccordionValue);
                dayHasActiveChild = true;
            }
        });
        if (dayHasActiveChild) {
            activeDaySlugsSet.add(currentDaySlug);
        }
    });
    setDefaultOpenDays(Array.from(activeDaySlugsSet));
    setDefaultOpenDraws(Array.from(activeDrawSlugsSet));

  }, [pathname]);

  const isLinkActive = (href: string, matchExact: boolean = false) => {
    if (matchExact) {
      return pathname === href;
    }
    // Check if it's a base path for a draw category (e.g. /draw/etoile)
    // This ensures the parent accordion item for "Etoile" highlights if any sub-item is active
    const pathSegments = pathname.split('/');
    const hrefSegments = href.split('/');
    if (hrefSegments.length === 3 && hrefSegments[1] === 'draw' && pathSegments.length > 3 && pathSegments[1] === 'draw' && pathSegments[2] === hrefSegments[2]) {
      return true; 
    }

    return pathname.startsWith(href); 
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

          <Accordion 
            type="multiple" 
            className="w-full"
            value={defaultOpenDays} // Controlled component
            onValueChange={setDefaultOpenDays} // Allow user to change open state
          >
            {orderedDays.map((day) => {
              const daySchedule = DRAW_SCHEDULE[day];
              if (!daySchedule || Object.keys(daySchedule).length === 0) return null;

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
                      'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:no-underline',
                      isDayEffectivelyActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
                    )}
                  >
                    <div className="flex items-center">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {day}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0 pl-2">
                    <Accordion 
                        type="multiple" 
                        className="w-full"
                        value={defaultOpenDraws} // Controlled component
                        onValueChange={setDefaultOpenDraws} // Allow user to change open state
                    >
                      {Object.entries(daySchedule).sort(([timeA], [timeB]) => timeA.localeCompare(timeB)).map(([time, drawName]) => {
                        const drawSlug = slugifyDrawName(drawName);
                        const baseDrawPath = `/draw/${drawSlug}`;
                        const isDrawNameEffectivelyActive = drawSubNavItems.some(subItem => pathname === `${baseDrawPath}/${subItem.hrefPart}`);
                        
                        const uniqueAccordionValue = `${daySlug}-${drawSlug}`;

                        return (
                          <AccordionItem key={uniqueAccordionValue} value={uniqueAccordionValue}>
                            <AccordionTrigger
                              className={cn(
                                'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:no-underline',
                                isDrawNameEffectivelyActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
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
                                      variant={pathname === subHref ? 'secondary' : 'ghost'} // Exact match for sub-items
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
      <div className="w-full border-t p-4 border-sidebar-border">
        <InstallPwaButton />
      </div>
    </>
  );
}
