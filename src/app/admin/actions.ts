// src/app/admin/actions.ts
'use server';

import type { LotteryResult } from '@/types/lottery';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // Augments jsPDF
import pdf from 'pdf-parse'; // For parsing PDF content
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
    const arrayBuffer = await file.arrayBuffer();
    const data = await pdf(Buffer.from(arrayBuffer));

    // !!! IMPORTANT: PDF parsing logic is highly complex and document-specific !!!
    // The following is a VERY basic and optimistic attempt.
    // It assumes a very specific text structure in the PDF.
    // For a robust solution, a more sophisticated parsing strategy or a specific PDF library
    // that can handle various PDF structures (especially tables) would be needed.
    // If the PDF is image-based, OCR would be required, which is out of scope here.

    // console.log("PDF Text:", data.text); // For debugging the extracted text

    const lines = data.text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const importedResults: LotteryResult[] = [];
    let currentDrawName: string | null = null;

    // Attempt to find draw names based on titles like "TIRAGE DE [TIME] [DRAW_NAME]"
    const uniqueDrawNames = getUniqueDrawNames(); // From config/draw-schedule.ts

    for (const line of lines) {
      // Check for draw name title
      const upperLine = line.toUpperCase();
      if (upperLine.startsWith("TIRAGE DE ")) {
        const potentialDrawNamePart = upperLine.substring("TIRAGE DE ".length).split(" ")[1]; // e.g. "16H MONNI" -> "MONNI"
        if (potentialDrawNamePart) {
            const foundDraw = uniqueDrawNames.find(dn => dn.toUpperCase().includes(potentialDrawNamePart));
            if (foundDraw) {
                currentDrawName = foundDraw;
                // console.log("Found draw name in PDF:", currentDrawName);
            }
        }
      }
      
      // This is a placeholder for actual table parsing.
      // A real implementation would need to identify table rows and columns.
      // Example: if a line looks like "DD/MM/YYYY NN NN NN NN NN | MM MM MM MM MM"
      // This regex is very naive and highly dependent on consistent formatting.
      const datePattern = /(\d{1,2}\s+[a-zA-Zûé]+\s+\d{4})/; // e.g., "1 mai 2025"
      const numberSequencePattern = /(\d{1,2})/g;

      const dateMatch = line.match(datePattern);
      
      if (dateMatch && currentDrawName) {
        const dateStr = dateMatch[1];
        const numbersStr = line.substring(dateMatch[0].length).trim();
        
        let parsedDate: Date;
        try {
          parsedDate = dateParse(dateStr, "d MMMM yyyy", new Date(), { locale: fr });
           if (isNaN(parsedDate.getTime())) {
             // Try another common format if the first fails (e.g., from a different locale or style)
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

        if (allNumbers.length >= 10) { // Expecting at least 5 gagnants + 5 machine
          const gagnants = allNumbers.slice(0, 5);
          const machine = allNumbers.slice(5, 10);

          // Basic validation
          const isValidNumber = (n: number) => n >= 1 && n <= 90;
          if (gagnants.every(isValidNumber) && machine.every(isValidNumber)) {
            importedResults.push({
              draw_name: currentDrawName,
              date: formattedDate,
              gagnants,
              machine,
            });
          } else {
            // console.warn("Invalid numbers parsed from PDF line:", line);
          }
        } else {
        //   console.warn("Not enough numbers found in PDF line for a full result:", line, "Numbers found:", allNumbers.length);
        }
      }
    }


    if (importedResults.length === 0 && lines.length > 0) {
      return { success: false, error: 'Aucune donnée de tirage valide n\'a pu être extraite du PDF. Le format du PDF pourrait ne pas être compatible ou le PDF est peut-être basé sur une image.' };
    }
    if (importedResults.length === 0 && lines.length === 0) {
        return { success: false, error: 'Le fichier PDF semble vide ou ne contient aucun texte extractible.' };
    }


    // Here, you would typically save `importedResults` to your database (Firebase/Supradata)
    // For this example, we'll just return the count.
    // Example: await saveResultsToDatabase(importedResults);

    console.log(`Successfully parsed ${importedResults.length} results from PDF.`);
    // console.log("Parsed results:", JSON.stringify(importedResults, null, 2));


    return { success: true, message: `${importedResults.length} résultats importés avec succès. (Simulation - sauvegarde BDD non implémentée)`, importedCount: importedResults.length };

  } catch (error: any) {
    console.error('Error parsing PDF:', error);
    return { success: false, error: `Erreur lors de l'analyse du PDF: ${error.message}` };
  }
}


export async function exportLotteryDataToPdf(): Promise<{ success: boolean; pdfData?: string; fileName?: string; error?: string }> {
  try {
    // Fetch data from your API endpoint
    // Ensure the NEXT_PUBLIC_APP_URL environment variable is set for server-side fetch
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
    const uniqueDraws = getUniqueDrawNames(); // From config/draw-schedule.ts

    // Group results by draw_name
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

        // Title for the draw category
        doc.setFontSize(18);
        doc.text(`TIRAGE ${drawName.toUpperCase()}`, 14, 22);
        doc.setFontSize(12);
        doc.text(`Résultats des ${drawResults.length} derniers tirages`, 14, 30);

        const tableColumn = ["Date", "1er", "2ème", "3ème", "4ème", "5ème", "|", "M1", "M2", "M3", "M4", "M5"];
        const tableRows: (string | number)[][] = [];

        drawResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date descending

        drawResults.forEach(result => {
          const formattedDate = format(new Date(result.date), 'dd/MM/yyyy');
          const rowData = [
            formattedDate,
            ...result.gagnants,
            "|", // Separator
            ...result.machine
          ];
          tableRows.push(rowData);
        });
        
        // Add headers for "5 PREMIERS CHIFFRES TIRES" and "5 DERNIERS CHIFFRES TIRES"
        // This requires a bit more complex table setup, jspdf-autotable can do this with `headStyles` and multiple header rows
        // For simplicity here, we're using a single header row. A more advanced layout would use `didParseCell` or similar hooks.

        doc.autoTable({
            startY: 35,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
            headStyles: { fillColor: [22, 160, 133], fontSize: 9, fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { cellWidth: 25, halign: 'left' }, // Date
                1: { cellWidth: 'auto', halign: 'center' }, 2: { cellWidth: 'auto', halign: 'center' }, 3: { cellWidth: 'auto', halign: 'center' }, 4: { cellWidth: 'auto', halign: 'center' }, 5: { cellWidth: 'auto', halign: 'center' },
                6: { cellWidth: 5, halign: 'center', fontStyle: 'bold' }, // Separator column
                7: { cellWidth: 'auto', halign: 'center' }, 8: { cellWidth: 'auto', halign: 'center' }, 9: { cellWidth: 'auto', halign: 'center' }, 10: { cellWidth: 'auto', halign: 'center' }, 11: { cellWidth: 'auto', halign: 'center' },
            },
            didDrawPage: (data) => {
                // Footer
                doc.setFontSize(10);
                doc.text(`Page ${doc.internal.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
            }
        });
    }


    const pdfOutput = doc.output('datauristring');
    // Remove the "data:application/pdf;base64," prefix for sending as string
    const base64Data = pdfOutput.substring(pdfOutput.indexOf(',') + 1);
    
    const currentDate = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `Lotocrack_Export_${currentDate}.pdf`;

    return { success: true, pdfData: base64Data, fileName };

  } catch (error: any) {
    console.error('Error exporting PDF:', error);
    return { success: false, error: `Erreur lors de l'exportation en PDF: ${error.message}` };
  }
}
