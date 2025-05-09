'use client';

import type { LotteryResult } from '@/types/lottery';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { calculateLotteryStatistics, type LotteryStatisticsOutput } from '@/ai/flows/statistics-flow';
import { getDrawNameBySlug } from '@/config/draw-schedule';
import LoadingSpinner from '@/components/loading-spinner';
import ErrorMessage from '@/components/error-message';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

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
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur HTTP: ${response.status}`);
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
        calculateLotteryStatistics({ results: filteredResults, drawName })
          .then(setStats)
          .catch(err => {
            setError(`Erreur lors du calcul des statistiques: ${err.message}`);
            console.error(err);
          })
          .finally(() => setIsLoadingStats(false));
      } else {
        setStats(null); // No data for this draw name
      }
    }
  }, [allResults, drawName]);

  if (!drawName && !isLoadingData) {
    return <ErrorMessage title="Catégorie Invalide" message={`La catégorie de tirage "${drawSlug}" n'a pas été trouvée.`} />;
  }
  
  const renderFrequencyChart = (data: Record<string, number>, title: string) => {
    const chartData: ChartData[] = Object.entries(data)
      .map(([name, frequency]) => ({ name, frequency }))
      .sort((a, b) => b.frequency - a.frequency);

    if (chartData.length === 0) return <p className="text-muted-foreground">Aucune donnée de fréquence disponible.</p>;

    return (
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
          <XAxis dataKey="name" angle={-45} textAnchor="end" height={50} stroke="hsl(var(--muted-foreground))" />
          <YAxis stroke="hsl(var(--muted-foreground))"/>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--popover-foreground))'
            }}
          />
          <Legend wrapperStyle={{ color: 'hsl(var(--foreground))' }}/>
          <Bar dataKey="frequency" fill="hsl(var(--primary))" name={title} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderNumberList = (numbers: number[], title: string) => (
    <div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {numbers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {numbers.map(num => <Badge key={num} variant="secondary" className="text-base">{num}</Badge>)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">N/A</p>
      )}
    </div>
  );

  if (isLoadingData || isLoadingStats) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  
  if (!stats && !isLoadingData && !isLoadingStats && drawName) {
     return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold text-primary mb-1">Statistiques: {drawName}</h1>
                <p className="text-lg text-muted-foreground">Analyse de fréquence des numéros pour ce tirage.</p>
            </header>
            <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Données Insuffisantes</AlertTitle>
                <AlertDescription>
                Aucune donnée de résultat trouvée pour "{drawName}" pour générer des statistiques.
                Veuillez vérifier la section 'Données' ou rafraîchir.
                </AlertDescription>
            </Alert>
        </div>
    );
  }
  
  if (!stats) return null;


  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-primary mb-1">Statistiques: {stats.drawName}</h1>
        <p className="text-lg text-muted-foreground">
          Basé sur {stats.totalDrawsAnalyzed} tirage(s) analysé(s).
        </p>
      </header>

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
            {renderFrequencyChart(stats.machineNumberFrequencies, "Fréquence Machine")}
             <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderNumberList(stats.mostFrequentMachine, "Plus Fréquents (Machine)")}
              {renderNumberList(stats.leastFrequentMachine, "Moins Fréquents (Machine)")}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
