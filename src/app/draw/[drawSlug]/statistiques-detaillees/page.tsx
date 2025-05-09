'use client';

import type { LotteryResult } from '@/types/lottery';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { calculateLotteryStatistics, type LotteryStatisticsOutput } from '@/ai/flows/statistics-flow';
import { getDrawNameBySlug } from '@/config/draw-schedule';
import LoadingSpinner from '@/components/loading-spinner';
import ErrorMessage from '@/components/error-message';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ListOrdered, Sigma, Percent } from "lucide-react";

interface ChartData {
  name: string;
  frequency: number;
}

export default function DetailedStatisticsPage() {
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
            setError(`Erreur lors du calcul des statistiques détaillées: ${err.message}`);
            console.error(err);
          })
          .finally(() => setIsLoadingStats(false));
      } else {
        setStats(null);
      }
    } else if (!isLoadingData && drawName) {
        setStats(null);
    }
  }, [allResults, drawName, isLoadingData]);

  const renderBarChart = (data: Record<string, number>, title: string, dataKeyName: string = "Fréquence") => {
    const chartData: ChartData[] = Object.entries(data)
      .map(([name, frequency]) => ({ name, frequency }))
      .sort((a, b) => {
        // Sort by name if it's numeric (like sums or odd counts), otherwise by frequency for pairs
        const aNameNum = parseInt(a.name);
        const bNameNum = parseInt(b.name);
        if (!isNaN(aNameNum) && !isNaN(bNameNum)) {
          return aNameNum - bNameNum;
        }
        return b.frequency - a.frequency;
      });
      
    if (chartData.length === 0) return <p className="text-muted-foreground mt-2">Aucune donnée disponible pour ce graphique.</p>;

    return (
      <ResponsiveContainer width="100%" height={350}>
        <RechartsBarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
          <XAxis dataKey="name" angle={-40} textAnchor="end" height={60} stroke="hsl(var(--muted-foreground))" interval={0} />
          <YAxis stroke="hsl(var(--muted-foreground))"/>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--popover-foreground))'
            }}
          />
          <Legend wrapperStyle={{ color: 'hsl(var(--foreground))' }}/>
          <Bar dataKey="frequency" fill="hsl(var(--chart-2))" name={dataKeyName} />
        </RechartsBarChart>
      </ResponsiveContainer>
    );
  };

  if (!drawName && !isLoadingData && !isLoadingStats) {
    return <ErrorMessage title="Catégorie Invalide" message={`La catégorie de tirage "${drawSlug}" n'a pas été trouvée.`} />;
  }

  if (isLoadingData || isLoadingStats) return <LoadingSpinner />;
  if (error && !stats) return <ErrorMessage message={error} />;

  if (!stats && !isLoadingData && !isLoadingStats && drawName) {
     return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold text-primary mb-1">Statistiques Détaillées: {drawName}</h1>
            </header>
            <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Données Insuffisantes</AlertTitle>
                <AlertDescription>
                Aucune donnée de résultat n'a été trouvée pour "{drawName}" pour générer des statistiques détaillées.
                Veuillez vérifier la section 'Données' ou rafraîchir les résultats.
                </AlertDescription>
            </Alert>
        </div>
    );
  }
  
  if (!stats) return <LoadingSpinner />;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-primary mb-1">Statistiques Détaillées: {stats.drawName}</h1>
        <p className="text-lg text-muted-foreground">
          Analyse approfondie basée sur {stats.totalDrawsAnalyzed} tirage(s).
        </p>
      </header>
      {error && <ErrorMessage message={error} />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><ListOrdered className="mr-2 h-5 w-5 text-accent" />Fréquence des Paires (Numéros Gagnants)</CardTitle>
          <CardDescription>Les 10 paires de numéros gagnants les plus fréquentes.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.mostFrequentWinningPairs.length > 0 ? (
            <ul className="space-y-1 list-disc pl-5 text-sm">
              {stats.mostFrequentWinningPairs.map(pair => (
                <li key={pair}>
                  Paire <Badge variant="outline">{pair}</Badge>: {stats.winningPairFrequencies[pair] || 0} fois
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Aucune donnée de fréquence de paires disponible.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Percent className="mr-2 h-5 w-5 text-accent" />Distribution Pairs/Impairs (Numéros Gagnants)</CardTitle>
          <CardDescription>Analyse de la répartition des numéros pairs et impairs dans les tirages gagnants.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
                <p className="text-sm text-muted-foreground">Moy. Impairs / Tirage</p>
                <p className="text-2xl font-bold">{stats.oddEvenWinningStats.averageOdds.toFixed(2)}</p>
            </div>
            <div>
                <p className="text-sm text-muted-foreground">Moy. Pairs / Tirage</p>
                <p className="text-2xl font-bold">{stats.oddEvenWinningStats.averageEvens.toFixed(2)}</p>
            </div>
          </div>
          <div>
            <h4 className="text-md font-semibold mb-2 mt-4">Nombre de tirages par quantité de numéros impairs (0 à 5):</h4>
            {renderBarChart(stats.oddEvenWinningStats.drawsWithXOdds, "Nombre de Numéros Impairs", "Nb. Tirages")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Sigma className="mr-2 h-5 w-5 text-accent" />Statistiques sur la Somme des Numéros Gagnants</CardTitle>
          <CardDescription>Analyse de la somme totale des 5 numéros gagnants par tirage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
                <p className="text-sm text-muted-foreground">Somme Moyenne</p>
                <p className="text-2xl font-bold">{stats.winningSumStats.averageSum.toFixed(2)}</p>
            </div>
            <div>
                <p className="text-sm text-muted-foreground">Somme Minimale</p>
                <p className="text-2xl font-bold">{stats.winningSumStats.minSum ?? 'N/A'}</p>
            </div>
            <div>
                <p className="text-sm text-muted-foreground">Somme Maximale</p>
                <p className="text-2xl font-bold">{stats.winningSumStats.maxSum ?? 'N/A'}</p>
            </div>
          </div>
           <div>
            <h4 className="text-md font-semibold mb-2 mt-4">Fréquence des sommes des numéros gagnants:</h4>
            {renderBarChart(stats.winningSumStats.sumFrequencies, "Fréquence des Sommes", "Nb. Tirages")}
          </div>
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">Note: La plage typique pour la somme de 5 numéros uniques entre 1 et 90 est de 15 (1+2+3+4+5) à 440 (86+87+88+89+90).</p>
        </CardFooter>
      </Card>
    </div>
  );
}
