'use client';

import type { LotteryResult } from '@/types/lottery';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Ticket, Cog } from 'lucide-react';

interface LotteryResultCardProps {
  result: LotteryResult;
}

export default function LotteryResultCard({ result }: LotteryResultCardProps) {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      return dateString; // Fallback to original string if date is invalid
    }
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="flex items-center text-primary">
          <Ticket className="mr-2 h-6 w-6" />
          {result.draw_name}
        </CardTitle>
        <CardDescription className="flex items-center">
          <CalendarDays className="mr-2 h-4 w-4" />
          {formatDate(result.date)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 lucide lucide-award"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
              Numéros Gagnants
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.gagnants.map((num, index) => (
                <Badge key={`gagnant-${index}`} variant="default" className="text-lg px-3 py-1 bg-accent text-accent-foreground">
                  {num}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center">
              <Cog className="mr-2 h-4 w-4" />
              Numéros Machine
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.machine.map((num, index) => (
                <Badge key={`machine-${index}`} variant="secondary" className="text-lg px-3 py-1">
                  {num}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
