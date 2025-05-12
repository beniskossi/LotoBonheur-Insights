
// src/lib/image-export.ts
import type { LotteryResult } from '@/types/lottery';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const CARD_WIDTH = 380;
const CARD_HEIGHT = 220;
const PADDING = 20;
const TITLE_FONT_SIZE = 20;
const TEXT_FONT_SIZE = 16;
const SMALL_TEXT_FONT_SIZE = 12;
const LINE_HEIGHT = 24;
const NUMBER_BALL_SIZE = 32;
const NUMBER_BALL_MARGIN = 6;
const MAX_RESULTS_PER_IMAGE = 6; // Adjust as needed for readability

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawNumberBall(ctx: CanvasRenderingContext2D, x: number, y: number, number: number, isWinning: boolean) {
    ctx.beginPath();
    ctx.arc(x + NUMBER_BALL_SIZE / 2, y + NUMBER_BALL_SIZE / 2, NUMBER_BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = isWinning ? 'hsl(45, 100%, 50%)' : 'hsl(220, 20%, 20%)'; // Gold for winning, dark gray for machine
    ctx.fill();

    ctx.fillStyle = isWinning ? 'hsl(220, 40%, 5%)' : 'hsl(210, 20%, 95%)'; // Dark text on gold, light text on gray
    ctx.font = `bold ${TEXT_FONT_SIZE * 0.8}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), x + NUMBER_BALL_SIZE / 2, y + NUMBER_BALL_SIZE / 2 + 1);
}


function drawResultCard(ctx: CanvasRenderingContext2D, result: LotteryResult, x: number, y: number) {
    // Card background
    ctx.fillStyle = 'hsl(220, 30%, 10%)'; // Dark card background
    drawRoundedRect(ctx, x, y, CARD_WIDTH, CARD_HEIGHT, 10);
    ctx.fill();
    ctx.strokeStyle = 'hsl(220, 20%, 18%)'; // Border
    ctx.stroke();

    let currentY = y + PADDING;

    // Draw Name
    ctx.fillStyle = 'hsl(45, 100%, 70%)'; // Lighter Gold for title
    ctx.font = `bold ${TITLE_FONT_SIZE}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(result.draw_name, x + PADDING, currentY);
    currentY += TITLE_FONT_SIZE + 10;

    // Date
    ctx.fillStyle = 'hsl(210, 15%, 65%)'; // Muted foreground for date
    ctx.font = `${SMALL_TEXT_FONT_SIZE}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
    try {
        ctx.fillText(format(parseISO(result.date), 'eeee dd MMMM yyyy', { locale: fr }), x + PADDING, currentY);
    } catch (e) {
        ctx.fillText(result.date, x + PADDING, currentY); // Fallback for invalid date
    }
    currentY += SMALL_TEXT_FONT_SIZE + 15;

    // Gagnants
    ctx.fillStyle = 'hsl(210, 20%, 95%)';
    ctx.font = `bold ${TEXT_FONT_SIZE * 0.9}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
    ctx.fillText('Gagnants:', x + PADDING, currentY);
    currentY += TEXT_FONT_SIZE * 0.9;

    let numberX = x + PADDING;
    result.gagnants.forEach(num => {
        drawNumberBall(ctx, numberX, currentY, num, true);
        numberX += NUMBER_BALL_SIZE + NUMBER_BALL_MARGIN;
    });
    currentY += NUMBER_BALL_SIZE + 15;

    // Machine
    ctx.fillText('Machine:', x + PADDING, currentY);
    currentY += TEXT_FONT_SIZE * 0.9;
    numberX = x + PADDING;
    if (result.machine && result.machine.length > 0) {
        result.machine.forEach(num => {
            drawNumberBall(ctx, numberX, currentY, num, false);
            numberX += NUMBER_BALL_SIZE + NUMBER_BALL_MARGIN;
        });
    } else {
        ctx.fillStyle = 'hsl(210, 15%, 65%)';
        ctx.font = `${TEXT_FONT_SIZE * 0.9}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
        ctx.fillText('N/A', numberX, currentY + NUMBER_BALL_SIZE / 2 - (TEXT_FONT_SIZE * 0.9)/2);
    }
}

export async function exportToImage(
  results: LotteryResult[],
  filterDrawName?: string | null
): Promise<string> {
  const resultsToExport = results.slice(0, MAX_RESULTS_PER_IMAGE); // Limit results for one image

  const numCols = resultsToExport.length <= 2 ? resultsToExport.length : (resultsToExport.length <= 4 ? 2 : 3) ; // Max 3 columns
  const numRows = Math.ceil(resultsToExport.length / numCols);
  
  const canvasWidth = numCols * (CARD_WIDTH + PADDING) + PADDING;
  const canvasHeight = numRows * (CARD_HEIGHT + PADDING) + PADDING + 60; // Extra space for title

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Background
  ctx.fillStyle = 'hsl(220, 40%, 5%)'; // Deep Blue/Gray background
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Main Title
  ctx.fillStyle = 'hsl(210, 20%, 95%)';
  ctx.font = `bold ${TITLE_FONT_SIZE * 1.5}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('LotoBonheur Insights - Résultats', canvasWidth / 2, PADDING + (TITLE_FONT_SIZE * 0.5));

  // Subtitle (Filter)
  ctx.font = `${TEXT_FONT_SIZE * 0.9}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
  ctx.fillStyle = 'hsl(210, 15%, 75%)';
  const filterText = filterDrawName && filterDrawName !== "all" ? `Catégorie: ${filterDrawName}` : 'Toutes les catégories (récents)';
  ctx.fillText(filterText, canvasWidth / 2, PADDING + TITLE_FONT_SIZE * 1.5 + 10);


  resultsToExport.forEach((result, index) => {
    const col = index % numCols;
    const row = Math.floor(index / numCols);
    const x = PADDING + col * (CARD_WIDTH + PADDING);
    const y = PADDING + 60 + row * (CARD_HEIGHT + PADDING); // +60 for main title area
    drawResultCard(ctx, result, x, y);
  });

  return canvas.toDataURL('image/png');
}
```