// src/app/admin/actions.ts
'use server';

import type { LotteryResult } from '@/types/lottery';
import { getUniqueDrawNames } from '@/config/draw-schedule';
import { format, parseISO, isValid, parse as dateParse } from 'date-fns';
import { z } from 'zod';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // Augments jsPDF
import pdfParse from 'pdf-parse'; // For parsing PDF content
import { fr } from 'date-fns/locale';


// Schema for validating a single lottery result within the JSON
const LotteryResultSchemaForJson = z.object({
  draw_name: z.string().min(1),
  date: z.string().refine(val => {
    try {
      // Attempt to parse with common date formats, ensure it's YYYY-MM-DD
      const parsed = dateParse(val, 'yyyy-MM-dd', new Date());
      return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === val;
    } catch {
      return false;
    }
  }, { message: "Invalid date format, expected YYYY-MM-DD" }),
  gagnants: z.array(z.number().int().min(1).max(90)).length(5),
  machine: z.array(z.number().int().min(0).max(90)) // Allow 0 for items initially for validation
    .refine(arr => {
        if (arr.length === 0) return true; // Empty array is fine
        if (arr.length === 5) {
            // If all are 0, it's fine (representing "no numbers" placeholder)
            if (arr.every(num => num === 0)) return true;
            // Otherwise, all must be between 1 and 90 (actual lottery numbers)
            return arr.every(num => num >= 1 && num <= 90);
        }
        return false; // Must be 0 or 5 numbers
    }, {
        message: "Les numéros machine doivent être: un tableau vide, OU un tableau de 5 numéros (chacun entre 1 et 90), OU un tableau de cinq zéros pour indiquer l'absence de numéros machine.",
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
    
    const allImportedResults: LotteryResult[] = validationResult.data.map(item => {
      let machineNumbers = Array.isArray(item.machine) ? item.machine : [];
      // Normalize [0,0,0,0,0] to [] if that's the convention for "no machine numbers"
      if (machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
        machineNumbers = [];
      }
      return {
        ...item,
        machine: machineNumbers, 
        // clientId is optional in schema but required in LotteryResult type if not provided
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
      
    const jsonString = JSON.stringify(sortedResultsToExport.map(({clientId, ...rest}) => rest ), null, 2); // Remove clientId for export
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
  let machineNumbers = Array.isArray(resultData.machine) ? resultData.machine : [];
  if (resultData.machine && machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
    machineNumbers = [];
  } else if (!resultData.machine) { // if machine is not part of partial update, keep existing
      // This logic is tricky; ideally fetch existing result then merge.
      // For simulation, we assume resultData provides the new machine state or undefined.
      // If resultData.machine is undefined, it means 'machine' field was not part of the update.
      // This simulated action doesn't have access to 'previous state' to merge.
      // Let's assume if resultData.machine is part of the payload, it is the new state.
  }

  const updatedResult = { 
      clientId, 
      ...resultData,
      machine: resultData.machine !== undefined ? machineNumbers : undefined, // only update if provided
    } as LotteryResult; 

  // Filter out undefined machine field if it was not part of the update.
  // This is a bit hacky for simulation. A real DB update would handle partials better.
  const finalResult: any = { clientId };
  if(resultData.date) finalResult.date = resultData.date;
  if(resultData.draw_name) finalResult.draw_name = resultData.draw_name;
  if(resultData.gagnants) finalResult.gagnants = resultData.gagnants;
  if(resultData.machine !== undefined) finalResult.machine = machineNumbers;
  
  return { success: true, message: "Résultat mis à jour avec succès (simulation).", result: finalResult as LotteryResult };
}

export async function deleteLotteryResultAction(clientId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: "Résultat supprimé avec succès (simulation)." };
}

export async function resetCategoryDataAction(category: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: `Données pour la catégorie ${category} réinitialisées (simulation).` };
}


// PDF Import/Export (Simplified for example)
const extractNumbers = (text: string | null): number[] => {
  if (!text) return [];
  return text.match(/\d+/g)?.map(Number) || [];
};

export async function importLotteryDataFromPdf(
  formData: FormData,
  filterDrawName?: string | null
): Promise<{ success: boolean; data?: LotteryResult[]; error?: string; message?: string; importedCount?: number, originalCount?: number }> {
  const file = formData.get('pdfFile') as File;

  if (!file) {
    return { success: false, error: 'Aucun fichier PDF fourni.' };
  }
  if (file.type !== 'application/pdf') {
    return { success: false, error: 'Type de fichier invalide. Veuillez uploader un fichier PDF.' };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfData = await pdfParse(arrayBuffer);
    const text = pdfData.text;
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    const results: LotteryResult[] = [];
    let currentDrawName: string | null = null;
    let currentDate: string | null = null;

    // Example parsing logic (highly dependent on PDF structure)
    // This is a very simplified and potentially fragile parser.
    // A more robust parser would use regex based on the specific PDF format.
    for (const line of lines) {
      // Heuristic: If a line matches a known draw name, set it as current
      const knownDrawName = getUniqueDrawNames().find(dn => line.includes(dn));
      if (knownDrawName) {
        currentDrawName = knownDrawName;
        // Attempt to extract date if on the same line or nearby, this is very naive
        // Example: "Loto Bonheur Diamant - Samedi 06 Juillet 2024"
        const dateMatch = line.match(/(\d{1,2})\s+(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+(\d{4})/i);
        if (dateMatch) {
            try {
                const day = parseInt(dateMatch[1], 10);
                const monthName = dateMatch[2];
                const year = parseInt(dateMatch[3], 10);
                // Convert French month name to number. Locale 'fr' is important.
                const tempDate = dateParse(`${day} ${monthName} ${year}`, 'd MMMM yyyy', new Date(), { locale: fr });
                if (isValid(tempDate)) {
                    currentDate = format(tempDate, 'yyyy-MM-dd');
                }
            } catch (e) { console.warn("Could not parse date from line:", line); }
        }
        continue;
      }

      if (currentDrawName && currentDate) {
        if (line.toLowerCase().startsWith("gagnant:") || line.toLowerCase().startsWith("gagnants:")) {
          const gagnants = extractNumbers(line.substring(line.indexOf(':') + 1)).slice(0, 5);
          
          // Try to find machine numbers on the next relevant line
          const nextLineIndex = lines.indexOf(line) + 1;
          let machine: number[] = [];
          if (nextLineIndex < lines.length) {
              const nextLine = lines[nextLineIndex];
              if (nextLine.toLowerCase().startsWith("machine:")) {
                  machine = extractNumbers(nextLine.substring(nextLine.indexOf(':') + 1)).slice(0,5);
              }
          }
          
          if (gagnants.length === 5) {
            let machineNumbers = Array.isArray(machine) ? machine : [];
            if (machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
                machineNumbers = [];
            } else if (machineNumbers.length > 0 && machineNumbers.length < 5) {
                // If some machine numbers found but not 5, treat as invalid/incomplete for this entry.
                // Depending on strictness, might make machineNumbers = []
                console.warn(`Incomplete machine numbers for ${currentDrawName} on ${currentDate}: ${machineNumbers.join(',')}`);
            }


            results.push({
              draw_name: currentDrawName,
              date: currentDate,
              gagnants,
              machine: machineNumbers.length === 5 || machineNumbers.length === 0 ? machineNumbers : [], // only accept 0 or 5
              clientId: `${currentDrawName}-${currentDate}-${Math.random().toString(36).substring(2, 9)}`
            });
            // Reset for next entry unless date is part of a block
            // currentDrawName = null; 
            // currentDate = null; // This depends on PDF structure, if multiple results share a date/draw header.
          }
        }
      }
    }
    
    const originalCount = results.length;
    let filteredResults = results;
     if (filterDrawName && filterDrawName !== "all") {
      filteredResults = results.filter(r => r.draw_name === filterDrawName);
    }
    const importedCount = filteredResults.length;

    if (results.length === 0) {
      return { success: false, error: 'Aucun résultat valide n\'a pu être extrait du PDF. Vérifiez la structure du PDF.' };
    }

    return { 
        success: true, 
        data: filteredResults, 
        importedCount,
        originalCount,
        message: `${originalCount} résultat(s) lu(s) depuis le PDF. ${importedCount} après filtre.` 
    };

  } catch (error: any) {
    console.error('Error parsing PDF for import:', error);
    return { success: false, error: `Erreur lors de l'analyse du PDF: ${error.message || 'Erreur inconnue'}` };
  }
}

export async function exportLotteryDataToPdf(
  allResults: LotteryResult[],
  filterDrawName?: string | null
): Promise<{ success: boolean; pdfBlob?: Blob; fileName?: string; error?: string }> {
  const resultsToExport = (filterDrawName && filterDrawName !== "all")
    ? allResults.filter(r => r.draw_name === filterDrawName)
    : allResults;

  if (!resultsToExport || resultsToExport.length === 0) {
    return { success: false, error: 'Aucune donnée à exporter (après application du filtre).' };
  }

  try {
    const doc = new jsPDF();
    const sortedResults = [...resultsToExport].sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date);
      if (dateComparison !== 0) return dateComparison;
      return a.draw_name.localeCompare(b.draw_name);
    });

    doc.setFontSize(18);
    doc.text(`Export Résultats LotoBonheur${filterDrawName && filterDrawName !== "all" ? ` - ${filterDrawName}` : ' - Tous'}`, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Exporté le: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })}`, 14, 30);


    const tableColumn = ["Date", "Tirage", "Gagnants", "Machine"];
    const tableRows: (string | number)[][] = [];

    sortedResults.forEach(result => {
      const resultData = [
        format(parseISO(result.date), 'dd/MM/yyyy'),
        result.draw_name,
        result.gagnants.join(', '),
        result.machine && result.machine.length > 0 ? result.machine.join(', ') : 'N/A'
      ];
      tableRows.push(resultData);
    });

    (doc as any).autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        theme: 'grid',
        headStyles: { fillColor: [22, 160, 133] }, // Example: Teal header
        styles: { font: "helvetica", fontSize: 9 },
    });
    
    const pdfBlob = doc.output('blob');
    const currentDate = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `LotoBonheurInsights_Export_${filterDrawName && filterDrawName !== "all" ? filterDrawName.replace(/\s+/g, '_') : 'Tous'}_${currentDate}.pdf`;

    return { success: true, pdfBlob, fileName };

  } catch (error: any) {
    console.error('Error exporting PDF:', error);
    return { success: false, error: `Erreur lors de l'exportation en PDF: ${error.message}` };
  }
}