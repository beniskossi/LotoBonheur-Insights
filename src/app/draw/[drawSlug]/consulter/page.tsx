'use client';

import type { LotteryResult } from '@/types/lottery';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { analyzeNumberRegularity, type NumberRegularityOutput } from '@/ai/flows/consultant-flow';
import { getDrawNameBySlug } from '@/config/draw-schedule';
import LoadingSpinner from '@/components/loading-spinner';
import ErrorMessage from '@/components/error-message';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Search, Lightbulb } from "lucide-react"; // Added Lightbulb

interface ChartData {
  name: string;
  frequency: number;
}

export default function ConsulterPage() {
  const params = useParams();
  const drawSlug = params.drawSlug as string;

  const [allResults, setAllResults] = useState<LotteryResult[]>([]);
  const [analysis, setAnalysis] = useState<NumberRegularityOutput | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawName, setDrawName] = useState<string | undefined>(undefined);
  const [targetNumberInput, setTargetNumberInput] = useState<string>('');
  const [submittedTargetNumber, setSubmittedTargetNumber] = useState<number | null>(null);

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

  const handleAnalysisSubmit = useCallback(async () => {
    const num = parseInt(targetNumberInput);
    if (isNaN(num) || num < 1 || num > 90) { 
      setError("Veuillez entrer un numéro valide (1-90).");
      return;
    }
    setError(null);
    setSubmittedTargetNumber(num);

    if (allResults.length > 0 && drawName) {
      const filteredResults = allResults.filter(result => result.draw_name === drawName);
      if (filteredResults.length > 0) {
        setIsLoadingAnalysis(true);
        setAnalysis(null); 
        analyzeNumberRegularity({ results: filteredResults, targetNumber: num, drawName })
          .then(setAnalysis)
          .catch(err => {
            setError(`Erreur lors de l'analyse: ${err.message}`);
            console.error(err);
          })
          .finally(() => setIsLoadingAnalysis(false));
      } else {
         setError(`Aucune donnée de résultat trouvée pour "${drawName}" pour effectuer l'analyse.`);
      }
    }
  }, [targetNumberInput, allResults, drawName]);
  
  const renderFrequencyChart = (data: Record<string, number>, title: string) => {
    const chartData: ChartData[] = Object.entries(data)
      .map(([name, frequency]) => ({ name, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 15); 

    if (chartData.length === 0) return <p className="text-muted-foreground mt-2">Aucune donnée de fréquence pertinente.</p>;

    return (
      <ResponsiveContainer width="100%" height={300}>
        <RechartsBarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
          <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
          <YAxis stroke="hsl(var(--muted-foreground))"/>
          <Tooltip
             contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--popover-foreground))'
            }}
          />
          <Legend wrapperStyle={{ color: 'hsl(var(--foreground))' }} />
          <Bar dataKey="frequency" fill="hsl(var(--primary))" name={title} />
        </RechartsBarChart>
      </ResponsiveContainer>
    );
  };

  const renderNumberList = (numbers: number[], title: string) => (
    <div>
      <h4 className="text-md font-semibold mb-1">{title} (Top 5)</h4>
      {numbers.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {numbers.map(num => <Badge key={num} variant="outline">{num}</Badge>)}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">N/A</p>
      )}
    </div>
  );

  if (!drawName && !isLoadingData) {
    return <ErrorMessage title="Catégorie Invalide" message={`La catégorie de tirage "${drawSlug}" n'a pas été trouvée.`} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-primary mb-1">Consulter: {drawName || 'Chargement...'}</h1>
        <p className="text-lg text-muted-foreground">Analysez la régularité d'un numéro spécifique pour ce tirage.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Analyser un Numéro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-grow">
              <Label htmlFor="targetNumber">Numéro à analyser (1-90)</Label>
              <Input
                id="targetNumber"
                type="number"
                value={targetNumberInput}
                onChange={(e) => setTargetNumberInput(e.target.value)}
                placeholder="Ex: 7"
                min="1"
                max="90"
                className="mt-1"
              />
            </div>
            <Button onClick={handleAnalysisSubmit} disabled={isLoadingData || isLoadingAnalysis || !targetNumberInput}>
              <Search className="mr-2 h-4 w-4" />
              Analyser
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {isLoadingData && <LoadingSpinner />}
      
      {!isLoadingData && allResults.length === 0 && !error && (
         <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Données de Base Manquantes</AlertTitle>
            <AlertDescription>
            Impossible de charger les données des résultats pour "{drawName}". Veuillez vérifier la section 'Données' ou rafraîchir.
            L'analyse ne peut pas être effectuée sans ces données.
            </AlertDescription>
        </Alert>
      )}


      {isLoadingAnalysis && <LoadingSpinner />}

      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle>Résultats de l'Analyse pour le Numéro: {analysis.targetNumber}</CardTitle>
            <CardDescription>
              Pour le tirage "{analysis.drawName}", basé sur {analysis.totalDrawsWithTarget} apparition(s) du numéro {analysis.targetNumber}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {analysis.analysisSummary && (
                <Alert className="bg-primary/5 border-primary/20">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    <AlertTitle className="text-primary">Résumé de l'Analyse</AlertTitle>
                    <AlertDescription>{analysis.analysisSummary}</AlertDescription>
                </Alert>
            )}
            
            {analysis.totalDrawsWithTarget > 0 ? (
              <>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Numéros Apparaissant Souvent Ensemble</h3>
                  <p className="text-sm text-muted-foreground mb-3">Fréquence des autres numéros gagnants lorsque le {analysis.targetNumber} est sorti.</p>
                  {renderFrequencyChart(analysis.coOccurrence, "Co-occurrence")}
                  <div className="mt-4">
                    {renderNumberList(analysis.mostCoOccurring, "Plus forte co-occurrence")}
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-2">Numéros Fréquents au Tirage Suivant</h3>
                  <p className="text-sm text-muted-foreground mb-3">Fréquence des numéros gagnants sortis lors du tirage qui a suivi une apparition du {analysis.targetNumber}.</p>
                  {renderFrequencyChart(analysis.nextDrawAppearance, "Apparition au tirage suivant")}
                  <div className="mt-4">
                    {renderNumberList(analysis.mostFrequentInNextDraw, "Plus fréquents au tirage suivant")}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Le numéro {analysis.targetNumber} n'a pas été trouvé dans les tirages gagnants analysés pour "{analysis.drawName}".</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
