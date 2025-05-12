// src/app/draw/[drawSlug]/statistiques/page.tsx
'use client';

import type { LotteryResult } from '@/types/lottery';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation'; // Removed useRouter as it's not used
import Link from 'next/link';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { calculateLotteryStatistics } from '@/ai/flows/statistics-flow';
import type { LotteryStatisticsOutput } from '@/ai/flows/statistics-types';
import { getDrawNameBySlug } from '@/config/draw-schedule';
import LoadingSpinner from '@/components/loading-spinner';
import ErrorMessage from '@/components/error-message';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ArrowRightCircle } from "lucide-react";

interface ChartData {
  name: string;
  frequency: number;
}

export default function StatisticsPage() {
  const params = useParams();
  const drawSlug = params.drawSlug as string;

  const [allResults, setAllResults] = useState<LotteryResult[]>([]);
  const [stats, setStats] = useState<LotteryStatisticsOutput | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawName, setDrawName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (drawSlug) {
      setDrawName(getDrawNameBySlug(drawSlug));
    }
  }, [drawSlug]);

  const fetchResults = useCallback(async () => {
    setIsLoadingData(true);
    setError(null);
    try {
      const response = await fetch('/api/results');
      if (!response.ok) {
        let errorMsg = `Erreur HTTP: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
           try {
            const errorText = await response.text();
            console.error("Server error response (text) for statistics data:", errorText);
            if (errorText && errorText.length < 200) errorMsg += ` - ${errorText.substring(0,100)}`;
          } catch (textErr) { /* Do nothing */ }
        }
        throw new Error(errorMsg);
      }
      const data: LotteryResult[] = await response.json();
      setAllResults(data);
    } catch (err: any) {
      setError(err.message || 'Impossible de récupérer les résultats.');
      console.error(err);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    if (allResults.length > 0 && drawName) {
      const filteredResults = allResults.filter(result => result.draw_name === drawName);
      if (filteredResults.length > 0) {
        setIsLoadingStats(true);
        setStats(null); // Reset previous stats
        calculateLotteryStatistics({ results: filteredResults, drawName })
          .then(setStats)
          .catch(err => {
            setError(`Erreur lors du calcul des statistiques: ${err.message}`);
            console.error(err);
            setStats(null);
          })
          .finally(() => setIsLoadingStats(false));
      } else {
        setStats(null);
        setIsLoadingStats(false); // Ensure loading is false if no data to process
      }
    } else if (!isLoadingData && drawName) {
        setStats(null); // No results or drawName not found
        setIsLoadingStats(false);
    }
  }, [allResults, drawName, isLoadingData]);

  if (!drawName && !isLoadingData && !isLoadingStats) {
    return <ErrorMessage title="Catégorie Invalide" message={`La catégorie de tirage "${drawSlug}" n'a pas été trouvée.`} />;
  }

  const renderFrequencyChart = (data: Record<string, number>, title: string) => {
    const chartData: ChartData[] = Object.entries(data)
      .map(([name, frequency]) => ({ name, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20); // Show top 20 for better readability

    if (chartData.length === 0) return <p className="text-muted-foreground mt-2 p-4 text-center">Aucune donnée de fréquence disponible pour ce graphique.</p>;

    return (
      <ResponsiveContainer width="100%" height={400}>
        <RechartsBarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
          <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} stroke="hsl(var(--muted-foreground))" interval={0} fontSize={10} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10}/>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--popover-foreground))',
              borderRadius: 'var(--radius)',
            }}
          />
          <Legend wrapperStyle={{ color: 'hsl(var(--foreground))' }}/>
          <Bar dataKey="frequency" fill="hsl(var(--chart-1))" name={title} radius={[4, 4, 0, 0]}/>
        </RechartsBarChart>
      </ResponsiveContainer>
    );
  };

  const renderNumberList = (numbers: number[], title: string) => (
    <div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {numbers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {numbers.map(num => <Badge key={`${title}-${num}`} variant="secondary" className="text-base">{num}</Badge>)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">N/A</p>
      )}
    </div>
  );

  if (isLoadingData || (isLoadingStats && !stats)) return <LoadingSpinner />; // Show spinner if loading data or initial stats
  if (error && !stats) return <ErrorMessage message={error} />;

  if (!stats && !isLoadingData && !isLoadingStats && drawName) {
     return (
        <div className="space-y-6 p-4 md:p-6 lg:p-8">
            <header>
                <h1 className="text-3xl font-bold text-primary mb-1">Statistiques: {drawName}</h1>
                <p className="text-lg text-muted-foreground">Analyse de fréquence des numéros pour ce tirage.</p>
            </header>
            <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Données Insuffisantes</AlertTitle>
                <AlertDescription>
                Aucune donnée de résultat n'a été trouvée pour "{drawName}" pour générer des statistiques.
                Veuillez vérifier la section 'Données' ou rafraîchir les résultats.
                </AlertDescription>
            </Alert>
        </div>
    );
  }

  if (!stats) return <LoadingSpinner message="Préparation des statistiques..." />; // Fallback if stats are still null

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
            <h1 className="text-3xl font-bold text-primary mb-1">Statistiques: {stats.drawName}</h1>
            <p className="text-lg text-muted-foreground">
            Basé sur {stats.totalDrawsAnalyzed} tirage(s) analysé(s).
            </p>
        </div>
        <Button asChild variant="outline" className="mt-4 sm:mt-0">
            <Link href={`/draw/${drawSlug}/statistiques-detaillees`}>
                Statistiques Détaillées <ArrowRightCircle className="ml-2 h-4 w-4" />
            </Link>
        </Button>
      </header>
      {error && <ErrorMessage message={error} />} {/* Show error even if some stats are displayed from previous load */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Fréquence des Numéros Gagnants</CardTitle>
            <CardDescription>Distribution des numéros sortis dans les tirages gagnants.</CardDescription>
          </CardHeader>
          <CardContent>
            {renderFrequencyChart(stats.winningNumberFrequencies, "Fréquence Gagnants")}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderNumberList(stats.mostFrequentWinning, "Plus Fréquents (Gagnants)")}
              {renderNumberList(stats.leastFrequentWinning, "Moins Fréquents (Gagnants)")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fréquence des Numéros Machine</CardTitle>
            <CardDescription>Distribution des numéros sortis par la machine.</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.machineNumberFrequencies).length > 0 ? (
                <>
                    {renderFrequencyChart(stats.machineNumberFrequencies, "Fréquence Machine")}
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderNumberList(stats.mostFrequentMachine, "Plus Fréquents (Machine)")}
                    {renderNumberList(stats.leastFrequentMachine, "Moins Fréquents (Machine)")}
                    </div>
                </>
            ) : (
                <p className="text-muted-foreground mt-2 p-4 text-center">Aucune donnée de numéros machine pour cette catégorie de tirage.</p>
            )}
          </CardContent>
        </Card>
      </div>
       { stats.totalDrawsAnalyzed === 0 && !isLoadingData && !isLoadingStats && (
         <Alert variant="default" className="border-primary/30 mt-6">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">Statistiques Basées sur Aucun Tirage</AlertTitle>
            <AlertDescription>
                Les statistiques affichées sont basées sur 0 tirage analysé pour la catégorie "{stats.drawName}".
                Ceci peut arriver si aucune donnée n'est disponible ou n'a été importée pour cette catégorie.
            </AlertDescription>
        </Alert>
       )}
    </div>
  );
}
