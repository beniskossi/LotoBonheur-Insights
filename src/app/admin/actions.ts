// src/app/admin/actions.ts
'use server';

import type { LotteryResult } from '@/types/lottery';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // Augments jsPDF
// import pdf from 'pdf-parse'; // Static import removed/commented to ensure dynamic loading
import { DRAW_SCHEDULE, getUniqueDrawNames } from '@/config/draw-schedule';
import { format, parse as dateParse } from 'date-fns';
import { fr } from 'date-fns/locale';

// Extend jsPDF with autoTable - this is how jspdf-autotable works
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}


export async function importLotteryDataFromPdf(formData: FormData): Promise<{ success: boolean; message?: string; error?: string; importedCount?: number }> {
  const file = formData.get('pdfFile') as File;

  if (!file) {
    return { success: false, error: 'Aucun fichier fourni.' };
  }

  if (file.type !== 'application/pdf') {
    return { success: false, error: 'Type de fichier invalide. Veuillez uploader un PDF.' };
  }

  try {
    // Dynamically import pdf-parse ONLY when the function is called and file is validated
    const pdfParse = (await import('pdf-parse')).default;
    const arrayBuffer = await file.arrayBuffer();
    const data = await pdfParse(Buffer.from(arrayBuffer));


    const lines = data.text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const importedResults: LotteryResult[] = [];
    let currentDrawName: string | null = null;

    const uniqueDrawNames = getUniqueDrawNames(); 

    for (const line of lines) {
      const upperLine = line.toUpperCase();
      if (upperLine.startsWith("TIRAGE DE ")) {
        const potentialDrawNamePart = upperLine.substring("TIRAGE DE ".length).split(" ")[1]; 
        if (potentialDrawNamePart) {
            const foundDraw = uniqueDrawNames.find(dn => dn.toUpperCase().includes(potentialDrawNamePart));
            if (foundDraw) {
                currentDrawName = foundDraw;
            }
        }
      }
      
      const datePattern = /(\d{1,2}\s+[a-zA-Zûé]+\s+\d{4})/; 
      const numberSequencePattern = /(\d{1,2})/g;

      const dateMatch = line.match(datePattern);
      
      if (dateMatch && currentDrawName) {
        const dateStr = dateMatch[1];
        const numbersStr = line.substring(dateMatch[0].length).trim();
        
        let parsedDate: Date;
        try {
          parsedDate = dateParse(dateStr, "d MMMM yyyy", new Date(), { locale: fr });
           if (isNaN(parsedDate.getTime())) {
             parsedDate = dateParse(dateStr, "dd/MM/yyyy", new Date());
           }
        } catch (e) {
          console.warn("Could not parse date from PDF line:", dateStr, line);
          continue;
        }

        if (isNaN(parsedDate.getTime())) {
            console.warn("Invalid date parsed from PDF line:", dateStr, line);
            continue;
        }

        const formattedDate = format(parsedDate, 'yyyy-MM-dd');
        
        const allNumbers = Array.from(numbersStr.matchAll(numberSequencePattern)).map(m => parseInt(m[1]));

        if (allNumbers.length >= 10) { 
          const gagnants = allNumbers.slice(0, 5);
          const machine = allNumbers.slice(5, 10);

          const isValidNumber = (n: number) => n >= 1 && n <= 90;
          if (gagnants.every(isValidNumber) && machine.every(isValidNumber)) {
            importedResults.push({
              draw_name: currentDrawName,
              date: formattedDate,
              gagnants,
              machine,
            });
          }
        }
      }
    }


    if (importedResults.length === 0 && lines.length > 0) {
      return { success: false, error: 'Aucune donnée de tirage valide n\'a pu être extraite du PDF. Le format du PDF pourrait ne pas être compatible ou le PDF est peut-être basé sur une image.' };
    }
    if (importedResults.length === 0 && lines.length === 0) {
        return { success: false, error: 'Le fichier PDF semble vide ou ne contient aucun texte extractible.' };
    }


    // TODO: Implement actual database save operation for `importedResults`
    console.log(`Successfully parsed ${importedResults.length} results from PDF.`);


    return { success: true, message: `${importedResults.length} résultats importés avec succès. (Simulation - sauvegarde BDD non implémentée)`, importedCount: importedResults.length };

  } catch (error: any) {
    console.error('Error parsing PDF:', error);
    return { success: false, error: `Erreur lors de l'analyse du PDF: ${error.message}` };
  }
}


export async function exportLotteryDataToPdf(): Promise<{ success: boolean; pdfData?: string; fileName?: string; error?: string }> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
    const response = await fetch(`${appUrl}/api/results`);
    
    if (!response.ok) {
      let errorBody = 'Unknown error from API';
      try {
        errorBody = (await response.json()).error || `Erreur API: ${response.status}`;
      } catch (e) { /* ignore if cannot parse json */ }
      return { success: false, error: errorBody };
    }
    const results: LotteryResult[] = await response.json();

    if (!results || results.length === 0) {
      return { success: false, error: 'Aucune donnée à exporter.' };
    }

    const doc = new jsPDF() as jsPDFWithAutoTable;
    const uniqueDraws = getUniqueDrawNames(); 

    const groupedResults: Record<string, LotteryResult[]> = {};
    for (const result of results) {
        if (!groupedResults[result.draw_name]) {
            groupedResults[result.draw_name] = [];
        }
        groupedResults[result.draw_name].push(result);
    }

    let firstPage = true;

    for (const drawName of uniqueDraws) {
        const drawResults = groupedResults[drawName] || [];
        if (drawResults.length === 0) continue;

        if (!firstPage) {
            doc.addPage();
        }
        firstPage = false;

        doc.setFontSize(18);
        doc.text(`TIRAGE ${drawName.toUpperCase()}`, 14, 22);
        doc.setFontSize(12);
        doc.text(`Résultats des ${drawResults.length} derniers tirages`, 14, 30);

        const tableColumn = ["Date", "1er", "2ème", "3ème", "4ème", "5ème", "|", "M1", "M2", "M3", "M4", "M5"];
        const tableRows: (string | number)[][] = [];

        drawResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); 

        drawResults.forEach(result => {
          const formattedDate = format(new Date(result.date), 'dd/MM/yyyy');
          const rowData = [
            formattedDate,
            ...result.gagnants,
            "|", 
            ...result.machine
          ];
          tableRows.push(rowData);
        });
        
        doc.autoTable({
            startY: 35,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
            headStyles: { fillColor: [22, 160, 133], fontSize: 9, fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { cellWidth: 25, halign: 'left' }, 
                1: { cellWidth: 'auto', halign: 'center' }, 2: { cellWidth: 'auto', halign: 'center' }, 3: { cellWidth: 'auto', halign: 'center' }, 4: { cellWidth: 'auto', halign: 'center' }, 5: { cellWidth: 'auto', halign: 'center' },
                6: { cellWidth: 5, halign: 'center', fontStyle: 'bold' }, 
                7: { cellWidth: 'auto', halign: 'center' }, 8: { cellWidth: 'auto', halign: 'center' }, 9: { cellWidth: 'auto', halign: 'center' }, 10: { cellWidth: 'auto', halign: 'center' }, 11: { cellWidth: 'auto', halign: 'center' },
            },
            didDrawPage: (data) => {
                doc.setFontSize(10);
                doc.text(`Page ${doc.internal.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
            }
        });
    }


    const pdfOutput = doc.output('datauristring');
    const base64Data = pdfOutput.substring(pdfOutput.indexOf(',') + 1);
    
    const currentDate = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `Lotocrack_Export_${currentDate}.pdf`;

    return { success: true, pdfData: base64Data, fileName };

  } catch (error: any) {
    console.error('Error exporting PDF:', error);
    return { success: false, error: `Erreur lors de l'exportation en PDF: ${error.message}` };
  }
}
