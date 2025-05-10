'use client';

import type { LotteryResult } from '@/types/lottery';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { generateLotteryPrediction, type LotteryPredictionOutput, type SinglePrediction } from '@/ai/flows/prediction-flow';
import { getDrawNameBySlug } from '@/config/draw-schedule';
import LoadingSpinner from '@/components/loading-spinner';
import ErrorMessage from '@/components/error-message';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Lightbulb, ShieldCheck, Wand2, Info, Brain, CheckCircle, BarChartHorizontalBig } from "lucide-react";

function PredictionCard({ prediction, isRecommended = false }: { prediction: SinglePrediction, isRecommended?: boolean }) {
  return (
    <Card className={`shadow-lg ${isRecommended ? 'border-primary ring-2 ring-primary' : ''}`}>
      <CardHeader>
        <CardTitle className="text-xl flex items-center">
          {isRecommended ? <CheckCircle className="h-6 w-6 mr-2 text-primary" /> : <Brain className="h-6 w-6 mr-2 text-muted-foreground" />}
          {prediction.methodName}
        </CardTitle>
        <CardDescription>Confiance: <Badge variant={
            prediction.confidence === "Élevée" ? "default" : 
            prediction.confidence === "Moyenne" ? "secondary" :
            prediction.confidence === "Faible" ? "outline" :
            "destructive" // Très faible
          } className="text-sm">{prediction.confidence}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h4 className="text-md font-semibold text-muted-foreground mb-2">Numéros Suggérés:</h4>
          <div className="flex flex-wrap gap-2 justify-center">
            {prediction.predictedNumbers.map((num, index) => (
              <Badge key={`${prediction.methodName}-num-${index}`} 
                     className={`text-xl px-3 py-1 rounded-md shadow-sm ${isRecommended ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                {num}
              </Badge>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground italic pt-2">{prediction.explanation}</p>
      </CardContent>
    </Card>
  );
}


export default function PredictionPage() {
  const params = useParams();
  const drawSlug = params.drawSlug as string;

  const [allResults, setAllResults] = useState<LotteryResult[]>([]);
  const [predictionOutput, setPredictionOutput] = useState<LotteryPredictionOutput | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingPrediction, setIsLoadingPrediction] = useState(false);
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

  const handleGeneratePrediction = useCallback(async () => {
    if (!drawName) {
        setError("Le nom du tirage n'est pas défini. Impossible de générer une prédiction.");
        return;
    }

    setError(null);
    setIsLoadingPrediction(true);
    setPredictionOutput(null);

    // The generateLotteryPrediction flow can handle empty `results` by generating random ones.
    // It already filters by drawName internally if results are passed.
    // For consistency with flow input, we pass all results for the category.
    const filteredResults = allResults.filter(result => result.draw_name === drawName);
    
    try {
      const predOutput = await generateLotteryPrediction({ results: filteredResults, drawName });
      setPredictionOutput(predOutput);
    } catch (err: any) {
      setError(`Erreur lors de la génération de la prédiction: ${err.message}`);
      console.error(err);
    } finally {
      setIsLoadingPrediction(false);
    }

  }, [allResults, drawName]);
  
  useEffect(() => {
    if (!isLoadingData && drawName && !predictionOutput && !isLoadingPrediction && !error) {
       handleGeneratePrediction();
    }
  }, [isLoadingData, drawName, allResults, predictionOutput, isLoadingPrediction, error, handleGeneratePrediction]);


  if (!drawName && !isLoadingData) {
    return <ErrorMessage title="Catégorie Invalide" message={`La catégorie de tirage "${drawSlug}" n'a pas été trouvée.`} />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-bold text-primary mb-2">Prédictions IA Avancées</h1>
        <p className="text-xl text-muted-foreground">Analyse multi-algorithmes pour: <span className="font-semibold text-accent">{drawName || 'Chargement...'}</span></p>
      </header>

      <Alert variant="default" className="border-accent bg-accent/10">
        <Lightbulb className="h-5 w-5 text-accent" />
        <AlertTitle className="text-accent text-lg">Avertissement Important</AlertTitle>
        <AlertDescription className="text-sm">
          Les prédictions sont générées par des algorithmes statistiques à des fins de divertissement et d'analyse.
          Elles ne garantissent aucunement un gain. Jouez de manière responsable.
          La fiabilité des prédictions dépend fortement de la quantité et de la qualité des données historiques.
        </AlertDescription>
      </Alert>

      <div className="flex justify-center my-6">
        <Button onClick={handleGeneratePrediction} disabled={isLoadingData || isLoadingPrediction} size="lg" className="px-8 py-6 text-lg">
          <Wand2 className="mr-3 h-6 w-6" />
          {predictionOutput ? 'Rafraîchir les Prédictions' : 'Générer les Prédictions'}
        </Button>
      </div>
      
      {isLoadingData && <div className="pt-4"><LoadingSpinner /></div>}
      {error && <ErrorMessage message={error} />}
      {isLoadingPrediction && <div className="pt-4"><LoadingSpinner /></div>}

      {predictionOutput && !isLoadingPrediction && (
        <div className="space-y-8">
          <Card className="border-2 border-primary shadow-2xl">
            <CardHeader className="text-center bg-primary/5">
               <div className="flex items-center justify-center text-primary">
                 <ShieldCheck className="h-8 w-8 mr-3" />
                <CardTitle className="text-3xl">Prédiction Recommandée</CardTitle>
               </div>
              <CardDescription className="text-md">
                Pour le tirage: <span className="font-bold">{predictionOutput.drawName}</span> | 
                Basé sur {predictionOutput.dataSummary.totalDrawsAnalyzed} tirages analysés.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <PredictionCard prediction={predictionOutput.recommendedPrediction} isRecommended={true} />
            </CardContent>
             <CardFooter className="text-xs text-muted-foreground justify-center">
                La prédiction recommandée combine les résultats de plusieurs méthodes d'analyse.
            </CardFooter>
          </Card>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="all-methods">
              <AccordionTrigger className="text-2xl font-semibold hover:no-underline">
                <BarChartHorizontalBig className="mr-3 h-6 w-6 text-muted-foreground" />
                Détail des autres méthodes de prédiction
              </AccordionTrigger>
              <AccordionContent className="pt-4 space-y-6">
                {predictionOutput.allPredictions
                  .filter(p => p.methodName !== predictionOutput.recommendedPrediction.methodName) // Exclude recommended if it's also in allPredictions with same name
                  .map((pred, index) => (
                    <PredictionCard key={index} prediction={pred} />
                ))}
                 {predictionOutput.allPredictions.filter(p => p.methodName !== predictionOutput.recommendedPrediction.methodName).length === 0 && (
                    <p className="text-muted-foreground text-center py-4">La prédiction recommandée est la seule disponible pour ce tirage.</p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

        </div>
      )}
      
      {!isLoadingData && !isLoadingPrediction && !predictionOutput && !error && drawName && (
         <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>En attente de génération</AlertTitle>
            <AlertDescription>
            Cliquez sur "Générer les Prédictions" pour démarrer l'analyse. 
            Si aucune donnée historique n'est disponible pour "{drawName}", les prédictions seront aléatoires.
            </AlertDescription>
        </Alert>
      )}

    </div>
  );
}
