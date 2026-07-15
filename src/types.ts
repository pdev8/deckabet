// Shared types for LETTERFALL.

export interface Deal {
  /** 7 columns, each column's cards BOTTOM -> TOP as dealt; TOP card = LAST character. */
  columns: string[];
  /** Draw order: index 0 is drawn first. */
  stock: string;
  label: string; // "smooth" | "tight"
  solverWords: number;
}

export interface Seeds {
  lexicon: string[];
  deals: Deal[];
}

/** Where a tray letter came from: a column index, or the waste top. */
export type TraySource = number | 'waste';

export interface TrayEntry {
  letter: string;
  source: TraySource;
}

export interface SessionStats {
  won: number;
  played: number;
  streak: number;
}

export interface GameState {
  dealIndex: number;
  /** Each column bottom -> top as arrays of single lowercase letters. */
  columns: string[][];
  /** Index 0 is drawn next. */
  stock: string[];
  /** In draw order; last element is the waste top. */
  waste: string[];
  recyclesLeft: number;
  tray: TrayEntry[];
  /** Words played to the foundation, in order. */
  played: string[];
  /** Draws + plays this deal; used to decide if an abandoned deal counts as played. */
  movesMade: number;
  won: boolean;
  stats: SessionStats;
}

export type Action =
  | { type: 'draw' }
  | { type: 'tapColumn'; col: number }
  | { type: 'tapWaste' }
  | { type: 'tapTray'; index: number }
  | { type: 'clearTray' }
  | { type: 'play' }
  | { type: 'redeal' };
