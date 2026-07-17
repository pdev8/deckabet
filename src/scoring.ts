// DECKABET scoring — canonical implementation of docs/ROADMAP.md "Scoring".
// Pure functions only. Players never see this math directly (spec §4c):
// the UI presents named bonuses computed from these values.

/** Scrabble-derived letter values (spec §1). */
export const LETTER_VALUES: Readonly<Record<string, number>> = (() => {
  const v: Record<string, number> = {};
  for (const c of 'aeioulnstr') v[c] = 1;
  for (const c of 'dg') v[c] = 2;
  for (const c of 'bcmp') v[c] = 3;
  for (const c of 'fhvwy') v[c] = 4;
  v.k = 5;
  v.j = 8;
  v.x = 8;
  v.q = 10;
  v.z = 10;
  return v;
})();

/** Super-linear length multipliers (spec §2): one 6 beats two 3s. */
export const LENGTH_MULT: Readonly<Record<number, number>> = {
  3: 1.0,
  4: 1.25,
  5: 1.6,
  6: 2.0,
  7: 2.5,
  8: 3.2,
};

export function letterValue(letter: string): number {
  return LETTER_VALUES[letter.toLowerCase()] ?? 0;
}

/**
 * wordScore = round(Σ letterValue × lengthMult). Returns 0 for lengths
 * outside the playable 3-8 range (such words can never be played).
 */
export function wordScore(word: string): number {
  const mult = LENGTH_MULT[word.length];
  if (!mult) return 0;
  let sum = 0;
  for (const ch of word.toLowerCase()) sum += letterValue(ch);
  return Math.round(sum * mult);
}

/** Word-economy multiplier (spec §3): fewer, bigger words beat many small ones. */
export function wordEconomyMult(wordCount: number): number {
  if (wordCount <= 4) return 1.75;
  const table: Record<number, number> = { 5: 1.6, 6: 1.45, 7: 1.3, 8: 1.2, 9: 1.1, 10: 1.05 };
  return table[wordCount] ?? 1.0;
}

/**
 * Stock-economy multiplier (spec §3): start at 1.5, pay for every lean on
 * the stock; a zero-stock, zero-park, zero-recycle clear keeps the full
 * 1.5 (the Purist bonus). Drawing itself is free — consuming costs.
 */
export function stockEconomyMult(
  reserveLettersPlayed: number,
  parksUsed: number,
  recyclesUsed: number,
): number {
  const raw = 1.5 - 0.08 * reserveLettersPlayed - 0.05 * parksUsed - 0.08 * recyclesUsed;
  return Math.min(1.5, Math.max(1.0, raw));
}

export type Difficulty = 'casual' | 'standard' | 'expert';

export const DIFFICULTY_MULT: Readonly<Record<Difficulty, number>> = {
  casual: 1.0,
  standard: 1.25,
  expert: 1.6,
};

/** Σ wordScore with Encore: the final word of a winning deal scores double (spec §4b). */
export function dealBaseScore(words: string[]): number {
  const sum = words.reduce((a, w) => a + wordScore(w), 0);
  return words.length > 0 ? sum + wordScore(words[words.length - 1]) : 0;
}

export interface DealOutcome {
  words: string[];
  reserveLettersPlayed: number;
  parksUsed: number;
  recyclesUsed: number;
  difficulty: Difficulty;
}

/** dealScore = round(base × wordEconomy × stockEconomy × difficulty) — wins only (spec §3). */
export function dealScore(o: DealOutcome): number {
  return Math.round(
    dealBaseScore(o.words) *
      wordEconomyMult(o.words.length) *
      stockEconomyMult(o.reserveLettersPlayed, o.parksUsed, o.recyclesUsed) *
      DIFFICULTY_MULT[o.difficulty],
  );
}
