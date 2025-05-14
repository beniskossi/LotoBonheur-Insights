
'use client';

import type { LotteryResult } from '@/types/lottery';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Ticket, Cog, Award } from 'lucide-react'; 

interface LotteryResultCardProps {
  result: LotteryResult;
}

const getBallColorClass = (number: number): string => {
  const group = Math.floor((number - 1) / 10);
  switch (group) {
    case 0: return 'bg-[hsl(var(--chart-1))] text-primary-foreground'; // 1-10
    case 1: return 'bg-[hsl(var(--chart-2))] text-accent-foreground'; // 11-20
    case 2: return 'bg-[hsl(var(--chart-3))] text-primary-foreground'; // 21-30
    case 3: return 'bg-[hsl(var(--chart-4))] text-primary-foreground'; // 31-40
    case 4: return 'bg-[hsl(var(--chart-5))] text-primary-foreground'; // 41-50
    case 5: return 'bg-[hsl(var(--chart-1))] opacity-80 text-primary-foreground'; // 51-60 (cycle)
    case 6: return 'bg-[hsl(var(--chart-2))] opacity-80 text-accent-foreground'; // 61-70 (cycle)
    case 7: return 'bg-[hsl(var(--chart-3))] opacity-80 text-primary-foreground'; // 71-80 (cycle)
    case 8: return 'bg-[hsl(var(--chart-4))] opacity-80 text-primary-foreground'; // 81-90 (cycle)
    default: return 'bg-muted text-muted-foreground';
  }
};

export default function LotteryResultCard({ result }: LotteryResultCardProps) {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      return dateString; 
    }
  };

  const hasMachineNumbers = result.machine && result.machine.length > 0;

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
            <Award className="mr-2 h-4 w-4 text-accent" /> 
            Numéros Gagnants
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.gagnants.map((num, index) => (
              <Badge 
                key={`gagnant-${index}`} 
                className={`text-base px-2.5 py-1 rounded-md ${getBallColorClass(num)}`}
              >
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
          {hasMachineNumbers ? (
            <div className="flex flex-wrap gap-2">
              {result.machine.map((num, index) => (
                <Badge 
                  key={`machine-${index}`} 
                  variant="secondary" 
                  className={`text-base px-2.5 py-1 rounded-md ${getBallColorClass(num)}`}
                >
                  {num}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">N/A</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
