'use server';
/**
 * @fileOverview Flow for generating advanced lottery predictions using multiple statistical methods.
 *
 * - generateLotteryPrediction - Generates predictions using various algorithms.
 * - LotteryPredictionInput - Input type for the flow.
 * - LotteryPredictionOutput - Output type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { LotteryResult } from '@/types/lottery';
import { format, parseISO, differenceInDays } from 'date-fns';

const NUMBERS_TO_PREDICT = 5;
const MIN_NUMBER = 1;
const MAX_NUMBER = 90;

const SinglePredictionSchema = z.object({
  methodName: z.string(),
  predictedNumbers: z.array(z.number()).length(NUMBERS_TO_PREDICT).describe(`A set of ${NUMBERS_TO_PREDICT} predicted numbers.`),
  explanation: z.string().describe("Explanation of how this prediction was generated."),
  confidence: z.string().describe("Qualitative confidence: Très faible, Faible, Moyenne, Élevée."),
});
export type SinglePrediction = z.infer<typeof SinglePredictionSchema>;

const LotteryPredictionInputSchema = z.object({
  results: z.array(
    z.object({
      draw_name: z.string(),
      date: z.string(), // YYYY-MM-DD
      gagnants: z.array(z.number()),
      machine: z.array(z.number()).refine(arr => arr.length === 0 || arr.length === 5, {
        message: "Les numéros machine doivent être soit 0 (aucun) soit 5 numéros.",
      }),
    })
  ).describe("List of historical lottery results for a specific draw category."),
  drawName: z.string().describe("The name of the draw category for which to predict."),
});
export type LotteryPredictionInput = z.infer<typeof LotteryPredictionInputSchema>;

const LotteryPredictionOutputSchema = z.object({
  drawName: z.string(),
  allPredictions: z.array(SinglePredictionSchema).describe("List of predictions from various methods."),
  recommendedPrediction: SinglePredictionSchema.describe("The overall recommended prediction, typically from a hybrid method."),
  dataSummary: z.object({
    totalDrawsAnalyzed: z.number(),
    // dateRange: z.string().optional().describe("e.g., '2023-01-01 à 2024-01-01'"), // Can be added later
  }),
});
export type LotteryPredictionOutput = z.infer<typeof LotteryPredictionOutputSchema>;

// --- Helper Functions ---

function generateRandomUniqueNumbers(count: number, min: number, max: number, existingNumbers: number[] = []): number[] {
  const numbers = new Set<number>(existingNumbers);
  while (numbers.size < count) {
    const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
    if (!numbers.has(randomNum)) {
      numbers.add(randomNum);
    }
  }
  return Array.from(numbers).slice(0, count).sort((a,b) => a - b);
}

function getConfidence(analyzedCount: number): string {
  if (analyzedCount < 10) return "Très faible";
  if (analyzedCount < 50) return "Faible";
  if (analyzedCount < 200) return "Moyenne";
  return "Élevée";
}

// --- Prediction Methods ---

function predictByFrequency(results: LotteryResult[], count: number): SinglePrediction {
  const frequencies: Record<string, number> = {};
  results.forEach(result => {
    result.gagnants.forEach(num => {
      frequencies[num.toString()] = (frequencies[num.toString()] || 0) + 1;
    });
  });

  const sortedNumbers = Object.entries(frequencies)
    .map(([num, freq]) => ({ num: parseInt(num), freq }))
    .sort((a, b) => b.freq - a.freq);

  let predictedNumbers: number[];
  if (sortedNumbers.length < count) {
    predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, sortedNumbers.map(s => s.num));
  } else {
    // Mix of top frequent and some from a slightly larger pool to introduce variability
    const topN = Math.min(sortedNumbers.length, Math.max(count * 2, 10));
    const candidatePool = sortedNumbers.slice(0, topN).map(item => item.num);
    predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, []).map((_,idx) => { // Ensure 5 numbers
        if (candidatePool.length > idx) return candidatePool[Math.floor(Math.random() * candidatePool.length)];
        return generateRandomUniqueNumbers(1,MIN_NUMBER,MAX_NUMBER,predictedNumbers)[0] // fill if pool too small
    });
    // Ensure uniqueness and correct count again
    predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, predictedNumbers);

  }

  return {
    methodName: "Fréquence",
    predictedNumbers,
    explanation: "Basé sur les numéros gagnants les plus fréquemment tirés dans l'historique.",
    confidence: getConfidence(results.length),
  };
}

function predictByDelay(results: LotteryResult[], count: number): SinglePrediction {
  if (results.length === 0) {
    return {
      methodName: "Retards",
      predictedNumbers: generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER),
      explanation: "Généré aléatoirement en raison de l'absence de données historiques.",
      confidence: "Très faible",
    };
  }
  const lastSeen: Record<string, string> = {}; // Store date as YYYY-MM-DD
  const allPossibleNumbers = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1);

  results.forEach(result => {
    result.gagnants.forEach(num => {
      if (!lastSeen[num.toString()] || result.date > lastSeen[num.toString()]) {
        lastSeen[num.toString()] = result.date;
      }
    });
  });
  
  const today = new Date();
  const numberDelays = allPossibleNumbers.map(num => {
    const lastDate = lastSeen[num.toString()];
    // If a number was never seen, give it a very high delay, or handle as per strategy.
    // For now, let's assume it was seen very long ago if not in 'lastSeen'.
    // This implies it is "very delayed".
    const delay = lastDate ? differenceInDays(today, parseISO(lastDate)) : MAX_NUMBER * 100; // Arbitrary large delay for unseen
    return { num, delay };
  }).sort((a, b) => b.delay - a.delay); // Sort by longest delay

  const predictedNumbers = numberDelays.slice(0, count).map(item => item.num);
  
  return {
    methodName: "Retards",
    predictedNumbers: generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, predictedNumbers), // Ensure 5 unique
    explanation: "Basé sur les numéros qui ne sont pas apparus récemment (les plus 'en retard').",
    confidence: getConfidence(results.length),
  };
}


function predictByAssociation(results: LotteryResult[], count: number): SinglePrediction {
   if (results.length < 5) { // Need some data for pair analysis
    return {
      methodName: "Associations",
      predictedNumbers: generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER),
      explanation: "Données historiques insuffisantes pour une analyse d'association. Généré aléatoirement.",
      confidence: "Très faible",
    };
  }

  const pairFrequencies: Record<string, number> = {};
  results.forEach(result => {
    const sortedGagnants = [...result.gagnants].sort((a, b) => a - b);
    for (let i = 0; i < sortedGagnants.length; i++) {
      for (let j = i + 1; j < sortedGagnants.length; j++) {
        const pairKey = `${sortedGagnants[i]}-${sortedGagnants[j]}`;
        pairFrequencies[pairKey] = (pairFrequencies[pairKey] || 0) + 1;
      }
    }
  });

  const topPairs = Object.entries(pairFrequencies)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10) // Consider top 10 pairs
    .map(([pairKey]) => pairKey.split('-').map(Number));

  const associatedNumbersPool = new Set<number>();
  topPairs.forEach(pair => {
    associatedNumbersPool.add(pair[0]);
    associatedNumbersPool.add(pair[1]);
  });
  
  const predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, Array.from(associatedNumbersPool));

  return {
    methodName: "Associations",
    predictedNumbers,
    explanation: "Basé sur les numéros qui apparaissent fréquemment ensemble en paires.",
    confidence: getConfidence(results.length),
  };
}


function predictByDistribution(results: LotteryResult[], count: number): SinglePrediction {
  if (results.length === 0) {
     return {
      methodName: "Distribution",
      predictedNumbers: generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER),
      explanation: "Généré aléatoirement en raison de l'absence de données historiques.",
      confidence: "Très faible",
    };
  }
  const ranges = Array.from({ length: Math.ceil(MAX_NUMBER / 10) }, (_, i) => ({
    min: i * 10 + 1,
    max: (i + 1) * 10,
    count: 0,
  }));

  results.forEach(result => {
    result.gagnants.forEach(num => {
      const rangeIndex = Math.floor((num - 1) / 10);
      if (ranges[rangeIndex]) {
        ranges[rangeIndex].count++;
      }
    });
  });

  // Calculate average numbers per range per draw
  const avgNumbersPerRange = ranges.map(r => ({ ...r, avg: r.count / results.length }));
  
  // Try to pick numbers matching this distribution
  // This is a simplified approach:
  // Pick `count` numbers, trying to respect which ranges are more "popular"
  const candidatePool: number[] = [];
  avgNumbersPerRange.sort((a,b) => b.avg - a.avg); // Sort ranges by popularity

  for (const range of avgNumbersPerRange) {
      // Add numbers from this range, proportional to its average, up to count
      const numToPickFromRange = Math.round(range.avg); // Simple rounding
      for(let i=0; i < numToPickFromRange && candidatePool.length < count * 2; ++i){ // Pool size for randomness
          candidatePool.push(Math.floor(Math.random() * (range.max - range.min + 1)) + range.min);
      }
  }
  
  const predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, candidatePool);

  return {
    methodName: "Distribution",
    predictedNumbers,
    explanation: "Tente de correspondre à la distribution historique des numéros par plages (dizaines).",
    confidence: getConfidence(results.length / 2), // Lower confidence for this method
  };
}

function predictByHybrid(allMethodPredictions: SinglePrediction[], count: number): SinglePrediction {
  const numberScores: Record<string, number> = {};
  const confidenceWeights: Record<string, number> = { "Très faible": 0.5, "Faible": 1, "Moyenne": 1.5, "Élevée": 2 };

  allMethodPredictions.forEach(prediction => {
    const weight = confidenceWeights[prediction.confidence] || 1;
    prediction.predictedNumbers.forEach(num => {
      numberScores[num.toString()] = (numberScores[num.toString()] || 0) + weight;
    });
  });

  const sortedNumbers = Object.entries(numberScores)
    .map(([num, score]) => ({ num: parseInt(num), score }))
    .sort((a, b) => b.score - a.score);

  let predictedNumbers = sortedNumbers.slice(0, count).map(item => item.num);
  if(predictedNumbers.length < count){
      predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, predictedNumbers);
  }


  // Calculate hybrid confidence (simplified)
  let avgConfidenceScore = 0;
  if (predictedNumbers.length > 0 && allMethodPredictions.length > 0) {
    predictedNumbers.forEach(num => {
        allMethodPredictions.forEach(p => {
            if(p.predictedNumbers.includes(num)) avgConfidenceScore += (confidenceWeights[p.confidence] || 1);
        })
    });
    avgConfidenceScore = avgConfidenceScore / (predictedNumbers.length * allMethodPredictions.length); // Average score per predicted number per method
  }
  
  let hybridConfidence = "Faible";
  if (avgConfidenceScore > 1.5) hybridConfidence = "Élevée";
  else if (avgConfidenceScore > 1.0) hybridConfidence = "Moyenne"; // Adjusted threshold
  else if (avgConfidenceScore >= 0.5) hybridConfidence = "Faible"; // Adjusted threshold
  else hybridConfidence = "Très faible";
  
  if (allMethodPredictions.length === 0 || allMethodPredictions.every(p => p.confidence === "Très faible")) {
      hybridConfidence = "Très faible";
  }


  return {
    methodName: "Hybride (Recommandé)",
    predictedNumbers: predictedNumbers.sort((a,b)=>a-b),
    explanation: "Combine les résultats de plusieurs méthodes, pondérés par leur confiance. Favorise les numéros consensuels.",
    confidence: hybridConfidence,
  };
}


// --- Main Flow ---

const generateLotteryPredictionFlow = ai.defineFlow(
  {
    name: 'generateLotteryPredictionFlow',
    inputSchema: LotteryPredictionInputSchema,
    outputSchema: LotteryPredictionOutputSchema,
  },
  async (input): Promise<LotteryPredictionOutput> => {
    const { results, drawName } = input;

    const dataSummary = {
      totalDrawsAnalyzed: results.length,
    };

    if (results.length === 0) {
      const randomNumbers = generateRandomUniqueNumbers(NUMBERS_TO_PREDICT, MIN_NUMBER, MAX_NUMBER);
      const randomPrediction: SinglePrediction = {
        methodName: "Aléatoire (Manque de données)",
        predictedNumbers: randomNumbers,
        explanation: "Aucune donnée historique pour ce tirage. Généré aléatoirement.",
        confidence: "Très faible",
      };
      return {
        drawName,
        allPredictions: [randomPrediction],
        recommendedPrediction: randomPrediction,
        dataSummary,
      };
    }
    
    // Gagnants only for these methods
    const gagnantsResults = results.map(r => ({...r, gagnants: r.gagnants.slice(0, NUMBERS_TO_PREDICT), machine: r.machine ? r.machine : [] }));


    const frequencyPrediction = predictByFrequency(gagnantsResults, NUMBERS_TO_PREDICT);
    const delayPrediction = predictByDelay(gagnantsResults, NUMBERS_TO_PREDICT);
    const associationPrediction = predictByAssociation(gagnantsResults, NUMBERS_TO_PREDICT);
    const distributionPrediction = predictByDistribution(gagnantsResults, NUMBERS_TO_PREDICT);

    const allPredictions: SinglePrediction[] = [
      frequencyPrediction,
      delayPrediction,
      associationPrediction,
      distributionPrediction,
    ];

    const hybridPrediction = predictByHybrid(allPredictions, NUMBERS_TO_PREDICT);
    
    // Add hybrid to the list as well, then sort to ensure "Hybride (Recommandé)" is always first.
    const finalPredictions = [...allPredictions, hybridPrediction]
      .filter((value, index, self) => // Remove duplicate if hybrid has same name as one of the methods (shouldn't happen with current naming)
          index === self.findIndex((t) => t.methodName === value.methodName)
      )
      .sort((a,b) => (a.methodName === "Hybride (Recommandé)" ? -1 : b.methodName === "Hybride (Recommandé)" ? 1 : a.methodName.localeCompare(b.methodName)));


    return {
      drawName,
      allPredictions: finalPredictions,
      recommendedPrediction: hybridPrediction,
      dataSummary,
    };
  }
);

export async function generateLotteryPrediction(input: LotteryPredictionInput): Promise<LotteryPredictionOutput> {
  return generateLotteryPredictionFlow(input);
}

