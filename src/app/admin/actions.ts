// src/app/admin/actions.ts
'use server';

import type { LotteryResult } from '@/types/lottery';
import { getUniqueDrawNames } from '@/config/draw-schedule';
import { format as formatDateFns, parse as dateParse, isValid } from 'date-fns';
import { z } from 'zod';
// import { jsPDF } from 'jspdf'; // Removed: PDF export
// import 'jspdf-autotable'; // Removed: PDF export
// import { fr } from 'date-fns/locale'; // Removed: PDF export specific (format uses it, but it is not critical for json only)
// import { analyzeLotteryImage, type LotteryImageAnalysisInput, type LotteryImageAnalysisOutput } from '@/ai/flows/image-analysis-flow'; // Removed: Image analysis
// import { exportToImage } from '@/lib/image-export'; // Removed: Image export


// Schema for validating a single lottery result within the JSON
const LotteryResultSchemaForJson = z.object({
  draw_name: z.string().min(1, "Le nom du tirage est requis."),
  date: z.string().transform((dateString, ctx) => {
    const possibleFormats = [
      'yyyy-MM-dd',
      'dd/MM/yyyy',
      'MM/dd/yyyy',
      'dd-MM-yyyy',
      'MM-dd-yyyy',
      'yyyy/MM/dd',
    ];
    let parsedDate: Date | null = null;
    for (const fmt of possibleFormats) {
      const d = dateParse(dateString, fmt, new Date());
      if (isValid(d)) {
        parsedDate = d;
        break;
      }
    }
    if (!parsedDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Format de date invalide. Formats acceptés: ${possibleFormats.join(', ')}. Reçu: "${dateString}"`,
      });
      return z.NEVER; // Required by Zod for transforms that can fail
    }
    return formatDateFns(parsedDate, 'yyyy-MM-dd'); // Normalize to YYYY-MM-DD
  }),
  gagnants: z.array(z.number().int().min(1, "Numéro gagnant doit être >= 1.").max(90, "Numéro gagnant doit être <= 90.")).length(5, "5 numéros gagnants sont requis."),
  machine: z.array(z.number().int().min(0, "Numéro machine doit être >= 0.").max(90, "Numéro machine doit être <= 90."))
    .refine(arr => {
      if (arr.length === 0) return true; // Empty array is valid (no machine numbers)
      if (arr.length === 5) {
        // Allow five 0s (as a way to signify no numbers, will be normalized to [])
        // OR five valid numbers between 1 and 90.
        if (arr.every(num => num === 0)) return true;
        return arr.every(num => num >= 1 && num <= 90);
      }
      return false; // Any other length is invalid
    }, {
      message: "Numéros machine: optionnel. Si fourni, doit être vide [], ou cinq zéros [0,0,0,0,0], ou 5 numéros (1-90).",
    }).optional().default([]), // Optional, defaults to empty array if not provided in JSON
  clientId: z.string().optional(),
});

const LotteryResultsArraySchema = z.array(LotteryResultSchemaForJson);


export async function importLotteryDataFromJson(
  formData: FormData,
  filterDrawName?: string | null
): Promise<{ success: boolean; data?: LotteryResult[]; error?: string; message?: string; importedCount?: number, originalCount?: number }> {
  const file = formData.get('jsonFile') as File;

  if (!file) {
    return { success: false, error: 'Aucun fichier fourni.' };
  }

  if (file.type !== 'application/json') {
    return { success: false, error: 'Type de fichier invalide. Veuillez uploader un fichier JSON.' };
  }

  try {
    const fileContent = await file.text();
    const jsonData = JSON.parse(fileContent);

    const validationResult = LotteryResultsArraySchema.safeParse(jsonData);

    if (!validationResult.success) {
      console.error("JSON validation errors:", validationResult.error.flatten());
      const errorMessages = validationResult.error.errors.map(e => `Chemin: ${e.path.join('.') || 'racine'}, Message: ${e.message}`).join('; ');
      return { success: false, error: `Le fichier JSON n'a pas le format attendu. Erreurs: ${errorMessages}` };
    }
    
    const allImportedResults: LotteryResult[] = validationResult.data.map(item => {
      // item.date is now guaranteed to be 'yyyy-MM-dd' by the schema transform
      // item.machine is already defaulted to [] by schema if not present
      let machineNumbers = item.machine;
      // Normalize [0,0,0,0,0] to [] if that's the convention for "no machine numbers"
      if (machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
        machineNumbers = [];
      }
      return {
        draw_name: item.draw_name,
        date: item.date, // This is now the 'yyyy-MM-dd' transformed date
        gagnants: item.gagnants,
        machine: machineNumbers,
        clientId: item.clientId || `${item.draw_name}-${item.date}-${Math.random().toString(36).substring(2, 9)}`
      };
    });


    const originalCount = allImportedResults.length;
    let filteredResults = allImportedResults;

    if (filterDrawName && filterDrawName !== "all") {
      filteredResults = allImportedResults.filter(r => r.draw_name === filterDrawName);
    }
    
    const importedCount = filteredResults.length;

    if (originalCount === 0 && fileContent.trim() !== "[]") {
      return { success: false, error: 'Aucune donnée de tirage valide n\'a pu être extraite du JSON. Vérifiez le format des données.' };
    }
    if (originalCount === 0 && fileContent.trim() === "[]") {
      return { success: false, error: 'Le fichier JSON semble vide.' };
    }

    let message = `${originalCount} résultat(s) lu(s) depuis le JSON.`;
    if (filterDrawName && filterDrawName !== "all") {
      message += ` ${importedCount} résultat(s) correspondent au filtre "${filterDrawName}".`;
    } else {
      message += ` ${importedCount} résultat(s) sont prêts à être traités (aucun filtre appliqué ou "Toutes les catégories" sélectionné).`;
    }

    return { success: true, data: filteredResults, importedCount, message, originalCount };

  } catch (error: any) {
    console.error('Error parsing JSON for import:', error);
    if (error instanceof SyntaxError) {
      return { success: false, error: 'Erreur de syntaxe dans le fichier JSON. Veuillez vérifier le format.' };
    }
    return { success: false, error: `Erreur lors de l'analyse du JSON: ${error.message}` };
  }
}

export async function exportLotteryDataToJson(
  allResults: LotteryResult[],
  filterDrawName?: string | null
): Promise<{ success: boolean; jsonData?: string; fileName?: string; error?: string }> {
  
  const resultsToExport = (filterDrawName && filterDrawName !== "all")
    ? allResults.filter(r => r.draw_name === filterDrawName)
    : allResults;

  if (!resultsToExport || resultsToExport.length === 0) {
    return { success: false, error: 'Aucune donnée à exporter (après application du filtre).' };
  }

  try {
    // Sort results by date descending, then by draw_name before exporting
    const sortedResultsToExport = [...resultsToExport].sort((a, b) => {
        const dateComparison = b.date.localeCompare(a.date);
        if (dateComparison !== 0) return dateComparison;
        return a.draw_name.localeCompare(b.draw_name);
    });
      
    const jsonString = JSON.stringify(sortedResultsToExport.map(({clientId, ...rest}) => ({
      ...rest,
      machine: Array.isArray(rest.machine) && rest.machine.length > 0 ? rest.machine : [] // Ensure exported machine is [] if empty/null
    })), null, 2); // Remove clientId for export
    const currentDate = formatDateFns(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `LotoBonheurInsights_Export_Admin_${filterDrawName && filterDrawName !== "all" ? filterDrawName.replace(/\s+/g, '_') : 'Tous'}_${currentDate}.json`;

    return { success: true, jsonData: jsonString, fileName };

  } catch (error: any) {
    console.error('Error exporting JSON from admin:', error);
    return { success: false, error: `Erreur lors de l'exportation en JSON: ${error.message}` };
  }
}


// Placeholder CRUD actions
export async function addLotteryResultAction(resultData: Omit<LotteryResult, 'clientId'>): Promise<{ success: boolean; error?: string; message?: string, result?: LotteryResult }> {
  // Normalize machine numbers: if [0,0,0,0,0] or undefined, treat as empty []
  let machineNumbers = Array.isArray(resultData.machine) ? resultData.machine : [];
  if (machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
    machineNumbers = [];
  }
  const newResult = { 
    ...resultData, 
    machine: machineNumbers, 
    clientId: Date.now().toString() 
  }; 
  return { success: true, message: "Résultat ajouté avec succès (simulation).", result: newResult };
}

export async function updateLotteryResultAction(clientId: string, resultData: Partial<Omit<LotteryResult, 'clientId'>>): Promise<{ success: boolean; error?: string; message?: string, result?: LotteryResult }> {
  let machineNumbersToUpdate: number[] | undefined = undefined;

  if (resultData.machine !== undefined) { // Only process if machine is part of the update
    machineNumbersToUpdate = Array.isArray(resultData.machine) ? resultData.machine : [];
    if (machineNumbersToUpdate.length === 5 && machineNumbersToUpdate.every(n => n === 0)) {
      machineNumbersToUpdate = [];
    }
  }

  const finalResultData: Partial<LotteryResult> = { ...resultData };
  if (machineNumbersToUpdate !== undefined) {
    finalResultData.machine = machineNumbersToUpdate;
  }
  
  const simulatedUpdatedResult: LotteryResult = {
      clientId,
      draw_name: resultData.draw_name || "", 
      date: resultData.date || "", 
      gagnants: resultData.gagnants || [], 
      machine: machineNumbersToUpdate === undefined ? [] : machineNumbersToUpdate, 
      ...(resultData as Partial<LotteryResult>) 
  };
  
  return { success: true, message: "Résultat mis à jour avec succès (simulation).", result: simulatedUpdatedResult };
}

export async function deleteLotteryResultAction(clientId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: "Résultat supprimé avec succès (simulation)." };
}

export async function resetCategoryDataAction(category: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: `Données pour la catégorie ${category} réinitialisées (simulation).` };
}
