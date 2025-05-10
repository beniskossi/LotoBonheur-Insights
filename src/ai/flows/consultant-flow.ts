'use server';
/**
 * @fileOverview Flow for lottery number consultation, analyzing co-occurrence and next draw appearance.
 *
 * - analyzeNumberRegularity - Analyzes a target number's relationship with other numbers.
 * - NumberRegularityInput - Input type for the flow.
 * - NumberRegularityOutput - Output type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { LotteryResult } from '@/types/lottery';

const NumberRegularityInputSchema = z.object({
  results: z.array(
    z.object({
      draw_name: z.string(),
      date: z.string(),
      gagnants: z.array(z.number()),
      machine: z.array(z.number()).refine(arr => arr.length === 0 || arr.length === 5, { // Allow empty or 5 machine numbers
        message: "Les numéros machine doivent être soit 0 (aucun) soit 5 numéros.",
      }),
    })
  ).describe("List of lottery results for a specific draw category."),
  targetNumber: z.number().describe("The number to analyze for regularity."),
  drawName: z.string().describe("The name of the draw category being analyzed.")
});
export type NumberRegularityInput = z.infer<typeof NumberRegularityInputSchema>;

const CoOccurrenceSchema = z.record(z.number()).describe("Frequency of other numbers appearing with the target number in the same draw (winning numbers only).");
const NextDrawAppearanceSchema = z.record(z.number()).describe("Frequency of other numbers appearing in the draw immediately following one where the target number appeared (winning numbers only).");

const NumberRegularityOutputSchema = z.object({
  drawName: z.string(),
  targetNumber: z.number(),
  totalDrawsWithTarget: z.number().describe("Total draws where the target number appeared as a winning number."),
  coOccurrence: CoOccurrenceSchema,
  nextDrawAppearance: NextDrawAppearanceSchema,
  mostCoOccurring: z.array(z.number()).describe("Numbers most frequently co-occurring with the target."),
  mostFrequentInNextDraw: z.array(z.number()).describe("Numbers most frequently appearing in the next draw after target."),
  analysisSummary: z.string().optional().describe("AI-generated summary of the findings."),
});
export type NumberRegularityOutput = z.infer<typeof NumberRegularityOutputSchema>;

function getTopN(frequencies: Record<string, number>, n: number): number[] {
  return Object.entries(frequencies)
    .sort(([,a],[,b]) => b-a)
    .slice(0, n)
    .map(([num]) => parseInt(num));
}

const analyzeNumberRegularityFlow = ai.defineFlow(
  {
    name: 'analyzeNumberRegularityFlow',
    inputSchema: NumberRegularityInputSchema,
    outputSchema: NumberRegularityOutputSchema,
  },
  async (input) => {
    const { results, targetNumber, drawName } = input;
    const coOccurrence: Record<string, number> = {};
    const nextDrawAppearance: Record<string, number> = {};
    let totalDrawsWithTarget = 0;

    // Sort results by date to correctly identify next draws
    const sortedResults = [...results].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (let i = 0; i < sortedResults.length; i++) {
      const currentDraw = sortedResults[i];
      if (currentDraw.gagnants.includes(targetNumber)) {
        totalDrawsWithTarget++;

        // Co-occurrence: numbers in the same draw (winning only)
        currentDraw.gagnants.forEach(num => {
          if (num !== targetNumber) {
            coOccurrence[num.toString()] = (coOccurrence[num.toString()] || 0) + 1;
          }
        });

        // Next draw appearance: numbers in the next draw (winning only)
        if (i + 1 < sortedResults.length) {
          const nextDraw = sortedResults[i + 1];
          nextDraw.gagnants.forEach(num => {
            nextDrawAppearance[num.toString()] = (nextDrawAppearance[num.toString()] || 0) + 1;
          });
        }
      }
    }
    
    const topN = 5;
    const mostCoOccurring = getTopN(coOccurrence, topN);
    const mostFrequentInNextDraw = getTopN(nextDrawAppearance, topN);
    
    // AI prompt for analysis (optional, can be expanded)
    const prompt = ai.definePrompt({
        name: 'consultantAnalysisPrompt',
        input: { schema: z.object({ targetNumber: z.number(), mostCoOccurring: z.array(z.number()), mostFrequentInNextDraw: z.array(z.number()), totalDrawsWithTarget: z.number(), drawName: z.string() }) },
        output: { schema: z.object({ summary: z.string() }) },
        prompt: `Analyse la régularité du numéro {{{targetNumber}}} pour le tirage "{{{drawName}}}".
        Il est apparu dans {{{totalDrawsWithTarget}}} tirages.
        Les numéros qui apparaissent le plus souvent avec lui sont: {{{mostCoOccurring}}}.
        Les numéros qui apparaissent le plus souvent dans le tirage suivant sont: {{{mostFrequentInNextDraw}}}.
        Fournis un bref résumé (2-3 phrases) de ces observations pour un joueur. Sois concis et direct.`,
    });

    let analysisSummary: string | undefined = undefined;
    if (totalDrawsWithTarget > 0) {
        try {
            const { output } = await prompt({ targetNumber, mostCoOccurring, mostFrequentInNextDraw, totalDrawsWithTarget, drawName });
            analysisSummary = output?.summary;
        } catch (e) {
            console.error("Error generating consultant summary:", e);
            analysisSummary = "L'analyse IA n'est pas disponible pour le moment.";
        }
    } else {
        analysisSummary = `Le numéro ${targetNumber} n'a pas été trouvé dans les résultats gagnants pour le tirage ${drawName} analysés. Impossible de fournir une analyse de régularité.`;
    }


    return {
      drawName,
      targetNumber,
      totalDrawsWithTarget,
      coOccurrence,
      nextDrawAppearance,
      mostCoOccurring,
      mostFrequentInNextDraw,
      analysisSummary,
    };
  }
);

export async function analyzeNumberRegularity(input: NumberRegularityInput): Promise<NumberRegularityOutput> {
  return analyzeNumberRegularityFlow(input);
}

