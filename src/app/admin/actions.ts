// src/app/admin/actions.ts
'use server';

import type { LotteryResult } from '@/types/lottery';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // Augments jsPDF
import { DRAW_SCHEDULE, getUniqueDrawNames } from '@/config/draw-schedule';
import { format, parse as dateParse } from 'date-fns';
import { fr } from 'date-fns/locale';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

function findDrawTime(drawName: string): string | undefined {
  for (const daySchedule of Object.values(DRAW_SCHEDULE)) {
    for (const [time, name] of Object.entries(daySchedule)) {
      if (name === drawName) {
        return time;
      }
    }
  }
  return undefined;
}

export async function importLotteryDataFromPdf(
  formData: FormData,
  filterDrawName?: string | null
): Promise<{ success: boolean; data?: LotteryResult[]; error?: string; message?: string; importedCount?: number, filteredCount?: number, originalCount?: number }> {
  const file = formData.get('pdfFile') as File;

  if (!file) {
    return { success: false, error: 'Aucun fichier fourni.' };
  }

  if (file.type !== 'application/pdf') {
    return { success: false, error: 'Type de fichier invalide. Veuillez uploader un PDF.' };
  }

  try {
    const pdfParse = (await import('pdf-parse')).default;
    const arrayBuffer = await file.arrayBuffer();
    const data = await pdfParse(Buffer.from(arrayBuffer));

    const lines = data.text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const allImportedResults: LotteryResult[] = [];
    let currentDrawName: string | null = null;
    const uniqueDrawNames = getUniqueDrawNames();
    
    const drawNameTitlePattern = /TIRAGE DE (?:\d{1,2}H\d{1,2}\s+)?(.+)/i;
    const dataLinePattern = /^(\d+)\s+([\d]{1,2}\s+[a-zA-Zûé]+\s+\d{4})\s+((?:\s*\d{1,2}){10,})/;


    for (const line of lines) {
      const upperLine = line.toUpperCase();
      const drawNameMatch = upperLine.match(drawNameTitlePattern);

      if (drawNameMatch && drawNameMatch[1]) {
        const parsedDrawNameFromTitle = drawNameMatch[1].trim();
        currentDrawName = uniqueDrawNames.find(dn => dn.toUpperCase() === parsedDrawNameFromTitle.toUpperCase()) || null;
        continue; 
      }
      
      const dataMatch = line.match(dataLinePattern);

      if (dataMatch && currentDrawName) {
        const dateStr = dataMatch[2];
        const numbersStr = dataMatch[3].trim();
        
        let parsedDate: Date;
        try {
          parsedDate = dateParse(dateStr, "d MMMM yyyy", new Date(), { locale: fr });
          if (isNaN(parsedDate.getTime())) {
            parsedDate = dateParse(dateStr, "dd/MM/yyyy", new Date());
          }
        } catch (e) {
          console.warn("Could not parse date from PDF line:", dateStr, line, e);
          continue;
        }

        if (isNaN(parsedDate.getTime())) {
          console.warn("Invalid date parsed from PDF line:", dateStr, line);
          continue;
        }
        const formattedDate = format(parsedDate, 'yyyy-MM-dd');
        
        const allNumbers = Array.from(numbersStr.matchAll(/(\d{1,2})/g)).map(m => parseInt(m[1]));

        if (allNumbers.length >= 10) {
          const gagnants = allNumbers.slice(0, 5);
          const machine = allNumbers.slice(5, 10); 
          const isValidNumber = (n: number) => n >= 1 && n <= 90;

          if (gagnants.every(isValidNumber) && machine.every(isValidNumber)) {
            allImportedResults.push({
              draw_name: currentDrawName,
              date: formattedDate,
              gagnants,
              machine,
            });
          }
        }
      }
    }

    const originalCount = allImportedResults.length;
    let filteredResults = allImportedResults;

    if (filterDrawName && filterDrawName !== "all") {
      filteredResults = allImportedResults.filter(r => r.draw_name === filterDrawName);
    }
    
    const filteredCount = filteredResults.length;

    if (originalCount === 0 && lines.length > 0) {
      return { success: false, error: 'Aucune donnée de tirage valide n\'a pu être extraite du PDF. Vérifiez le format du titre du tirage (ex: TIRAGE DE 10H00 REVEIL) et des lignes de données.' };
    }
    if (originalCount === 0 && lines.length === 0) {
      return { success: false, error: 'Le fichier PDF semble vide ou ne contient aucun texte extractible.' };
    }

    let message = `${originalCount} résultats lus depuis le PDF.`;
    if (filterDrawName && filterDrawName !== "all") {
      message += ` ${filteredCount} résultats correspondent au filtre "${filterDrawName}".`;
    } else {
      message += ` ${filteredCount} résultats importés (aucun filtre appliqué ou "Toutes les catégories" sélectionné).`;
    }

    return { success: true, data: filteredResults, importedCount: filteredCount, message, originalCount, filteredCount };

  } catch (error: any) {
    console.error('Error parsing PDF for import:', error);
    return { success: false, error: `Erreur lors de l'analyse du PDF: ${error.message}` };
  }
}

export async function exportLotteryDataToPdf(
  allResults: LotteryResult[],
  filterDrawName?: string | null
): Promise<{ success: boolean; pdfData?: string; fileName?: string; error?: string }> {
  
  const resultsToExport = (filterDrawName && filterDrawName !== "all")
    ? allResults.filter(r => r.draw_name === filterDrawName)
    : allResults;

  if (!resultsToExport || resultsToExport.length === 0) {
    return { success: false, error: 'Aucune donnée à exporter (après application du filtre).' };
  }

  try {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const uniqueDrawsInExport = getUniqueDrawNames().filter(dn => 
        (filterDrawName && filterDrawName !== "all") ? dn === filterDrawName : resultsToExport.some(r => r.draw_name === dn)
    );
    const groupedResults: Record<string, LotteryResult[]> = {};

    for (const result of resultsToExport) {
      if (!groupedResults[result.draw_name]) {
        groupedResults[result.draw_name] = [];
      }
      groupedResults[result.draw_name].push(result);
    }

    let firstPage = true;
    for (const drawName of uniqueDrawsInExport) {
      const drawResults = (groupedResults[drawName] || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (drawResults.length === 0) continue;

      if (!firstPage) {
        doc.addPage();
      }
      firstPage = false;

      const drawTime = findDrawTime(drawName) || "";
      doc.setFontSize(16);
      doc.text(`TIRAGE DE ${drawTime} ${drawName.toUpperCase()}`, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`Résultats des ${drawResults.length} derniers tirages`, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });

      const tableHead = [
        [
          { content: 'Tirage N°', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold', fillColor: [230, 230, 230] } },
          { content: 'Date', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold', fillColor: [230, 230, 230] } },
          { content: '5 PREMIERS CHIFFRES TIRES', colSpan: 5, styles: { halign: 'center', fontStyle: 'bold', fillColor: [200, 220, 255] } },
          { content: '5 DERNIERS CHIFFRES TIRES', colSpan: 5, styles: { halign: 'center', fontStyle: 'bold', fillColor: [255, 220, 200] } }
        ],
        [
          '1er N° tiré', '2ème N° tiré', '3ème N° tiré', '4ème N° tiré', '5ème N° tiré',
          '86ème N° tiré', '87ème N° tiré', '88ème N° tiré', '89ème N° tiré', '90ème N° tiré'
        ]
      ];
      
      const tableRows: (string | number)[][] = [];
      const totalDrawsInCategory = drawResults.length;

      drawResults.forEach((result, index) => {
        const formattedDate = format(dateParse(result.date, 'yyyy-MM-dd', new Date()), 'dd MMMM yyyy', { locale: fr });
        const tirageNo = totalDrawsInCategory - index; 
        const rowData = [tirageNo, formattedDate, ...result.gagnants, ...result.machine];
        tableRows.push(rowData);
      });

      doc.autoTable({
        head: tableHead,
        body: tableRows,
        startY: 30,
        theme: 'grid',
        headStyles: { fontStyle: 'bold', halign: 'center', fontSize: 8, cellPadding: 1.5 },
        columnStyles: {
          0: { halign: 'center', cellWidth: 15 }, 
          1: { halign: 'left', cellWidth: 25 },   
          2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' },
          7: { halign: 'center' }, 8: { halign: 'center' }, 9: { halign: 'center' }, 10: { halign: 'center' }, 11: { halign: 'center' },
        },
        styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
        didDrawPage: (data) => {
          doc.setFontSize(10);
          doc.text(`Page ${doc.internal.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
        }
      });
    }

    const pdfOutput = doc.output('datauristring');
    const base64Data = pdfOutput.substring(pdfOutput.indexOf(',') + 1);
    const currentDate = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `LotoBonheurInsights_Export_Admin_${filterDrawName && filterDrawName !== "all" ? filterDrawName.replace(/\s+/g, '_') : 'Tous'}_${currentDate}.pdf`;

    return { success: true, pdfData: base64Data, fileName };

  } catch (error: any) {
    console.error('Error exporting PDF from admin:', error);
    return { success: false, error: `Erreur lors de l'exportation en PDF: ${error.message}` };
  }
}


// Placeholder CRUD actions
export async function addLotteryResultAction(resultData: Omit<LotteryResult, 'clientId'>): Promise<{ success: boolean; error?: string; message?: string, result?: LotteryResult }> {
  const newResult = { ...resultData, clientId: Date.now().toString() }; 
  return { success: true, message: "Résultat ajouté avec succès (simulation).", result: newResult };
}

export async function updateLotteryResultAction(clientId: string, resultData: Partial<Omit<LotteryResult, 'clientId'>>): Promise<{ success: boolean; error?: string; message?: string, result?: LotteryResult }> {
  const updatedResult = { clientId, ...resultData } as LotteryResult; 
  return { success: true, message: "Résultat mis à jour avec succès (simulation).", result: updatedResult };
}

export async function deleteLotteryResultAction(clientId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: "Résultat supprimé avec succès (simulation)." };
}

export async function resetCategoryDataAction(category: string): Promise<{ success: boolean; error?: string; message?: string }> {
  return { success: true, message: `Données pour la catégorie ${category} réinitialisées (simulation).` };
}
