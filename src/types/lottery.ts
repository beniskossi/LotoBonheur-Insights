export interface LotteryResult {
  draw_name: string;
  date: string; // YYYY-MM-DD
  gagnants: number[];
  machine: number[];
}
