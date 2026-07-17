// Game history + personal bests (DB-123) — pure accounting, no React, no I/O.
// Persisted via appStorage; surfaced in the My Stats tab (DB-144).
import { wordScore, type Difficulty } from './scoring';
import type { StatsMode } from './stats';

/** Last-N results kept; older games fall off the end. */
export const HISTORY_LIMIT = 50;

export interface GameRecord {
  /** Epoch ms when the game finished. */
  at: number;
  mode: StatsMode;
  difficulty: Difficulty;
  won: boolean;
  durationMs: number;
  wordCount: number;
  dealScore: number;
  /** Highest-scoring word of THIS game (by wordScore); null if none played. */
  bestWord: { word: string; score: number } | null;
}

export interface DifficultyBests {
  /** Best winning deal score; 0 until the first win. */
  bestDealScore: number;
  /** Highest-scoring single word ever played at this difficulty (wins or losses). */
  bestWord: { word: string; score: number } | null;
  /** Fastest winning clear; null until the first win. */
  fastestClearMs: number | null;
}

export interface HistoryState {
  /** Most recent first, capped at HISTORY_LIMIT. */
  games: GameRecord[];
  bests: Record<Difficulty, DifficultyBests>;
}

function emptyBests(): DifficultyBests {
  return { bestDealScore: 0, bestWord: null, fastestClearMs: null };
}

export function emptyHistory(): HistoryState {
  return {
    games: [],
    bests: { casual: emptyBests(), standard: emptyBests(), expert: emptyBests() },
  };
}

export interface GameArgs {
  mode: StatsMode;
  difficulty: Difficulty;
  won: boolean;
  durationMs: number;
  words: string[];
  /** Final banked score; pass 0 for losses (they bank nothing). */
  dealScore: number;
  at: number;
}

/**
 * Builds a GameRecord from a finished game, computing wordCount and the
 * game's best word (by wordScore; ties keep the first encountered).
 */
export function makeRecord(args: GameArgs): GameRecord {
  let bestWord: { word: string; score: number } | null = null;
  for (const word of args.words) {
    const score = wordScore(word);
    if (bestWord === null || score > bestWord.score) bestWord = { word, score };
  }
  return {
    at: args.at,
    mode: args.mode,
    difficulty: args.difficulty,
    won: args.won,
    durationMs: args.durationMs,
    wordCount: args.words.length,
    dealScore: args.dealScore,
    bestWord,
  };
}

/**
 * Folds one finished game into the history, immutably. The game is prepended
 * (most recent first) and the list capped at HISTORY_LIMIT. Bests for the
 * game's difficulty: bestWord can improve on any game (strictly higher
 * score); bestDealScore and fastestClearMs only move on wins (strictly
 * better — ties keep the incumbent; the first win always sets both).
 */
export function recordGame(h: HistoryState, r: GameRecord): HistoryState {
  const games = [r, ...h.games].slice(0, HISTORY_LIMIT);

  const b = h.bests[r.difficulty];
  const bestWord =
    r.bestWord !== null && (b.bestWord === null || r.bestWord.score > b.bestWord.score)
      ? r.bestWord
      : b.bestWord;
  const next: DifficultyBests = {
    bestDealScore: r.won ? Math.max(b.bestDealScore, r.dealScore) : b.bestDealScore,
    bestWord,
    fastestClearMs:
      r.won && (b.fastestClearMs === null || r.durationMs < b.fastestClearMs)
        ? r.durationMs
        : b.fastestClearMs,
  };
  return { games, bests: { ...h.bests, [r.difficulty]: next } };
}
