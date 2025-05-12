
'use server';
/**
 * @fileOverview Flow for analyzing lottery result images to extract draw data.
 *
 * - analyzeLotteryImage - Analyzes an image and extracts lottery results.
 * - LotteryImageAnalysisInput - Input type for the flow.
 * - LotteryImageAnalysisOutput - Output type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { LotteryResult } from '@/types/lottery';
import { getUniqueDrawNames } from '@/config/draw-schedule';
import { format, parse as dateParse, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';

// Zod schema for a single extracted draw from the image
const ExtractedDrawSchema = z.object({
  draw_name: z.string().describe("Le nom du tirage (ex: 'REVEIL', 'ETOILE'). Doit correspondre à un nom connu."),
  date: z.string().describe("La date du tirage au format YYYY-MM-DD. Essayer de déduire l'année si non explicite."),
  winning_numbers: z.array(z.number().int().min(1).max(90)).length(5).describe("Les 5 numéros gagnants."),
  machine_numbers: z.array(z.number().int().min(0).max(90))
    .refine(arr => arr.length === 0 || arr.length === 5, {
      message: "Les numéros machine doivent être soit un tableau vide (si non présents ou non analysables), soit un tableau de 5 numéros (0-90)."
    })
    .describe("Les 5 numéros machine. Si non présents ou non clairement identifiables, retourner un tableau vide []. Si des numéros sont présents mais pas 5, essayer de compléter à 5 avec 0 ou retourner vide si ambigu.")
});

export const LotteryImageAnalysisInputSchema = z.object({
  imageDataUri: z.string().describe(
    "A photo of lottery results, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
  ),
  drawNameFilter: z.string().nullable().optional().describe("Optional: Filter to only process results for a specific draw name if recognized in the image."),
});
export type LotteryImageAnalysisInput = z.infer<typeof LotteryImageAnalysisInputSchema>;

export const LotteryImageAnalysisOutputSchema = z.object({
  extractedData: z.array(
    z.object({
      draw_name: z.string(),
      date: z.string(), // YYYY-MM-DD
      gagnants: z.array(z.number()),
      machine: z.array(z.number()),
      clientId: z.string().optional(),
    })
  ).describe("List of lottery results extracted from the image."),
  analysisSummary: z.string().describe("AI-generated summary of the image analysis process and findings."),
});
export type LotteryImageAnalysisOutput = z.infer<typeof LotteryImageAnalysisOutputSchema>;


const analyzeLotteryImageFlow = ai.defineFlow(
  {
    name: 'analyzeLotteryImageFlow',
    inputSchema: LotteryImageAnalysisInputSchema,
    outputSchema: LotteryImageAnalysisOutputSchema,
  },
  async (input) => {
    const { imageDataUri, drawNameFilter } = input;
    const uniqueDrawNames = getUniqueDrawNames(); // For validation

    const prompt = ai.definePrompt({
        name: 'lotteryImageAnalysisPrompt',
        input: { schema: z.object({ imageDataUri: z.string(), uniqueDrawNames: z.array(z.string()) }) },
        output: { schema: z.object({
            draws: z.array(ExtractedDrawSchema),
            summary: z.string()
        }) },
        prompt: `Analyse l'image fournie pour extraire les résultats de tirages de Loto Bonheur.
        L'image contient des résultats de loterie. Chaque résultat a un nom de tirage, une date, 5 numéros gagnants, et optionnellement 5 numéros machine.
        Les noms de tirage valides sont: {{{uniqueDrawNames}}}. Si un nom de tirage dans l'image ne correspond pas exactement à l'un d'eux, essaie de trouver le plus similaire ou ignore-le s'il est trop ambigu.
        Pour la date, si l'année n'est pas explicite, suppose l'année actuelle. Formate la date en YYYY-MM-DD. Par exemple, "Lundi 15 Juillet" devient "YYYY-07-15".
        Les numéros gagnants sont toujours 5 chiffres entre 1 et 90.
        Les numéros machine, s'ils sont présents, sont aussi 5 chiffres (peuvent être 0). S'il n'y a pas de numéros machine clairs ou s'ils sont ambigus (par ex. moins de 5 numéros), retourne un tableau vide pour machine_numbers. Si les numéros machine sont explicitement listés comme des zéros (0,0,0,0,0), traite-les comme absents (tableau vide []).
        Retourne une liste d'objets, chaque objet représentant un tirage trouvé.
        Fournis également un résumé textuel de l'analyse, mentionnant le nombre de tirages trouvés et toute difficulté rencontrée.

        Image à analyser: {{media url=imageDataUri}}`,
        config: {
            temperature: 0.2, // Lower temperature for more deterministic extraction
        },
    });

    let extractedResults: LotteryResult[] = [];
    let analysisSummary = "";

    try {
        const { output } = await prompt({ imageDataUri, uniqueDrawNames });

        if (output && output.draws) {
            const rawExtractedDraws = output.draws;
            analysisSummary = output.summary || "Analyse terminée.";

            for (const rawDraw of rawExtractedDraws) {
                // Validate draw_name
                const matchedDrawName = uniqueDrawNames.find(dn => dn.toLowerCase() === rawDraw.draw_name.toLowerCase());
                if (!matchedDrawName) {
                    analysisSummary += ` Tirage ignoré (nom inconnu): ${rawDraw.draw_name}.`;
                    continue;
                }

                // Validate and format date (attempt to parse various common formats)
                let parsedDate: Date | null = null;
                try {
                    const datePatterns = ['d MMMM yyyy', 'dd MMMM yyyy', 'd MMM yyyy', 'dd MMM yyyy', 'd MMMM', 'dd MMMM', 'd MMM', 'dd MMM'];
                    const currentYear = new Date().getFullYear();
                    let dateToParse = rawDraw.date;
                    
                    // If year is missing, try to append current year
                    if (!/\d{4}/.test(dateToParse)) {
                         dateToParse = `${dateToParse} ${currentYear}`;
                    }
                    
                    for (const pattern of datePatterns) {
                        const tempDate = dateParse(dateToParse, pattern, new Date(), { locale: fr });
                        if (isValid(tempDate)) {
                            parsedDate = tempDate;
                            break;
                        }
                    }
                    if (!parsedDate && isValid(new Date(rawDraw.date))) { // Fallback for YYYY-MM-DD direct
                       parsedDate = new Date(rawDraw.date);
                    }

                } catch (e) { /* continue, parsedDate remains null */ }


                if (!parsedDate || !isValid(parsedDate)) {
                     analysisSummary += ` Tirage ${matchedDrawName} ignoré (date invalide): ${rawDraw.date}.`;
                     continue;
                }
                const formattedDate = format(parsedDate, 'yyyy-MM-dd');

                // Validate numbers
                if (rawDraw.winning_numbers.length !== 5 || rawDraw.winning_numbers.some(n => n < 1 || n > 90)) {
                    analysisSummary += ` Tirage ${matchedDrawName} à la date ${formattedDate} ignoré (numéros gagnants invalides).`;
                    continue;
                }
                 // Normalize machine numbers: if [0,0,0,0,0], treat as empty []
                let machineNumbers = rawDraw.machine_numbers;
                if (machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
                    machineNumbers = [];
                }
                // Further ensure machine numbers are valid if present
                if (machineNumbers.length > 0 && (machineNumbers.length !== 5 || machineNumbers.some(n => n < 0 || n > 90))) {
                     analysisSummary += ` Tirage ${matchedDrawName} à la date ${formattedDate}: numéros machine invalides, ignorés.`;
                     machineNumbers = []; // Default to empty if invalid
                }


                const result: LotteryResult = {
                    draw_name: matchedDrawName,
                    date: formattedDate,
                    gagnants: rawDraw.winning_numbers,
                    machine: machineNumbers,
                    clientId: `${matchedDrawName}-${formattedDate}-${Math.random().toString(36).substring(2, 9)}`
                };
                extractedResults.push(result);
            }

            if (drawNameFilter && drawNameFilter !== "all") {
                extractedResults = extractedResults.filter(r => r.draw_name === drawNameFilter);
                analysisSummary += ` Filtrage appliqué pour la catégorie: ${drawNameFilter}.`;
            }
            
            analysisSummary = `${extractedResults.length} résultats extraits et validés. ` + analysisSummary;

        } else {
            analysisSummary = "L'analyse de l'image n'a pas pu extraire de données structurées.";
        }
    } catch (e: any) {
        console.error("Error in lotteryImageAnalysisPrompt:", e);
        analysisSummary = `Erreur durant l'analyse IA: ${e.message || 'Erreur inconnue.'}`;
        // Keep extractedResults empty or partial based on where error occurred
    }

    return {
      extractedData: extractedResults,
      analysisSummary: analysisSummary,
    };
  }
);

export async function analyzeLotteryImage(input: LotteryImageAnalysisInput): Promise<LotteryImageAnalysisOutput> {
  return analyzeLotteryImageFlow(input);
}
