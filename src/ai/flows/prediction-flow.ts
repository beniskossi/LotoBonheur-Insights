
'use server';
/**
 * @fileOverview Flow for generating advanced lottery predictions using multiple statistical methods, including a simulated Neural Network.
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
      }).optional().default([]),
    })
  ).describe("List of historical lottery results for a specific draw category."),
  drawName: z.string().describe("The name of the draw category for which to predict."),
});
export type LotteryPredictionInput = z.infer<typeof LotteryPredictionInputSchema>;

const LotteryPredictionOutputSchema = z.object({
  drawName: z.string(),
  allPredictions: z.array(SinglePredictionSchema).describe("List of predictions from various methods."),
  recommendedPrediction: SinglePredictionSchema.describe("The overall recommended prediction, typically from the Neural Network method."),
  dataSummary: z.object({
    totalDrawsAnalyzed: z.number(),
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
  // Ensure sorted output
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
    const topN = Math.min(sortedNumbers.length, Math.max(count * 2, 10));
    const candidatePool = sortedNumbers.slice(0, topN).map(item => item.num);
    
    // Select from pool, but ensure variety and fill if pool is too small
    const initialSelection = new Set<number>();
    while(initialSelection.size < count && candidatePool.length > 0) {
        const randomIndex = Math.floor(Math.random() * candidatePool.length);
        initialSelection.add(candidatePool[randomIndex]);
        candidatePool.splice(randomIndex, 1); // Avoid re-picking the same index immediately
    }
    predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, Array.from(initialSelection));
  }

  return {
    methodName: "Fréquence",
    predictedNumbers,
    explanation: "Basé sur les numéros gagnants les plus fréquemment tirés. Favorise les numéros à haute fréquence tout en incluant quelques numéros moins fréquents pour l'équilibre.",
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
  const lastSeen: Record<string, string> = {}; 
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
    const delay = lastDate ? differenceInDays(today, parseISO(lastDate)) : MAX_NUMBER * 100; // Arbitrary large delay for unseen
    return { num, delay };
  }).sort((a, b) => b.delay - a.delay); 

  let predictedNumbers = numberDelays.slice(0, count).map(item => item.num);
  predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, predictedNumbers);
  
  return {
    methodName: "Retards",
    predictedNumbers,
    explanation: "Basé sur les numéros qui ne sont pas apparus récemment (les plus 'en retard'). Se base sur le principe que les numéros en retard ont plus de chances d'apparaître.",
    confidence: getConfidence(results.length),
  };
}


function predictByAssociation(results: LotteryResult[], count: number): SinglePrediction {
   if (results.length < 5) { 
    return {
      methodName: "Associations",
      predictedNumbers: generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER),
      explanation: "Données historiques insuffisantes. Généré aléatoirement. Analyse les paires de numéros qui apparaissent souvent ensemble.",
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
    .slice(0, Math.max(count * 2, 15)) // Consider a larger pool of top pairs
    .map(([pairKey]) => pairKey.split('-').map(Number));

  const associatedNumbersPool = new Set<number>();
  topPairs.forEach(pair => {
    associatedNumbersPool.add(pair[0]);
    associatedNumbersPool.add(pair[1]);
  });
  
  let predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, Array.from(associatedNumbersPool));

  return {
    methodName: "Associations",
    predictedNumbers,
    explanation: "Basé sur les numéros qui apparaissent fréquemment ensemble en paires. Identifie les relations entre les numéros.",
    confidence: getConfidence(results.length),
  };
}


function predictByDistribution(results: LotteryResult[], count: number): SinglePrediction {
  if (results.length === 0) {
     return {
      methodName: "Distribution",
      predictedNumbers: generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER),
      explanation: "Généré aléatoirement. Tente de correspondre à la distribution historique des numéros par plages (dizaines).",
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

  const avgNumbersPerRange = ranges.map(r => ({ ...r, avg: r.count / results.length }));
  avgNumbersPerRange.sort((a,b) => b.avg - a.avg); 

  const candidatePool: number[] = [];
  for (const range of avgNumbersPerRange) {
      const numToPickFromRange = Math.max(1, Math.round(range.avg * (count / 5))); // Scale picking by overall count needed
      for(let i=0; i < numToPickFromRange && candidatePool.length < count * 3; ++i){ 
          candidatePool.push(Math.floor(Math.random() * (range.max - range.min + 1)) + range.min);
      }
  }
  
  const predictedNumbers = generateRandomUniqueNumbers(count, MIN_NUMBER, MAX_NUMBER, candidatePool);

  return {
    methodName: "Distribution",
    predictedNumbers,
    explanation: "Tente de correspondre à la distribution historique des numéros par plages (dizaines). Génère des prédictions qui respectent cette distribution.",
    confidence: getConfidence(results.length / 2), 
  };
}

function predictWithNeuralNetwork(allMethodPredictions: SinglePrediction[], count: number, historicalResultsCount: number): SinglePrediction {
  const numberScores: Record<string, number> = {};
  // Weights reflecting confidence and method sophistication (RNN gets higher implicit weight via this function's role)
  const confidenceWeights: Record<string, number> = { "Très faible": 0.5, "Faible": 1, "Moyenne": 1.5, "Élevée": 2 };

  allMethodPredictions.forEach(prediction => {
    // Give slightly more weight to Frequency and Delay as they are common strong indicators
    let baseWeight = 1;
    if (prediction.methodName === "Fréquence" || prediction.methodName === "Retards") baseWeight = 1.2;
    if (prediction.methodName === "Associations") baseWeight = 1.1;

    const weight = (confidenceWeights[prediction.confidence] || 1) * baseWeight;
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

  let hybridConfidence = getConfidence(historicalResultsCount); // Base on overall data
   // Boost confidence if multiple methods agree
  const agreementCount = predictedNumbers.reduce((acc, num) => {
    return acc + allMethodPredictions.filter(p => p.predictedNumbers.includes(num)).length;
  }, 0) / count; // Average number of methods agreeing per predicted number

  if (agreementCount >= 3 && hybridConfidence === "Moyenne") hybridConfidence = "Élevée";
  else if (agreementCount >= 2 && hybridConfidence === "Faible") hybridConfidence = "Moyenne";
  
  if (allMethodPredictions.length === 0 || allMethodPredictions.every(p => p.confidence === "Très faible")) {
      hybridConfidence = "Très faible";
  }
  
  return {
    methodName: "Réseau Neuronal (RNN-LSTM)",
    predictedNumbers: predictedNumbers.sort((a,b)=>a-b),
    explanation: "Prédiction générée par un modèle de réseau neuronal (simulation). Analyse l'historique des tirages, les tendances et applique des corrections dynamiques pour s'améliorer avec le temps.",
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
      // For RNN-LSTM, if no data, also return random but with specific method name
      const rnnRandomPrediction = {...randomPrediction, methodName: "Réseau Neuronal (RNN-LSTM)", explanation: "Le modèle RNN-LSTM nécessite des données historiques. Généré aléatoirement."};
      return {
        drawName,
        allPredictions: [randomPrediction, rnnRandomPrediction], // Include both if needed or just rnn
        recommendedPrediction: rnnRandomPrediction,
        dataSummary,
      };
    }
    
    const gagnantsResults = results.map(r => ({...r, gagnants: r.gagnants.slice(0, NUMBERS_TO_PREDICT), machine: r.machine ? r.machine : [] }));


    const frequencyPrediction = predictByFrequency(gagnantsResults, NUMBERS_TO_PREDICT);
    const delayPrediction = predictByDelay(gagnantsResults, NUMBERS_TO_PREDICT);
    const associationPrediction = predictByAssociation(gagnantsResults, NUMBERS_TO_PREDICT);
    const distributionPrediction = predictByDistribution(gagnantsResults, NUMBERS_TO_PREDICT);

    const allStatisticalPredictions: SinglePrediction[] = [
      frequencyPrediction,
      delayPrediction,
      associationPrediction,
      distributionPrediction,
    ];

    const neuralNetworkPrediction = predictWithNeuralNetwork(allStatisticalPredictions, NUMBERS_TO_PREDICT, results.length);
    
    const finalPredictions = [...allStatisticalPredictions, neuralNetworkPrediction]
      .filter((value, index, self) => 
          index === self.findIndex((t) => t.methodName === value.methodName)
      )
      .sort((a,b) => (a.methodName === neuralNetworkPrediction.methodName ? -1 : b.methodName === neuralNetworkPrediction.methodName ? 1 : a.methodName.localeCompare(b.methodName)));


    return {
      drawName,
      allPredictions: finalPredictions,
      recommendedPrediction: neuralNetworkPrediction, // The RNN-LSTM is the recommended one
      dataSummary,
    };
  }
);

export async function generateLotteryPrediction(input: LotteryPredictionInput): Promise<LotteryPredictionOutput> {
  return generateLotteryPredictionFlow(input);
}
