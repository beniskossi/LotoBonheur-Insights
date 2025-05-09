'use server';
/**
 * @fileOverview Flow for generating lottery predictions.
 * This is a simplified version and does not implement a neural network.
 *
 * - generateLotteryPrediction - Generates a basic prediction.
 * - LotteryPredictionInput - Input type for the flow.
 * - LotteryPredictionOutput - Output type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { LotteryResult } from '@/types/lottery';

export const LotteryPredictionInputSchema = z.object({
  results: z.array(
    z.object({
      draw_name: z.string(),
      date: z.string(),
      gagnants: z.array(z.number()),
      machine: z.array(z.number()),
    })
  ).min(1).describe("List of historical lottery results for a specific draw category. Minimum 1 result required."),
  drawName: z.string().describe("The name of the draw category for which to predict."),
  // Future: Add parameters for ML model if implemented
});
export type LotteryPredictionInput = z.infer<typeof LotteryPredictionInputSchema>;

export const LotteryPredictionOutputSchema = z.object({
  drawName: z.string(),
  predictedWinningNumbers: z.array(z.number()).length(5),
  predictedMachineNumbers: z.array(z.number()).length(5),
  confidence: z.string().optional().describe("Qualitative confidence level or method used."),
  explanation: z.string().optional().describe("Brief explanation of the prediction method."),
});
export type LotteryPredictionOutput = z.infer<typeof LotteryPredictionOutputSchema>;


// Simple prediction logic:
// - Calculate frequency of all numbers.
// - Pick top N most frequent numbers.
// - Randomly select from these or use a mix of frequent and less frequent.
// This is a placeholder for a more complex ML model (Neural Network).
function simplePredictionStrategy(historicalResults: LotteryResult[], count: number): number[] {
  if (historicalResults.length === 0) {
    // Fallback: generate random unique numbers if no history
    const randomNumbers = new Set<number>();
    while (randomNumbers.size < count) {
      randomNumbers.add(Math.floor(Math.random() * 90) + 1);
    }
    return Array.from(randomNumbers);
  }

  const frequencies: Record<string, number> = {};
  historicalResults.forEach(result => {
    result.gagnants.forEach(num => {
      frequencies[num.toString()] = (frequencies[num.toString()] || 0) + 1;
    });
     // Optionally include machine numbers in frequency for prediction
    result.machine.forEach(num => {
        frequencies[num.toString()] = (frequencies[num.toString()] || 0) + 0.5; // Weight machine numbers less
    });
  });

  const sortedNumbers = Object.entries(frequencies)
    .map(([num, freq]) => ({ num: parseInt(num), freq }))
    .sort((a, b) => b.freq - a.freq);
  
  // Pick a mix: top frequent, some medium, some less frequent, or purely random from top 20-30
  const candidatePool = sortedNumbers.slice(0, Math.min(30, sortedNumbers.length)).map(item => item.num);
  if (candidatePool.length < count) { // Ensure pool is large enough
      for(let i = 1; i <= 90 && candidatePool.length < count; i++) {
          if(!candidatePool.includes(i)) candidatePool.push(i);
      }
  }

  const prediction = new Set<number>();
  while (prediction.size < count && candidatePool.length > 0) {
    const randomIndex = Math.floor(Math.random() * candidatePool.length);
    prediction.add(candidatePool.splice(randomIndex, 1)[0]);
  }
  // If not enough unique numbers, fill randomly
  while (prediction.size < count) {
    prediction.add(Math.floor(Math.random() * 90) + 1);
  }
  return Array.from(prediction).sort((a,b) => a - b);
}

export const generateLotteryPredictionFlow = ai.defineFlow(
  {
    name: 'generateLotteryPredictionFlow',
    inputSchema: LotteryPredictionInputSchema,
    outputSchema: LotteryPredictionOutputSchema,
  },
  async (input) => {
    const { results, drawName } = input;

    // Placeholder: Uses simple strategy. A Neural Network model would be trained and invoked here.
    const predictedGagnants = simplePredictionStrategy(results, 5);
    const predictedMachine = simplePredictionStrategy(results, 5); 

    return {
      drawName,
      predictedWinningNumbers: predictedGagnants,
      predictedMachineNumbers: predictedMachine,
      confidence: "Faible (Basé sur une stratégie simplifiée de fréquence et de sélection aléatoire)",
      explanation: "Cette prédiction est générée à partir des numéros historiquement fréquents et d'une part d'aléa. Elle ne constitue pas une garantie de gain et est fournie à titre indicatif. Un modèle d'apprentissage automatique de type réseau neuronal plus avancé est en cours de développement pour améliorer la précision.",
    };
  }
);

export async function generateLotteryPrediction(input: LotteryPredictionInput): Promise<LotteryPredictionOutput> {
  if (input.results.length === 0) {
    const randomWinning = simplePredictionStrategy([], 5);
    const randomMachine = simplePredictionStrategy([], 5);
    return {
      drawName: input.drawName,
      predictedWinningNumbers: randomWinning,
      predictedMachineNumbers: randomMachine,
      confidence: "Très faible (Généré aléatoirement faute de données historiques)",
      explanation: "Aucune donnée historique n'est disponible pour ce tirage. Les numéros ont été générés de manière aléatoire. Un modèle d'apprentissage automatique de type réseau neuronal est prévu.",
    };
  }
  return generateLotteryPredictionFlow(input);
}
