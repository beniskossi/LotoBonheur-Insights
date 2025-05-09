'use server';

import { parse, getYear, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { NextResponse } from 'next/server';
import { ai } from '@/ai/genkit'; // Assuming genkit is configured for netService

// Draw schedule for standard draws
const DRAW_SCHEDULE = {
  Lundi: { '10H': 'Reveil', '13H': 'Etoile', '16H': 'Akwaba', '18H15': 'Monday Special' },
  Mardi: { '10H': 'La Matinale', '13H': 'Emergence', '16H': 'Sika', '18H15': 'Lucky Tuesday' },
  Mercredi: { '10H': 'Premiere Heure', '13H': 'Fortune', '16H': 'Baraka', '18H15': 'Midweek' },
  Jeudi: { '10H': 'Kado', '13H': 'Privilege', '16H': 'Monni', '18H15': 'Fortune Thursday' },
  Vendredi: { '10H': 'Cash', '13H': 'Solution', '16H': 'Wari', '18H15': 'Friday Bonanza' },
  Samedi: { '10H': 'Soutra', '13H': 'Diamant', '16H': 'Moaye', '18H15': 'National' },
  Dimanche: { '10H': 'Benediction', '13H': 'Prestige', '16H': 'Awale', '18H15': 'Espoir' },
};

interface ApiDraw {
  drawName: string;
  winningNumbers: string;
  machineNumbers: string;
}

interface ApiDailyResult {
  date: string; // e.g., "dimanche 04/05"
  drawResults: {
    standardDraws: ApiDraw[];
  };
}

interface ApiWeekResult {
  drawResultsDaily: ApiDailyResult[];
}

interface ApiResponse {
  success: boolean;
  drawsResultsWeekly: ApiWeekResult[];
  hasMore?: boolean;
}

interface FormattedResult {
  draw_name: string;
  date: string; // YYYY-MM-DD
  gagnants: number[];
  machine: number[];
}

export async function GET(): Promise<NextResponse<FormattedResult[] | { error: string }>> {
  const baseUrl = 'https://lotobonheur.ci/api/results';

  try {
    const results: FormattedResult[] = [];
    let page = 1;
    let hasMoreData = true;
    const currentYear = getYear(new Date());

    const validDrawNames = new Set<string>();
    Object.values(DRAW_SCHEDULE).forEach((day) => {
      Object.values(day).forEach((drawName) => validDrawNames.add(drawName));
    });

    while (hasMoreData) {
      const url = `${baseUrl}?page=${page}`;
      const response = await ai.netService.fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://lotobonheur.ci/resultats',
        },
        timeout: 15000, // Increased timeout
      });

      if (!response.ok) {
        console.warn(`API request failed for page ${page} with status ${response.status}`);
        // Attempt to parse error if possible
        try {
            const errorBody = await response.json();
            console.error('API error body:', errorBody);
        } catch (e) {
            console.error('Could not parse error body from API');
        }
        // If it's a client-side error or server error, stop pagination
        if (response.status >= 400 && response.status < 500) {
             hasMoreData = false; // Stop if client error likely means no more valid pages
        }
        // For server errors, we might retry or stop, here we stop
        if (response.status >= 500) {
            hasMoreData = false;
        }
        page += 1; // Still increment page to avoid infinite loop on persistent error, or break
        if(page > 20) hasMoreData = false; // Safety break after 20 pages
        continue; // Try next page or exit loop
      }
      
      const resultsData = await response.json() as ApiResponse;

      if (!resultsData.success) {
        console.warn(`API returned unsuccessful response for page ${page}:`, resultsData);
        hasMoreData = false; // Stop if API explicitly says not successful
        break;
      }

      const drawsResultsWeekly = resultsData.drawsResultsWeekly;
      if (!drawsResultsWeekly || drawsResultsWeekly.length === 0) {
          hasMoreData = resultsData.hasMore || false;
          if (!hasMoreData) break; // No more data this week and no more pages
          page +=1;
          if(page > 20) hasMoreData = false; // Safety break
          continue;
      }


      for (const week of drawsResultsWeekly) {
        for (const dailyResult of week.drawResultsDaily) {
          const dateStr = dailyResult.date; // e.g., "dimanche 04/05"
          let drawDate: string;

          try {
            const parts = dateStr.split(' '); // ["dimanche", "04/05"]
            const dayMonth = parts.length > 1 ? parts[1] : parts[0]; // "04/05"
            
            // Use date-fns to parse with the current year. This assumes draws are for the current year.
            // The API does not provide year, so we infer it.
            // 'd/M/yyyy' is more robust than 'dd/MM/yyyy' for single digit days/months
            const parsedDate = parse(dayMonth, 'dd/MM', new Date(currentYear, 0, 1)); 
            if (isNaN(parsedDate.getTime())) {
                 // try with single digit month
                 const parsedDateSingleMonth = parse(dayMonth, 'dd/M', new Date(currentYear, 0, 1));
                 if (isNaN(parsedDateSingleMonth.getTime())) {
                    console.warn(`Invalid date format after trying multiple patterns: ${dateStr}`);
                    continue;
                 }
                 drawDate = format(parsedDateSingleMonth, 'yyyy-MM-dd');
            } else {
                drawDate = format(parsedDate, 'yyyy-MM-dd');
            }

          } catch (e) {
            console.warn(`Invalid date format: ${dateStr}, error: ${e}`);
            continue;
          }

          for (const draw of dailyResult.drawResults.standardDraws) {
            const drawName = draw.drawName;
            if (!validDrawNames.has(drawName) || draw.winningNumbers.startsWith('.')) {
              continue;
            }

            const winningNumbers = (draw.winningNumbers.match(/\d+/g) || []).map(Number).slice(0, 5);
            const machineNumbers = (draw.machineNumbers.match(/\d+/g) || []).map(Number).slice(0, 5);

            if (winningNumbers.length === 5 && machineNumbers.length === 5) {
              results.push({
                draw_name: drawName,
                date: drawDate,
                gagnants: winningNumbers,
                machine: machineNumbers,
              });
            } else {
              console.warn(`Incomplete data for draw ${drawName} on date ${drawDate}: Winning: ${winningNumbers.join(',')}, Machine: ${machineNumbers.join(',')}`);
            }
          }
        }
      }
      
      hasMoreData = resultsData.hasMore || false;
      if(hasMoreData) {
        page += 1;
        if (page > 20) { // Safety break to prevent infinite loops with faulty API hasMore logic
            console.warn('Reached page limit (20). Stopping pagination.');
            hasMoreData = false;
        }
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'No valid draw results found after fetching all pages.' }, { status: 404 });
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    console.error(`Error fetching lottery results from ${baseUrl}:`, error);
    // Check if error is from fetch itself (e.g. network error, timeout)
    let errorMessage = 'Failed to fetch results due to an unexpected error.';
    if (error.message) {
        errorMessage = `Failed to fetch results: ${error.message}`;
    }
    if (error.cause && (error.cause as any).code === 'UND_ERR_CONNECT_TIMEOUT') {
        errorMessage = 'Failed to fetch results: Connection timed out.';
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
