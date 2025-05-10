import { parse, getYear, format } from 'date-fns';
// import { fr } from 'date-fns/locale'; // fr locale not strictly needed for parsing 'dd/MM'
import { NextResponse } from 'next/server';
// import { ai } from '@/ai/genkit'; // ai.netService.fetch is replaced
import { DRAW_SCHEDULE } from '@/config/draw-schedule';

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
      // Use standard fetch instead of ai.netService.fetch
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://lotobonheur.ci/resultats',
        },
        signal: AbortSignal.timeout(15000), // Standard fetch timeout using AbortSignal
      });

      if (!response.ok) {
        console.warn(`API request failed for page ${page} with status ${response.status}`);
        try {
            const errorBody = await response.json();
            console.error('API error body:', errorBody);
        } catch (e) {
            console.error('Could not parse error body from API');
        }
        if (response.status >= 400 && response.status < 500) {
             hasMoreData = false; 
        }
        if (response.status >= 500) {
            hasMoreData = false;
        }
        page += 1; 
        if(page > 20) hasMoreData = false; 
        continue; 
      }
      
      const resultsData = await response.json() as ApiResponse;

      if (!resultsData.success) {
        console.warn(`API returned unsuccessful response for page ${page}:`, resultsData);
        hasMoreData = false; 
        break;
      }

      const drawsResultsWeekly = resultsData.drawsResultsWeekly;
      if (!drawsResultsWeekly || drawsResultsWeekly.length === 0) {
          hasMoreData = resultsData.hasMore || false;
          if (!hasMoreData) break; 
          page +=1;
          if(page > 20) hasMoreData = false; 
          continue;
      }


      for (const week of drawsResultsWeekly) {
        for (const dailyResult of week.drawResultsDaily) {
          const dateStr = dailyResult.date; 
          let drawDate: string;

          try {
            const parts = dateStr.split(' '); 
            const dayMonth = parts.length > 1 ? parts[1] : parts[0]; 
            
            const parsedDate = parse(dayMonth, 'dd/MM', new Date(currentYear, 0, 1)); 
            if (isNaN(parsedDate.getTime())) {
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
            let machineNumbers = (draw.machineNumbers.match(/\d+/g) || []).map(Number).slice(0, 5);

            // Normalize [0,0,0,0,0] to [] for machine numbers
            if (machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
              machineNumbers = [];
            }

            if (winningNumbers.length === 5 && (machineNumbers.length === 0 || machineNumbers.length === 5)) {
              results.push({
                draw_name: drawName,
                date: drawDate,
                gagnants: winningNumbers,
                machine: machineNumbers,
              });
            } else {
              console.warn(`Incomplete or invalid data for draw ${drawName} on date ${drawDate}: Winning: ${winningNumbers.join(',')}, Machine: ${machineNumbers.join(',')}`);
            }
          }
        }
      }
      
      hasMoreData = resultsData.hasMore || false;
      if(hasMoreData) {
        page += 1;
        if (page > 20) { 
            console.warn('Reached page limit (20). Stopping pagination.');
            hasMoreData = false;
        }
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'No valid draw results found after fetching all pages.' }, { status: 404 });
    }

    // Sort results by date descending, then by draw_name
    results.sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date);
      if (dateComparison !== 0) {
        return dateComparison;
      }
      return a.draw_name.localeCompare(b.draw_name);
    });


    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    console.error(`Error fetching lottery results from ${baseUrl}:`, error);
    let errorMessage = 'Failed to fetch results due to an unexpected error.';
    if (error.name === 'TimeoutError') { // Handle fetch timeout specifically
        errorMessage = 'Failed to fetch results: Connection timed out.';
    } else if (error.message) {
        errorMessage = `Failed to fetch results: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}