
'use client';

import type { LotteryResult } from '@/types/lottery';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Ticket, Cog, Award } from 'lucide-react'; 

interface LotteryResultCardProps {
  result: LotteryResult;
}

const getBallColorClass = (number: number): string => {
  if (number >= 1 && number <= 9) { // Blanc
    return 'bg-white text-black';
  } else if (number >= 10 && number <= 19) { // Bleu clair
    return 'bg-blue-300 text-blue-800';
  } else if (number >= 20 && number <= 29) { // Bleu foncé
    return 'bg-blue-700 text-blue-100';
  } else if (number >= 30 && number <= 39) { // Vert clair
    return 'bg-green-300 text-green-800';
  } else if (number >= 40 && number <= 49) { // Violet
    return 'bg-purple-500 text-white';
  } else if (number >= 50 && number <= 59) { // Indigo
    return 'bg-indigo-500 text-white';
  } else if (number >= 60 && number <= 69) { // Jaune
    return 'bg-yellow-400 text-yellow-800';
  } else if (number >= 70 && number <= 79) { // Orange
    return 'bg-orange-500 text-white';
  } else if (number >= 80 && number <= 90) { // Rouge
    return 'bg-red-600 text-white';
  }
  return 'bg-muted text-muted-foreground'; // Default fallback
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
                  className={`text-base px-2.5 py-1 rounded-md ${getBallColorClass(num)}`} // Apply same coloring to machine numbers
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
