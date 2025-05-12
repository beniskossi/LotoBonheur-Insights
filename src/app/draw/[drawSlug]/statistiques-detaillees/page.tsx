// src/app/draw/[drawSlug]/statistiques-detaillees/page.tsx
'use client';

import type { LotteryResult } from '@/types/lottery';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { calculateLotteryStatistics } from '@/ai/flows/statistics-flow';
import type { LotteryStatisticsOutput } from '@/ai/flows/statistics-types';
import { getDrawNameBySlug } from '@/config/draw-schedule';
import LoadingSpinner from '@/components/loading-spinner';
import ErrorMessage from '@/components/error-message';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ListOrdered, Sigma, PercentCircle as PercentIcon, TrendingUp } from "lucide-react";

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
        let errorMsg = `Erreur HTTP: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
           try {
            const errorText = await response.text();
            console.error("Server error response (text) for detailed stats data:", errorText);
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
        setStats(null);
        calculateLotteryStatistics({ results: filteredResults, drawName })
          .then(setStats)
          .catch(err => {
            setError(`Erreur lors du calcul des statistiques détaillées: ${err.message}`);
            console.error(err);
            setStats(null);
          })
          .finally(() => setIsLoadingStats(false));
      } else {
        setStats(null);
        setIsLoadingStats(false);
      }
    } else if (!isLoadingData && drawName) {
        setStats(null);
        setIsLoadingStats(false);
    }
  }, [allResults, drawName, isLoadingData]);

  const renderBarChart = (data: Record<string, number>, title: string, dataKeyName: string = "Fréquence") => {
    const chartData: ChartData[] = Object.entries(data)
      .map(([name, frequency]) => ({ name, frequency }))
      .sort((a, b) => {
        // Try to sort numerically if names are numbers, otherwise by frequency
        const aNameNum = parseInt(a.name);
        const bNameNum = parseInt(b.name);
        if (!isNaN(aNameNum) && !isNaN(bNameNum)) {
          return aNameNum - bNameNum; // Sort by number value for sums or odd counts
        }
        return b.frequency - a.frequency; // Default sort by frequency for pairs
      });

    if (chartData.length === 0) return <p className="text-sm text-muted-foreground mt-2 p-4 text-center">Aucune donnée disponible pour ce graphique.</p>;

    return (
      <ResponsiveContainer width="100%" height={350}>
        <RechartsBarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
          <XAxis dataKey="name" angle={-40} textAnchor="end" height={60} stroke="hsl(var(--muted-foreground))" interval={0} fontSize={10} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10}/>
          <Tooltip
            cursor={{ fill: 'hsla(var(--muted), 0.5)' }}
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--popover-foreground))',
              borderRadius: 'var(--radius)',
            }}
          />
          <Legend wrapperStyle={{ color: 'hsl(var(--foreground))', paddingTop: '10px' }} />
          <Bar dataKey="frequency" fill="hsl(var(--chart-2))" name={dataKeyName} radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    );
  };

  if (!drawName && !isLoadingData && !isLoadingStats) {
    return <ErrorMessage title="Catégorie Invalide" message={`La catégorie de tirage "${drawSlug}" n'a pas été trouvée.`} />;
  }

  if (isLoadingData || (isLoadingStats && !stats)) return <LoadingSpinner />;
  if (error && !stats) return <ErrorMessage title="Erreur de Données" message={error} />;

  if (!stats && !isLoadingData && !isLoadingStats && drawName) {
     return (
        <div className="space-y-6 p-4 md:p-6 lg:p-8">
            <header>
                <h1 className="text-3xl font-bold text-primary mb-1">Statistiques Détaillées: {drawName}</h1>
            </header>
            <Alert variant="default" className="border-primary/30">
                <Info className="h-4 w-4 text-primary" />
                <AlertTitle className="text-primary">Données Insuffisantes</AlertTitle>
                <AlertDescription>
                Aucune donnée de résultat n'a été trouvée pour "{drawName}" dans la période analysée pour générer des statistiques détaillées.
                Veuillez vérifier la section 'Données' ou rafraîchir les résultats si vous pensez que cela est une erreur.
                </AlertDescription>
            </Alert>
        </div>
    );
  }

  if (!stats) return <LoadingSpinner message="Préparation des statistiques détaillées..." />;


  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      <header>
        <h1 className="text-3xl font-bold text-primary mb-1">Statistiques Détaillées: {stats.drawName}</h1>
        <p className="text-lg text-muted-foreground">
          Analyse approfondie basée sur {stats.totalDrawsAnalyzed} tirage(s) pour la catégorie "{stats.drawName}".
        </p>
      </header>
      {error && <Alert variant="destructive"><Info className="h-4 w-4" /><AlertTitle>Erreur partielle</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><ListOrdered className="mr-2 h-5 w-5 text-accent" />Fréquence des Paires (Numéros Gagnants)</CardTitle>
          <CardDescription>Les {stats.mostFrequentWinningPairs.length} paires de numéros gagnants les plus fréquentes.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.mostFrequentWinningPairs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {stats.mostFrequentWinningPairs.map(pair => (
                <div key={pair} className="p-3 bg-muted/50 rounded-md flex justify-between items-center shadow-sm">
                  <Badge variant="outline" className="text-sm px-2 py-1">{pair}</Badge>
                  <span className="text-sm font-medium text-primary">{stats.winningPairFrequencies[pair] || 0} fois</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground p-4 text-center">Aucune donnée de fréquence de paires n'est disponible pour le moment.</p>
          )}
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">Note: Affiche les paires de numéros les plus communes apparues ensemble dans les résultats gagnants.</p>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><PercentIcon className="mr-2 h-5 w-5 text-accent" />Distribution Pairs/Impairs (Numéros Gagnants)</CardTitle>
          <CardDescription>Analyse de la répartition des numéros pairs et impairs dans les tirages gagnants.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
            <Card className="p-4 shadow">
                <CardDescription>Moy. Impairs / Tirage</CardDescription>
                <CardTitle className="text-2xl text-primary">{stats.oddEvenWinningStats.averageOdds.toFixed(2)}</CardTitle>
            </Card>
            <Card className="p-4 shadow">
                <CardDescription>Moy. Pairs / Tirage</CardDescription>
                <CardTitle className="text-2xl text-primary">{stats.oddEvenWinningStats.averageEvens.toFixed(2)}</CardTitle>
            </Card>
          </div>
          <div>
            <h4 className="text-md font-semibold mb-2 mt-4 text-center">Nombre de tirages par quantité de numéros impairs (0 à 5)</h4>
            {renderBarChart(stats.oddEvenWinningStats.drawsWithXOdds, "Nb. Numéros Impairs", "Nb. Tirages")}
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
            <Card className="p-4 shadow">
                <CardDescription>Somme Moyenne</CardDescription>
                <CardTitle className="text-2xl text-primary">{stats.winningSumStats.averageSum.toFixed(2)}</CardTitle>
            </Card>
            <Card className="p-4 shadow">
                <CardDescription>Somme Minimale Observée</CardDescription>
                <CardTitle className="text-2xl text-primary">{stats.winningSumStats.minSum ?? 'N/A'}</CardTitle>
            </Card>
            <Card className="p-4 shadow">
                <CardDescription>Somme Maximale Observée</CardDescription>
                <CardTitle className="text-2xl text-primary">{stats.winningSumStats.maxSum ?? 'N/A'}</CardTitle>
            </Card>
          </div>
           <div>
            <h4 className="text-md font-semibold mb-2 mt-4 text-center">Fréquence des sommes des numéros gagnants</h4>
            {renderBarChart(stats.winningSumStats.sumFrequencies, "Somme des Numéros", "Nb. Tirages")}
          </div>
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">Note: La plage théorique pour la somme de 5 numéros uniques entre 1 et 90 est de 15 (1+2+3+4+5) à 440 (86+87+88+89+90).</p>
        </CardFooter>
      </Card>
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
