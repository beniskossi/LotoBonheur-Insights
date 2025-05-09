'use client';

import type { LotteryResult } from '@/types/lottery';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { generateLotteryPrediction, type LotteryPredictionOutput } from '@/ai/flows/prediction-flow';
import { getDrawNameBySlug } from '@/config/draw-schedule';
import LoadingSpinner from '@/components/loading-spinner';
import ErrorMessage from '@/components/error-message';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb, ShieldCheck, Wand2, Info } from "lucide-react";

export default function PredictionPage() {
  const params = useParams();
  const drawSlug = params.drawSlug as string;

  const [allResults, setAllResults] = useState<LotteryResult[]>([]);
  const [prediction, setPrediction] = useState<LotteryPredictionOutput | null>(null);
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
    if (allResults.length === 0 && !drawName) {
        setError("Les données historiques sont nécessaires pour la prédiction et le nom du tirage n'est pas défini.");
        return;
    }
     if (!drawName) {
        setError("Le nom du tirage n'est pas défini. Impossible de générer une prédiction.");
        return;
    }

    setError(null);
    setIsLoadingPrediction(true);
    setPrediction(null);

    const filteredResults = allResults.filter(result => result.draw_name === drawName);
    // Prediction flow can handle empty filteredResults (will generate random)

    try {
      const predOutput = await generateLotteryPrediction({ results: filteredResults, drawName });
      setPrediction(predOutput);
    } catch (err: any) {
      setError(`Erreur lors de la génération de la prédiction: ${err.message}`);
      console.error(err);
    } finally {
      setIsLoadingPrediction(false);
    }

  }, [allResults, drawName]);
  
   // Automatically generate prediction when data and drawName are ready
  useEffect(() => {
    if (!isLoadingData && drawName && allResults.length > 0 && !prediction && !isLoadingPrediction && !error) {
       // Only call if results are available for *any* draw to avoid issues if API fails entirely
       // The flow itself will handle if `filteredResults` for `drawName` is empty.
       handleGeneratePrediction();
    }
  }, [isLoadingData, drawName, allResults, prediction, isLoadingPrediction, error, handleGeneratePrediction]);


  if (!drawName && !isLoadingData) {
    return <ErrorMessage title="Catégorie Invalide" message={`La catégorie de tirage "${drawSlug}" n'a pas été trouvée.`} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-primary mb-1">Prédictions IA: {drawName || 'Chargement...'}</h1>
        <p className="text-lg text-muted-foreground">Obtenez des suggestions de numéros pour le prochain tirage.</p>
      </header>

      <Alert variant="default" className="border-accent bg-accent/10">
        <Lightbulb className="h-4 w-4 text-accent" />
        <AlertTitle className="text-accent">Avertissement Important</AlertTitle>
        <AlertDescription>
          Les prédictions sont générées par une IA à des fins de divertissement et d'analyse statistique.
          Elles ne garantissent aucunement un gain. Jouez de manière responsable.
          Le modèle actuel utilise une approche simplifiée ; un réseau neuronal plus avancé est en développement.
        </AlertDescription>
      </Alert>

      <div className="flex justify-center">
        <Button onClick={handleGeneratePrediction} disabled={isLoadingData || isLoadingPrediction} size="lg">
          <Wand2 className="mr-2 h-5 w-5" />
          {prediction ? 'Générer une Nouvelle Prédiction' : 'Générer une Prédiction'}
        </Button>
      </div>
      
      {isLoadingData && <div className="pt-4"><LoadingSpinner /></div>}
      {error && <ErrorMessage message={error} />}

      {isLoadingPrediction && <div className="pt-4"><LoadingSpinner /></div>}

      {prediction && !isLoadingPrediction && (
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 mr-2 text-primary" />
              Prédiction pour {prediction.drawName}
            </CardTitle>
            {prediction.confidence && <CardDescription>Confiance: {prediction.confidence}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <div>
              <h3 className="text-xl font-semibold text-muted-foreground mb-3">Numéros Gagnants Suggérés</h3>
              <div className="flex flex-wrap gap-3 justify-center">
                {prediction.predictedWinningNumbers.map((num, index) => (
                  <Badge key={`pred-gagnant-${index}`} className="text-2xl px-4 py-2 bg-accent text-accent-foreground rounded-lg shadow-md">
                    {num}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-muted-foreground mb-3">Numéros Machine Suggérés</h3>
              <div className="flex flex-wrap gap-3 justify-center">
                {prediction.predictedMachineNumbers.map((num, index) => (
                  <Badge key={`pred-machine-${index}`} variant="secondary" className="text-2xl px-4 py-2 rounded-lg shadow-md">
                    {num}
                  </Badge>
                ))}
              </div>
            </div>
            {prediction.explanation && (
              <p className="text-sm text-muted-foreground pt-4 italic max-w-md mx-auto">{prediction.explanation}</p>
            )}
          </CardContent>
        </Card>
      )}
      
      {!isLoadingData && !isLoadingPrediction && !prediction && !error && drawName && allResults.length === 0 && (
         <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Données de Base Manquantes</AlertTitle>
            <AlertDescription>
            Impossible de charger les données des résultats pour "{drawName}". La prédiction ne peut être effectuée sans ces données.
            Veuillez vérifier la section 'Données' ou rafraîchir les résultats globaux.
            </AlertDescription>
        </Alert>
      )}

    </div>
  );
}
