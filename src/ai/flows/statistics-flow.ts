'use server';
/**
 * @fileOverview Flow for calculating lottery number statistics.
 *
 * - calculateLotteryStatistics - Calculates frequency of winning and machine numbers.
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

const NumberFrequencySchema = z.record(z.number()).describe("Frequency of each number.");

export const LotteryStatisticsOutputSchema = z.object({
  drawName: z.string().describe("The name of the draw category analyzed."),
  totalDrawsAnalyzed: z.number().describe("Total number of draws analyzed for this category."),
  winningNumberFrequencies: NumberFrequencySchema.describe("Frequencies of winning numbers."),
  machineNumberFrequencies: NumberFrequencySchema.describe("Frequencies of machine numbers."),
  mostFrequentWinning: z.array(z.number()).describe("Most frequently appearing winning numbers."),
  leastFrequentWinning: z.array(z.number()).describe("Least frequently appearing winning numbers."),
  mostFrequentMachine: z.array(z.number()).describe("Most frequently appearing machine numbers."),
  leastFrequentMachine: z.array(z.number()).describe("Least frequently appearing machine numbers."),
});
export type LotteryStatisticsOutput = z.infer<typeof LotteryStatisticsOutputSchema>;

function getTopN(frequencies: Record<string, number>, n: number, ascending: boolean): number[] {
  const sorted = Object.entries(frequencies)
    .map(([num, freq]) => ({ num: parseInt(num), freq }))
    .sort((a, b) => (ascending ? a.freq - b.freq : b.freq - a.freq));
  
  if (sorted.length === 0) return [];

  const N = Math.min(n, sorted.length);
  const thresholdFreq = sorted[N-1].freq;
  
  return sorted.filter(item => (ascending ? item.freq <= thresholdFreq : item.freq >= thresholdFreq)).map(item => item.num).slice(0,5); // Show top 5 distinct numbers or more if tied
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

    input.results.forEach(result => {
      result.gagnants.forEach(num => {
        winningFrequencies[num.toString()] = (winningFrequencies[num.toString()] || 0) + 1;
      });
      result.machine.forEach(num => {
        machineFrequencies[num.toString()] = (machineFrequencies[num.toString()] || 0) + 1;
      });
    });
    
    const topN = 5; // Number of most/least frequent numbers to return

    return {
      drawName: input.drawName,
      totalDrawsAnalyzed: input.results.length,
      winningNumberFrequencies: winningFrequencies,
      machineNumberFrequencies: machineFrequencies,
      mostFrequentWinning: getTopN(winningFrequencies, topN, false),
      leastFrequentWinning: getTopN(winningFrequencies, topN, true),
      mostFrequentMachine: getTopN(machineFrequencies, topN, false),
      leastFrequentMachine: getTopN(machineFrequencies, topN, true),
    };
  }
);

export async function calculateLotteryStatistics(input: LotteryStatisticsInput): Promise<LotteryStatisticsOutput> {
  return calculateLotteryStatisticsFlow(input);
}

