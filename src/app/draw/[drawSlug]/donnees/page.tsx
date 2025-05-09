'use client';

import type { LotteryResult } from '@/types/lottery';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import LotteryResultCard from '@/components/lottery-result-card';
import LoadingSpinner from '@/components/loading-spinner';
import ErrorMessage from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info } from 'lucide-react';
import { getDrawNameBySlug } from '@/config/draw-schedule';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function DrawDataPage() {
  const params = useParams();
  const drawSlug = params.drawSlug as string;
  
  const [results, setResults] = useState<LotteryResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<LotteryResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawName, setDrawName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (drawSlug) {
      setDrawName(getDrawNameBySlug(drawSlug));
    }
  }, [drawSlug]);

  const fetchResults = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/results');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur HTTP: ${response.status}`);
      }
      const data: LotteryResult[] = await response.json();
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'Impossible de récupérer les résultats.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    if (results.length > 0 && drawName) {
      setFilteredResults(results.filter(result => result.draw_name === drawName));
    }
  }, [results, drawName]);

  if (!drawName && !isLoading) {
    return <ErrorMessage title="Catégorie Invalide" message={`La catégorie de tirage "${drawSlug}" n'a pas été trouvée.`} />;
  }

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary mb-1">
          Données du Tirage: {drawName || 'Chargement...'}
        </h1>
        <p className="text-lg text-muted-foreground">Consultez l'historique des résultats pour ce tirage.</p>
      </header>

      <div className="mb-6 flex justify-end">
        <Button onClick={fetchResults} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Rafraîchir les Données
        </Button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}
      
      {!isLoading && !error && filteredResults.length === 0 && (
         <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Aucun Résultat</AlertTitle>
          <AlertDescription>
            Aucun résultat n'a été trouvé pour la catégorie "{drawName}" pour le moment.
            Les données sont peut-être en cours de collecte ou ce tirage n'a pas encore eu lieu récemment.
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && filteredResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredResults.map((result, index) => (
            <LotteryResultCard key={`${result.draw_name}-${result.date}-${index}`} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}
