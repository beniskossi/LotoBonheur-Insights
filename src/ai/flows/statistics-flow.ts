'use server';
/**
 * @fileOverview Flow for calculating lottery number statistics, including detailed analysis.
 *
 * - calculateLotteryStatistics - Calculates frequency of winning/machine numbers, pair frequencies, odd/even distribution, and sum stats.
 * - LotteryStatisticsInput - Input type for the flow.
 * - LotteryStatisticsOutput - Output type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { LotteryResult } from '@/types/lottery';

export const LotteryStatisticsInputSchema = z.object({
  results: z.array(
    z.object({
      draw_name: z.string(),
      date: z.string(),
      gagnants: z.array(z.number()),
      machine: z.array(z.number()),
    })
  ).describe("List of lottery results for a specific draw category."),
  drawName: z.string().describe("The name of the draw category being analyzed.")
});
export type LotteryStatisticsInput = z.infer<typeof LotteryStatisticsInputSchema>;

const NumberFrequencySchema = z.record(z.string(), z.number()).describe("Frequency of each number, key is number as string.");
const PairFrequenciesSchema = z.record(z.string(), z.number()).describe("Frequency of each pair of numbers (e.g., '1-23').");
const DrawsWithXOddsSchema = z.record(z.string(), z.number()).describe("Number of draws with X odd numbers (e.g., key '3' for 3 odd numbers).");
const SumFrequenciesSchema = z.record(z.string(), z.number()).describe("Frequency of specific sums of winning numbers (e.g., key '150' for sum 150).");

export const LotteryStatisticsOutputSchema = z.object({
  drawName: z.string().describe("The name of the draw category analyzed."),
  totalDrawsAnalyzed: z.number().describe("Total number of draws analyzed for this category."),
  winningNumberFrequencies: NumberFrequencySchema.describe("Frequencies of winning numbers."),
  machineNumberFrequencies: NumberFrequencySchema.describe("Frequencies of machine numbers."),
  mostFrequentWinning: z.array(z.number()).describe("Most frequently appearing winning numbers (top 5)."),
  leastFrequentWinning: z.array(z.number()).describe("Least frequently appearing winning numbers (bottom 5)."),
  mostFrequentMachine: z.array(z.number()).describe("Most frequently appearing machine numbers (top 5)."),
  leastFrequentMachine: z.array(z.number()).describe("Least frequently appearing machine numbers (bottom 5)."),
  // Detailed Statistics
  winningPairFrequencies: PairFrequenciesSchema.describe("Frequencies of pairs of winning numbers."),
  mostFrequentWinningPairs: z.array(z.string()).describe("Top 10 most frequent winning number pairs."),
  oddEvenWinningStats: z.object({
    averageOdds: z.number().describe("Average number of odd winning numbers per draw."),
    averageEvens: z.number().describe("Average number of even winning numbers per draw."),
    drawsWithXOdds: DrawsWithXOddsSchema.describe("Count of draws based on the number of odd winning numbers (0-5)."),
  }).describe("Statistics on odd/even distribution of winning numbers."),
  winningSumStats: z.object({
    averageSum: z.number().describe("Average sum of winning numbers per draw."),
    minSum: z.number().optional().describe("Minimum sum observed for winning numbers."),
    maxSum: z.number().optional().describe("Maximum sum observed for winning numbers."),
    sumFrequencies: SumFrequenciesSchema.describe("Frequencies of the sums of winning numbers."),
  }).describe("Statistics on the sum of winning numbers."),
});
export type LotteryStatisticsOutput = z.infer<typeof LotteryStatisticsOutputSchema>;

function getTopN(frequencies: Record<string, number>, n: number, ascending: boolean): number[] {
  const sorted = Object.entries(frequencies)
    .map(([numStr, freq]) => ({ num: parseInt(numStr), freq }))
    .sort((a, b) => (ascending ? a.freq - b.freq : b.freq - a.freq));
  
  if (sorted.length === 0) return [];

  const limit = Math.min(n, sorted.length);
  // Handle ties for the Nth position correctly
  const thresholdFreq = sorted[limit-1].freq;
  
  return sorted
    .filter(item => (ascending ? item.freq <= thresholdFreq : item.freq >= thresholdFreq))
    .map(item => item.num)
    .slice(0, n); // Ensure we don't exceed N items even with ties if strict N is needed
}

function getTopNPairs(frequencies: Record<string, number>, n: number): string[] {
    return Object.entries(frequencies)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([pair]) => pair);
}

export const calculateLotteryStatisticsFlow = ai.defineFlow(
  {
    name: 'calculateLotteryStatisticsFlow',
    inputSchema: LotteryStatisticsInputSchema,
    outputSchema: LotteryStatisticsOutputSchema,
  },
  async (input) => {
    const winningFrequencies: Record<string, number> = {};
    const machineFrequencies: Record<string, number> = {};
    const winningPairFrequencies: Record<string, number> = {};
    
    let totalOddsCount = 0;
    let totalEvensCount = 0;
    const drawsWithXOdds: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    
    let totalSumOfWinningNumbers = 0;
    let minSum: number | undefined = undefined;
    let maxSum: number | undefined = undefined;
    const sumFrequencies: Record<string, number> = {};

    const totalDraws = input.results.length;

    input.results.forEach(result => {
      // Basic Frequencies
      result.gagnants.forEach(num => {
        winningFrequencies[num.toString()] = (winningFrequencies[num.toString()] || 0) + 1;
      });
      result.machine.forEach(num => {
        machineFrequencies[num.toString()] = (machineFrequencies[num.toString()] || 0) + 1;
      });

      // Winning Pair Frequencies
      const sortedGagnants = [...result.gagnants].sort((a, b) => a - b);
      for (let i = 0; i < sortedGagnants.length; i++) {
        for (let j = i + 1; j < sortedGagnants.length; j++) {
          const pairKey = `${sortedGagnants[i]}-${sortedGagnants[j]}`;
          winningPairFrequencies[pairKey] = (winningPairFrequencies[pairKey] || 0) + 1;
        }
      }

      // Odd/Even Stats for Winning Numbers
      let currentDrawOdds = 0;
      let currentDrawEvens = 0;
      result.gagnants.forEach(num => {
        if (num % 2 === 0) {
          currentDrawEvens++;
        } else {
          currentDrawOdds++;
        }
      });
      totalOddsCount += currentDrawOdds;
      totalEvensCount += currentDrawEvens;
      drawsWithXOdds[currentDrawOdds.toString()] = (drawsWithXOdds[currentDrawOdds.toString()] || 0) + 1;
    
      // Sum of Winning Numbers Stats
      const currentSum = result.gagnants.reduce((acc, curr) => acc + curr, 0);
      totalSumOfWinningNumbers += currentSum;
      if (minSum === undefined || currentSum < minSum) {
        minSum = currentSum;
      }
      if (maxSum === undefined || currentSum > maxSum) {
        maxSum = currentSum;
      }
      sumFrequencies[currentSum.toString()] = (sumFrequencies[currentSum.toString()] || 0) + 1;
    });
    
    const topNBasic = 5;
    const topNPairsCount = 10;

    const averageOdds = totalDraws > 0 ? totalOddsCount / totalDraws : 0;
    const averageEvens = totalDraws > 0 ? totalEvensCount / totalDraws : 0;
    const averageSum = totalDraws > 0 ? totalSumOfWinningNumbers / totalDraws : 0;

    return {
      drawName: input.drawName,
      totalDrawsAnalyzed: totalDraws,
      winningNumberFrequencies: winningFrequencies,
      machineNumberFrequencies: machineFrequencies,
      mostFrequentWinning: getTopN(winningFrequencies, topNBasic, false),
      leastFrequentWinning: getTopN(winningFrequencies, topNBasic, true),
      mostFrequentMachine: getTopN(machineFrequencies, topNBasic, false),
      leastFrequentMachine: getTopN(machineFrequencies, topNBasic, true),
      winningPairFrequencies: winningPairFrequencies,
      mostFrequentWinningPairs: getTopNPairs(winningPairFrequencies, topNPairsCount),
      oddEvenWinningStats: {
        averageOdds: parseFloat(averageOdds.toFixed(2)),
        averageEvens: parseFloat(averageEvens.toFixed(2)),
        drawsWithXOdds: drawsWithXOdds,
      },
      winningSumStats: {
        averageSum: parseFloat(averageSum.toFixed(2)),
        minSum: minSum,
        maxSum: maxSum,
        sumFrequencies: sumFrequencies,
      },
    };
  }
);

export async function calculateLotteryStatistics(input: LotteryStatisticsInput): Promise<LotteryStatisticsOutput> {
  return calculateLotteryStatisticsFlow(input);
}
