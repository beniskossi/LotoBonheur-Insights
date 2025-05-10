// src/app/admin/actions.ts
'use server';

import type { LotteryResult } from '@/types/lottery';
import { getUniqueDrawNames } from '@/config/draw-schedule';
import { format, parseISO, isValid, parse as dateParse } from 'date-fns';
import { z } from 'zod';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // Augments jsPDF
// import pdfParse from 'pdf-parse'; // Removed top-level static import
import { fr } from 'date-fns/locale';


// Schema for validating a single lottery result within the JSON
const LotteryResultSchemaForJson = z.object({
  draw_name: z.string().min(1),
  date: z.string().refine(val => {
    try {
      const parsed = dateParse(val, 'yyyy-MM-dd', new Date());
      return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === val;
    } catch {
      return false;
    }
  }, { message: "Invalid date format, expected YYYY-MM-DD" }),
  gagnants: z.array(z.number().int().min(1).max(90)).length(5),
  machine: z.array(z.number().int().min(0).max(90)) 
    .refine(arr => {
        if (arr.length === 0) return true; 
        if (arr.length === 5) {
            if (arr.every(num => num === 0)) return true;
            return arr.every(num => num >= 1 && num <= 90);
        }
        return false; 
    }, {
        message: "Les numéros machine doivent être: un tableau vide, OU un tableau de 5 numéros (chacun entre 1 et 90), OU un tableau de cinq zéros pour indiquer l'absence de numéros machine.",
    }).optional(), // Make the machine field itself optional in the JSON
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
      const errorMessages = validationResult.error.errors.map(e => `Path: ${e.path.join('.')}, Message: ${e.message}`).join('; ');
      return { success: false, error: `Le fichier JSON n'a pas le format attendu. Erreurs: ${errorMessages}` };
    }
    
    const allImportedResults: LotteryResult[] = validationResult.data.map(item => {
      // If item.machine is undefined (due to .optional()), default to empty array.
      let machineNumbers = Array.isArray(item.machine) ? item.machine : [];
      // Normalize [0,0,0,0,0] to [] if that's the convention for "no machine numbers"
      if (machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
        machineNumbers = [];
      }
      return {
        draw_name: item.draw_name, // These are guaranteed by schema
        date: item.date,
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
    const currentDate = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `Lotocrack_Export_Admin_${filterDrawName && filterDrawName !== "all" ? filterDrawName.replace(/\s+/g, '_') : 'Tous'}_${currentDate}.json`;

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

  // Construct the final result for simulation, applying updates
  // This is simplified; a real DB update would merge with existing data
  const finalResultData: Partial<LotteryResult> = { ...resultData };
  if (machineNumbersToUpdate !== undefined) {
    finalResultData.machine = machineNumbersToUpdate;
  }
  
  // Simulate the update by creating a result object that reflects the changes
  const simulatedUpdatedResult: LotteryResult = {
      clientId,
      draw_name: resultData.draw_name || "", // Fallback for simulation
      date: resultData.date || "", // Fallback for simulation
      gagnants: resultData.gagnants || [], // Fallback for simulation
      machine: machineNumbersToUpdate === undefined ? [] : machineNumbersToUpdate, // Default to [] if not updated
      ...(resultData as Partial<LotteryResult>) // Apply other partial updates
  };
  
  return { success: true, message: "Résultat mis à jour avec succès (simulation).", result: simulatedUpdatedResult };
}

export async function deleteLotteryResultAction(clientId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: "Résultat supprimé avec succès (simulation)." };
}

export async function resetCategoryDataAction(category: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: `Données pour la catégorie ${category} réinitialisées (simulation).` };
}


// PDF Import/Export
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
    const pdfParse = (await import('pdf-parse')).default; // Dynamic import
    const arrayBuffer = await file.arrayBuffer();
    const pdfData = await pdfParse(arrayBuffer);
    const text = pdfData.text;
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    const results: LotteryResult[] = [];
    let currentDrawName: string | null = null;
    let currentDate: string | null = null;

    for (const line of lines) {
      const knownDrawName = getUniqueDrawNames().find(dn => line.toLowerCase().includes(dn.toLowerCase()));
      if (knownDrawName) {
        currentDrawName = knownDrawName;
        // Try to extract date from the same line as draw name, assuming format like "DRAW NAME - DD Mois YYYY" or "DRAW NAME DD Mois YYYY"
        const dateMatch = line.match(/(\d{1,2})\s+(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+(\d{4})/i);
        if (dateMatch) {
            try {
                const day = parseInt(dateMatch[1], 10);
                const monthName = dateMatch[2];
                const year = parseInt(dateMatch[3], 10);
                const tempDate = dateParse(`${day} ${monthName} ${year}`, 'd MMMM yyyy', new Date(), { locale: fr });
                if (isValid(tempDate)) {
                    currentDate = format(tempDate, 'yyyy-MM-dd');
                } else {
                    currentDate = null; // Reset if date parsing fails for a new draw name line
                }
            } catch (e) { 
                console.warn("Could not parse date from draw name line:", line); 
                currentDate = null;
            }
        } else {
             currentDate = null; // If no date on this line, reset
        }
        continue; // Move to next line after processing draw name and potentially date
      }


      // If we have a draw name and date, look for Gagnants and Machine
      if (currentDrawName && currentDate) {
        if (line.toLowerCase().startsWith("gagnant:") || line.toLowerCase().startsWith("gagnants:")) {
          const gagnants = extractNumbers(line.substring(line.indexOf(':') + 1)).slice(0, 5);
          
          let machine: number[] = [];
          const nextLineIndex = lines.indexOf(line) + 1;
          if (nextLineIndex < lines.length) {
              const nextLine = lines[nextLineIndex];
              if (nextLine.toLowerCase().startsWith("machine:")) {
                  machine = extractNumbers(nextLine.substring(nextLine.indexOf(':') + 1)).slice(0,5);
                  // Normalize machine numbers: [0,0,0,0,0] or invalid length becomes []
                  if (machine.length === 5 && machine.every(n => n === 0)) {
                      machine = [];
                  } else if (machine.length > 0 && machine.length < 5) { // If some numbers but not 5, consider invalid
                      machine = [];
                  }
              }
          }
          
          if (gagnants.length === 5) { // Only add if we have 5 winning numbers
            results.push({
              draw_name: currentDrawName,
              date: currentDate,
              gagnants,
              machine: machine, // machine is already normalized or empty
              clientId: `${currentDrawName}-${currentDate}-${Math.random().toString(36).substring(2, 9)}`
            });
            // Reset currentDrawName and currentDate after successfully parsing a full result set for them
            // to avoid reusing the same date for subsequent non-Gagnant lines under a new draw name.
            // However, if the PDF structure groups multiple Gagnant/Machine lines under one Draw/Date header,
            // this reset might be too aggressive. For now, assume one result set per Draw/Date header.
            // currentDrawName = null;
            // currentDate = null; 
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
      return { success: false, error: 'Aucun résultat valide n\'a pu être extrait du PDF. Vérifiez la structure du PDF: Chaque tirage doit avoir un nom de tirage connu et une date valide sur la même ligne, suivis de "Gagnants:" et optionnellement "Machine:" sur les lignes suivantes.' };
    }

    return { 
        success: true, 
        data: filteredResults, 
        importedCount,
        originalCount,
        message: `${originalCount} résultat(s) lu(s) depuis le PDF. ${importedCount} après filtre pour "${filterDrawName || 'tous'}".` 
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

    doc.setFontSize(16);
    doc.text(`Lotocrack - Résultats de Loterie`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Catégorie: ${filterDrawName && filterDrawName !== "all" ? filterDrawName : 'Toutes les catégories'}`, 14, 28);
    doc.setFontSize(10);
    doc.text(`Exporté le: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })}`, 14, 34);
    doc.text(`Total résultats: ${sortedResults.length}`, 14, 40);


    const tableColumn = ["Date du Tirage", "Nom du Tirage", "Numéros Gagnants", "Numéros Machine"];
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
        startY: 50, 
        theme: 'striped', // 'striped', 'grid', 'plain'
        headStyles: { fillColor: [22, 160, 133] }, // Teal like color for header
        styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
        alternateRowStyles: { fillColor: [245, 245, 245] }, // Light gray for alternate rows
    });
    
    const pdfBlob = doc.output('blob');
    const currentDate = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `Lotocrack_Export_${filterDrawName && filterDrawName !== "all" ? filterDrawName.replace(/\s+/g, '_') : 'Tous'}_${currentDate}.pdf`;

    return { success: true, pdfBlob, fileName };

  } catch (error: any) {
    console.error('Error exporting PDF:', error);
    return { success: false, error: `Erreur lors de l'exportation en PDF: ${error.message}` };
  }
}

