import { deals, isValidWord } from './dict';
import type { Action, GameState, SessionStats } from './types';

export const MAX_WORD = 8;
export const RECYCLES_PER_DEAL = 2;

export function makeDealState(dealIndex: number, stats: SessionStats): GameState {
  const safeIndex = deals.length > 0 ? ((dealIndex % deals.length) + deals.length) % deals.length : 0;
  const deal = deals[safeIndex];
  return {
    dealIndex: safeIndex,
    columns: deal ? deal.columns.map((c) => c.toLowerCase().split('')) : [],
    stock: deal ? deal.stock.toLowerCase().split('') : [],
    waste: [],
    recyclesLeft: RECYCLES_PER_DEAL,
    tray: [],
    played: [],
    movesMade: 0,
    won: false,
    stats,
  };
}

export function tableauCount(state: GameState): number {
  return state.columns.reduce((n, c) => n + c.length, 0);
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'draw': {
      if (state.won) return state;
      // A trayed waste card is auto-returned first so the trayed waste entry
      // is always the current waste top (keeps recycle/play invariants).
      const tray = state.tray.filter((e) => e.source !== 'waste');
      if (state.stock.length > 0) {
        const drawn = state.stock[0];
        return {
          ...state,
          tray,
          stock: state.stock.slice(1),
          waste: [...state.waste, drawn],
          movesMade: state.movesMade + 1,
        };
      }
      // Recycle: waste (already in original draw order) becomes the stock.
      if (state.waste.length > 0 && state.recyclesLeft > 0) {
        return {
          ...state,
          tray,
          stock: state.waste.slice(),
          waste: [],
          recyclesLeft: Math.max(0, state.recyclesLeft - 1),
          movesMade: state.movesMade + 1,
        };
      }
      return state; // inert: empty stock, nothing to recycle
    }

    case 'tapColumn': {
      if (state.won) return state;
      const column = state.columns[action.col];
      if (!column || column.length === 0) return state;
      if (state.tray.length >= MAX_WORD) return state;
      if (state.tray.some((e) => e.source === action.col)) return state; // one card per column
      const letter = column[column.length - 1];
      return { ...state, tray: [...state.tray, { letter, source: action.col }] };
    }

    case 'tapWaste': {
      if (state.won) return state;
      if (state.waste.length === 0) return state;
      if (state.tray.length >= MAX_WORD) return state;
      if (state.tray.some((e) => e.source === 'waste')) return state; // at most one waste card
      const letter = state.waste[state.waste.length - 1];
      return { ...state, tray: [...state.tray, { letter, source: 'waste' }] };
    }

    case 'tapTray': {
      if (action.index < 0 || action.index >= state.tray.length) return state;
      return { ...state, tray: state.tray.filter((_, i) => i !== action.index) };
    }

    case 'clearTray': {
      if (state.tray.length === 0) return state;
      return { ...state, tray: [] };
    }

    case 'play': {
      if (state.won) return state;
      const word = state.tray.map((e) => e.letter).join('');
      if (!isValidWord(word)) return state; // also guards double-fire: tray is emptied below
      const columns = state.columns.map((c) => c.slice());
      let waste = state.waste;
      for (const entry of state.tray) {
        if (entry.source === 'waste') {
          waste = waste.slice(0, -1); // trayed waste entry is always the waste top
        } else {
          const col = columns[entry.source];
          if (col && col.length > 0) col.pop(); // next card is face-up automatically
        }
      }
      const left = columns.reduce((n, c) => n + c.length, 0);
      const won = left === 0;
      const stats = won
        ? {
            won: state.stats.won + 1,
            played: state.stats.played + 1,
            streak: state.stats.streak + 1,
          }
        : state.stats;
      return {
        ...state,
        columns,
        waste,
        tray: [],
        played: [...state.played, word],
        movesMade: state.movesMade + 1,
        won,
        stats,
      };
    }

    case 'redeal': {
      // A deal counts as played only if it was won or the player made a move.
      const abandoned = !state.won && state.movesMade > 0;
      const stats: SessionStats = abandoned
        ? { ...state.stats, played: state.stats.played + 1, streak: 0 }
        : state.stats;
      return makeDealState(state.dealIndex + 1, stats);
    }

    default:
      return state;
  }
}
