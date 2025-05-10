import { z } from 'zod';

// Define all the Zod schemas here
export const NumberFrequencySchema = z.record(z.string(), z.number()).describe("Frequency of each number, key is number as string.");
export const PairFrequenciesSchema = z.record(z.string(), z.number()).describe("Frequency of each pair of numbers (e.g., '1-23').");
export const DrawsWithXOddsSchema = z.record(z.string(), z.number()).describe("Number of draws with X odd numbers (e.g., key '3' for 3 odd numbers).");
export const SumFrequenciesSchema = z.record(z.string(), z.number()).describe("Frequency of specific sums of winning numbers (e.g., key '150' for sum 150).");

export const LotteryStatisticsInputSchema = z.object({
  results: z.array(
    z.object({
      draw_name: z.string(),
      date: z.string(),
      gagnants: z.array(z.number()),
      machine: z.array(z.number()).refine(arr => arr.length === 0 || arr.length === 5, {
        message: "Les numéros machine doivent être soit 0 (aucun) soit 5 numéros.",
      }),
    })
  ).describe("List of lottery results for a specific draw category."),
  drawName: z.string().describe("The name of the draw category being analyzed.")
});
export type LotteryStatisticsInput = z.infer<typeof LotteryStatisticsInputSchema>;

export const LotteryStatisticsOutputSchema = z.object({
  drawName: z.string().describe("The name of the draw category analyzed."),
  totalDrawsAnalyzed: z.number().describe("Total number of draws analyzed for this category."),
  winningNumberFrequencies: NumberFrequencySchema.describe("Frequencies of winning numbers."),
  machineNumberFrequencies: NumberFrequencySchema.describe("Frequencies of machine numbers (can be empty if no machine draws)."),
  mostFrequentWinning: z.array(z.number()).describe("Most frequently appearing winning numbers (top 5)."),
  leastFrequentWinning: z.array(z.number()).describe("Least frequently appearing winning numbers (bottom 5)."),
  mostFrequentMachine: z.array(z.number()).describe("Most frequently appearing machine numbers (top 5, can be empty)."),
  leastFrequentMachine: z.array(z.number()).describe("Least frequently appearing machine numbers (bottom 5, can be empty)."),
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

