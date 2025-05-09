'use client';

import type { LotteryResult } from '@/types/lottery';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Ticket, Cog, Award } from 'lucide-react'; // Added Award

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
      // console.warn(`Invalid date string for formatting: ${dateString}`);
      return dateString; // Fallback to original string if date is invalid
    }
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 bg-card flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center text-primary text-xl">
          <Ticket className="mr-2 h-5 w-5" />
          {result.draw_name}
        </CardTitle>
        <CardDescription className="flex items-center text-sm">
          <CalendarDays className="mr-2 h-4 w-4" />
          {formatDate(result.date)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center">
            <Award className="mr-2 h-4 w-4 text-accent" /> {/* Changed to Award icon and color */}
            Numéros Gagnants
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.gagnants.map((num, index) => (
              <Badge key={`gagnant-${index}`} variant="default" className="text-base px-2.5 py-1 bg-accent text-accent-foreground rounded-md">
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
              <Badge key={`machine-${index}`} variant="secondary" className="text-base px-2.5 py-1 rounded-md">
                {num}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
