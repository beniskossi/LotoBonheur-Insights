export interface LotteryResult {
  clientId?: string; // Optional: for client-side identification in admin panel
  draw_name: string;
  date: string; // YYYY-MM-DD
  gagnants: number[];
  machine: number[]; // Still an array, but logic will allow it to be empty
}

// Utility type for admin page state if needed, though clientId can be on LotteryResult directly
export type LotteryResultWithId = LotteryResult & { clientId: string };

