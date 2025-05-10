// src/app/admin/actions.ts
'use server';

import type { LotteryResult } from '@/types/lottery';
import { getUniqueDrawNames } from '@/config/draw-schedule';
import { format, parseISO } from 'date-fns';
import { z } from 'zod';

// Schema for validating a single lottery result within the JSON
const LotteryResultSchemaForJson = z.object({
  draw_name: z.string().min(1),
  date: z.string().refine(val => {
    try {
      return !!parseISO(val) && val.match(/^\d{4}-\d{2}-\d{2}$/);
    } catch {
      return false;
    }
  }, { message: "Invalid date format, expected YYYY-MM-DD" }),
  gagnants: z.array(z.number().min(1).max(90)).length(5),
  machine: z.array(z.number().min(1, "Le numéro machine doit être entre 1 et 90.").max(90, "Le numéro machine doit être entre 1 et 90.")) 
    .refine(arr => arr.length === 0 || arr.length === 5, {
      message: "Les numéros machine doivent être soit un tableau vide, soit un tableau de 5 numéros.",
    }),
  clientId: z.string().optional(), // clientId is optional in the import file
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
      const errorMessages = validationResult.error.errors.map(e => `Path: ${e.path.join('.')}, Message: ${e.message}`).join('; ');
      return { success: false, error: `Le fichier JSON n'a pas le format attendu. Erreurs: ${errorMessages}` };
    }
    
    const allImportedResults: LotteryResult[] = validationResult.data.map(item => ({
      ...item,
      // Ensure machine is an empty array if not present or empty, matching LotteryResult type
      machine: Array.isArray(item.machine) ? item.machine : [], 
    }));


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
      
    const jsonString = JSON.stringify(sortedResultsToExport, null, 2);
    const currentDate = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `LotoBonheurInsights_Export_Admin_${filterDrawName && filterDrawName !== "all" ? filterDrawName.replace(/\s+/g, '_') : 'Tous'}_${currentDate}.json`;

    return { success: true, jsonData: jsonString, fileName };

  } catch (error: any) {
    console.error('Error exporting JSON from admin:', error);
    return { success: false, error: `Erreur lors de l'exportation en JSON: ${error.message}` };
  }
}


// Placeholder CRUD actions
export async function addLotteryResultAction(resultData: Omit<LotteryResult, 'clientId'>): Promise<{ success: boolean; error?: string; message?: string, result?: LotteryResult }> {
  const newResult = { 
    ...resultData, 
    machine: Array.isArray(resultData.machine) ? resultData.machine : [], 
    clientId: Date.now().toString() 
  }; 
  return { success: true, message: "Résultat ajouté avec succès (simulation).", result: newResult };
}

export async function updateLotteryResultAction(clientId: string, resultData: Partial<Omit<LotteryResult, 'clientId'>>): Promise<{ success: boolean; error?: string; message?: string, result?: LotteryResult }> {
  const updatedResult = { 
      clientId, 
      ...resultData,
      machine: Array.isArray(resultData.machine) ? resultData.machine : [], 
    } as LotteryResult; 
  return { success: true, message: "Résultat mis à jour avec succès (simulation).", result: updatedResult };
}

export async function deleteLotteryResultAction(clientId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: "Résultat supprimé avec succès (simulation)." };
}

export async function resetCategoryDataAction(category: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: `Données pour la catégorie ${category} réinitialisées (simulation).` };
}

