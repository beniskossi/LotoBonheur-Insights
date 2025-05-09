'use server';
/**
 * @fileOverview Flow for calculating lottery number statistics, including detailed analysis.
 *
 * - calculateLotteryStatistics - Calculates frequency of winning/machine numbers, pair frequencies, odd/even distribution, and sum stats.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod'; // Ensured zod is imported directly
import type { LotteryResult } from '@/types/lottery';
import {
  LotteryStatisticsInputSchema as InputSchema,
  LotteryStatisticsOutputSchema as OutputSchema,
  type LotteryStatisticsInput as InputType,
  type LotteryStatisticsOutput as OutputType
} from './statistics-types';

function getTopN(frequencies: Record<string, number>, n: number, ascending: boolean): number[] {
  const sorted = Object.entries(frequencies)
    .map(([numStr, freq]) => ({ num: parseInt(numStr), freq }))
    .sort((a, b) => (ascending ? a.freq - b.freq : b.freq - a.freq));
  
  if (sorted.length === 0) return [];

  const limit = Math.min(n, sorted.length);
  if (limit === 0) return [];
  
  const thresholdFreq = sorted[limit-1].freq;
  
  return sorted
    .filter(item => (ascending ? item.freq <= thresholdFreq : item.freq >= thresholdFreq))
    .map(item => item.num)
    .slice(0, n); 
}

function getTopNPairs(frequencies: Record<string, number>, n: number): string[] {
    return Object.entries(frequencies)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([pair]) => pair);
}

const internalCalculateLotteryStatisticsFlow = ai.defineFlow(
  {
    name: 'calculateLotteryStatisticsFlow',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
  },
  async (input: InputType): Promise<OutputType> => {
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
      result.gagnants.forEach(num => {
        winningFrequencies[num.toString()] = (winningFrequencies[num.toString()] || 0) + 1;
      });
      result.machine.forEach(num => {
        machineFrequencies[num.toString()] = (machineFrequencies[num.toString()] || 0) + 1;
      });

      const sortedGagnants = [...result.gagnants].sort((a, b) => a - b);
      for (let i = 0; i < sortedGagnants.length; i++) {
        for (let j = i + 1; j < sortedGagnants.length; j++) {
          const pairKey = `${sortedGagnants[i]}-${sortedGagnants[j]}`;
          winningPairFrequencies[pairKey] = (winningPairFrequencies[pairKey] || 0) + 1;
        }
      }

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

export async function calculateLotteryStatistics(input: InputType): Promise<OutputType> {
  return internalCalculateLotteryStatisticsFlow(input);
}
