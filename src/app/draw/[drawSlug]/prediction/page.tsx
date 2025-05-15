
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
import { Lightbulb, ShieldCheck, Wand2, Info, Brain, CheckCircle, BarChartHorizontalBig, ListTree, Cog } from "lucide-react";
import { useToast as useToastHook } from "@/hooks/use-toast";

const getBallColorClass = (number: number): string => {
  if (number >= 1 && number <= 9) { // Blanc
    return 'bg-white text-black border border-gray-300';
  } else if (number >= 10 && number <= 19) { // Bleu clair
    return 'bg-blue-300 text-blue-800 border border-blue-400';
  } else if (number >= 20 && number <= 29) { // Bleu foncé
    return 'bg-blue-700 text-blue-100 border border-blue-800';
  } else if (number >= 30 && number <= 39) { // Vert clair
    return 'bg-green-300 text-green-800 border border-green-400';
  } else if (number >= 40 && number <= 49) { // Violet
    return 'bg-purple-500 text-white border border-purple-600';
  } else if (number >= 50 && number <= 59) { // Indigo
    return 'bg-indigo-500 text-white border border-indigo-600';
  } else if (number >= 60 && number <= 69) { // Jaune
    return 'bg-yellow-400 text-yellow-800 border border-yellow-500';
  } else if (number >= 70 && number <= 79) { // Orange
    return 'bg-orange-500 text-white border border-orange-600';
  } else if (number >= 80 && number <= 90) { // Rouge
    return 'bg-red-600 text-white border border-red-700';
  }
  return 'bg-muted text-muted-foreground border border-gray-400'; // Default fallback
};

function PredictionCard({ prediction, isRecommended = false }: { prediction: SinglePrediction, isRecommended?: boolean }) {
  const icon = isRecommended ? <Cog className="h-6 w-6 mr-2 text-primary" /> : <Brain className="h-6 w-6 mr-2 text-muted-foreground" />;
  const titleText = isRecommended && prediction.methodName.includes("Réseau Neuronal") ? "Prédiction du Réseau Neuronal (RNN-LSTM)" : prediction.methodName;
  
  return (
    <Card className={`shadow-lg ${isRecommended ? 'border-primary ring-2 ring-primary' : 'border-border'}`}>
      <CardHeader>
        <CardTitle className="text-xl flex items-center">
          {icon}
          {titleText}
        </CardTitle>
        <CardDescription>Confiance: <Badge variant={
            prediction.confidence === "Élevée" ? "default" :
            prediction.confidence === "Moyenne" ? "secondary" :
            prediction.confidence === "Faible" ? "outline" :
            "destructive" 
          } className="text-sm">{prediction.confidence}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h4 className="text-md font-semibold text-muted-foreground mb-2">Numéros Suggérés:</h4>
          <div className="flex flex-wrap gap-2 justify-center">
            {prediction.predictedNumbers.map((num, index) => (
              <Badge key={`${prediction.methodName}-num-${index}-${num}`}
                     className={`text-xl px-3 py-1 rounded-full shadow-sm ${getBallColorClass(num)} w-10 h-10 flex items-center justify-center`}>
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
  const [initialPredictionAttempted, setInitialPredictionAttempted] = useState(false);
  const { toast: showToast } = useToastHook();


  useEffect(() => {
    if (drawSlug) {
      setDrawName(getDrawNameBySlug(drawSlug));
    }
  }, [drawSlug]);

  const fetchResults = useCallback(async () => {
    setIsLoadingData(true);
    setError(null);
    // Reset prediction state when fetching new base data
    setPredictionOutput(null);
    setInitialPredictionAttempted(false);
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
            console.error("Server error response (text) for prediction data:", errorText);
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

  const handleGeneratePrediction = useCallback(async () => {
    if (!drawName) {
        setError("Le nom du tirage n'est pas défini. Impossible de générer une prédiction.");
        return;
    }
    if (allResults.length === 0 && !isLoadingData) {
        showToast({
            title: "Peu de données historiques",
            description: `Aucune donnée historique pour "${drawName}". Les prédictions peuvent être moins fiables. Le modèle RNN-LSTM apprendra des résultats futurs.`,
            variant: "default"
        });
    }

    setError(null);
    setIsLoadingPrediction(true);
    // DO NOT setPredictionOutput(null) here at the start of the call, as it can cause loops
    // if the effect re-triggers based on predictionOutput becoming null.
    // Let the new prediction naturally overwrite the old one.

    const filteredResults = allResults.filter(result => result.draw_name === drawName);

    try {
      const predOutput = await generateLotteryPrediction({ results: filteredResults, drawName });
      setPredictionOutput(predOutput);
    } catch (err: any) {
      setError(`Erreur lors de la génération de la prédiction: ${err.message}`);
      console.error(err);
      setPredictionOutput(null); // Set to null on error so UI can react appropriately
    } finally {
      setIsLoadingPrediction(false);
    }
  }, [allResults, drawName, isLoadingData, showToast]);

  useEffect(() => {
    // This effect is for auto-generating the prediction when data is first loaded.
    if (!isLoadingData && drawName && allResults.length >= 0 && !predictionOutput && !initialPredictionAttempted && !isLoadingPrediction && !error) {
       handleGeneratePrediction();
       setInitialPredictionAttempted(true); // Mark that the initial attempt has been made
    }
  }, [isLoadingData, drawName, allResults, predictionOutput, initialPredictionAttempted, isLoadingPrediction, error, handleGeneratePrediction]);


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
          Les prédictions sont générées par des algorithmes à des fins de divertissement et d'analyse.
          Elles ne garantissent aucunement un gain. Jouez de manière responsable.
          Le modèle de Réseau Neuronal (RNN-LSTM) s'améliore avec plus de données et apprend de ses erreurs passées.
        </AlertDescription>
      </Alert>

      <div className="flex justify-center my-6">
        <Button onClick={handleGeneratePrediction} disabled={isLoadingData || isLoadingPrediction || !drawName} size="lg" className="px-8 py-6 text-lg">
          <Wand2 className="mr-3 h-6 w-6" />
          {isLoadingPrediction ? 'Génération en cours...' : (predictionOutput ? 'Rafraîchir les Prédictions' : 'Générer les Prédictions')}
        </Button>
      </div>

      {isLoadingData && <div className="pt-4"><LoadingSpinner message="Chargement des données historiques..." /></div>}
      {error && !isLoadingPrediction && <ErrorMessage message={error} />} {/* Show error only if not actively loading a new prediction */}
      {isLoadingPrediction && <div className="pt-4"><LoadingSpinner message="Génération des prédictions IA..." /></div>}

      {predictionOutput && !isLoadingPrediction && (
        <div className="space-y-8">
          <Card className="border-2 border-primary shadow-2xl">
            <CardHeader className="text-center bg-primary/5">
               <div className="flex items-center justify-center text-primary">
                 <Cog className="h-8 w-8 mr-3" />
                <CardTitle className="text-3xl">Prédiction du Réseau Neuronal (RNN-LSTM)</CardTitle>
               </div>
              <CardDescription className="text-md">
                Pour le tirage: <span className="font-bold">{predictionOutput.drawName}</span> |
                Basé sur {predictionOutput.dataSummary.totalDrawsAnalyzed} tirages analysés.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <PredictionCard prediction={predictionOutput.recommendedPrediction} isRecommended={true} />
            </CardContent>
             <CardFooter className="text-xs text-muted-foreground justify-center text-center">
                La prédiction du Réseau Neuronal (RNN-LSTM) est le résultat d'une analyse approfondie des tendances et des corrections dynamiques. Elle apprend des erreurs passées pour s'améliorer.
            </CardFooter>
          </Card>
          
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold flex items-center">
              <ListTree className="mr-3 h-6 w-6 text-muted-foreground" />
              Autres Analyses Algorithmiques
            </h2>
            <p className="text-muted-foreground">
             Explorez les prédictions alternatives générées par nos différents algorithmes statistiques (Fréquence, Retards, Associations, Distribution). Chacun offre une perspective unique sur les tendances des numéros.
            </p>
            <Accordion type="single" collapsible className="w-full" defaultValue="all-methods">
              <AccordionItem value="all-methods">
                <AccordionTrigger className="text-xl font-semibold hover:no-underline text-left py-3">
                  <BarChartHorizontalBig className="mr-3 h-5 w-5 text-muted-foreground" />
                  Détail des prédictions par algorithme statistique
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-6">
                  {predictionOutput.allPredictions
                    .filter(p => p.methodName !== predictionOutput.recommendedPrediction.methodName) 
                    .sort((a, b) => a.methodName.localeCompare(b.methodName)) 
                    .map((pred, index) => (
                      <PredictionCard key={`${pred.methodName}-${index}`} prediction={pred} />
                  ))}
                  {predictionOutput.allPredictions.filter(p => p.methodName !== predictionOutput.recommendedPrediction.methodName).length === 0 && (
                      <p className="text-muted-foreground text-center py-4">Seule la prédiction du Réseau Neuronal est disponible ou tous les algorithmes ont convergé.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

        </div>
      )}

      {!isLoadingData && !isLoadingPrediction && !predictionOutput && !error && drawName && (
         <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>En attente de génération</AlertTitle>
            <AlertDescription>
            Cliquez sur "Générer les Prédictions" pour démarrer l'analyse.
            Si aucune donnée historique n'est disponible pour "{drawName}", les prédictions initiales du Réseau Neuronal peuvent être moins précises mais s'amélioreront avec le temps.
            </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// Note: The global toast function below is not used by handleGeneratePrediction anymore.
// It's kept in case it's used elsewhere or was intended for a different purpose.
const toast = (options: { title: string, description: string, variant?: "default" | "destructive" }) => {
  useToastHook().toast(options);
};

