import {
  HISTORY_LIMIT,
  emptyHistory,
  makeRecord,
  recordGame,
  type GameRecord,
  type HistoryState,
} from '../history';
import { wordScore, type Difficulty } from '../scoring';
import { createStore, type KV } from '../storage';

function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
}

interface GameOverrides {
  difficulty?: Difficulty;
  durationMs?: number;
  words?: string[];
  at?: number;
}

const win = (dealScore: number, o: GameOverrides = {}): GameRecord =>
  makeRecord({
    mode: 'free',
    difficulty: o.difficulty ?? 'casual',
    won: true,
    durationMs: o.durationMs ?? 60_000,
    words: o.words ?? [],
    dealScore,
    at: o.at ?? 1_000,
  });
const loss = (o: GameOverrides = {}): GameRecord =>
  makeRecord({
    mode: 'free',
    difficulty: o.difficulty ?? 'casual',
    won: false,
    durationMs: o.durationMs ?? 30_000,
    words: o.words ?? [],
    dealScore: 0,
    at: o.at ?? 1_000,
  });

describe('game history', () => {
  it('emptyHistory starts empty with independent bests objects per difficulty', () => {
    const h = emptyHistory();
    expect(h.games).toEqual([]);
    for (const d of ['casual', 'standard', 'expert'] as const) {
      expect(h.bests[d]).toEqual({ bestDealScore: 0, bestWord: null, fastestClearMs: null });
    }
    h.bests.casual.bestDealScore = 99;
    expect(h.bests.standard.bestDealScore).toBe(0); // no shared references
    expect(emptyHistory().bests.casual.bestDealScore).toBe(0); // fresh objects each call
  });

  it('prepends games (newest first) and caps at HISTORY_LIMIT, dropping the oldest', () => {
    let h = emptyHistory();
    for (let i = 1; i <= HISTORY_LIMIT + 1; i++) {
      h = recordGame(h, win(i, { at: i }));
    }
    expect(h.games).toHaveLength(HISTORY_LIMIT);
    expect(h.games[0].at).toBe(HISTORY_LIMIT + 1); // the 51st game is first
    expect(h.games[HISTORY_LIMIT - 1].at).toBe(2); // game 1 (the oldest) fell off
  });

  it('a first win initializes bestDealScore and fastestClearMs together', () => {
    const h = recordGame(emptyHistory(), win(120, { durationMs: 90_000 }));
    expect(h.bests.casual.bestDealScore).toBe(120);
    expect(h.bests.casual.fastestClearMs).toBe(90_000);
  });

  it('bests are tracked independently per difficulty', () => {
    let h = recordGame(emptyHistory(), win(100, { difficulty: 'casual', durationMs: 50_000 }));
    h = recordGame(h, win(300, { difficulty: 'expert', durationMs: 80_000 }));
    expect(h.bests.casual).toEqual({
      bestDealScore: 100,
      bestWord: null,
      fastestClearMs: 50_000,
    });
    expect(h.bests.expert).toEqual({
      bestDealScore: 300,
      bestWord: null,
      fastestClearMs: 80_000,
    });
    expect(h.bests.standard).toEqual({ bestDealScore: 0, bestWord: null, fastestClearMs: null });
  });

  it('bestWord improves on losses too; bestDealScore and fastestClearMs never do', () => {
    let h = recordGame(emptyHistory(), win(50, { words: ['cat'], durationMs: 60_000 }));
    // Fabricate a loss carrying a nonzero dealScore to prove it is ignored.
    h = recordGame(h, {
      ...loss({ words: ['quiz'], durationMs: 5_000 }),
      dealScore: 999,
    });
    expect(h.bests.casual.bestWord).toEqual({ word: 'quiz', score: wordScore('quiz') });
    expect(h.bests.casual.bestDealScore).toBe(50); // loss can't set it
    expect(h.bests.casual.fastestClearMs).toBe(60_000); // faster loss can't set it
  });

  it('bestDealScore and fastestClearMs require strict improvement on wins', () => {
    let h = recordGame(emptyHistory(), win(200, { durationMs: 60_000 }));
    // Equal score / equal duration: incumbents stay.
    h = recordGame(h, win(200, { durationMs: 60_000 }));
    expect(h.bests.casual.bestDealScore).toBe(200);
    expect(h.bests.casual.fastestClearMs).toBe(60_000);
    // Worse on both axes: incumbents stay.
    h = recordGame(h, win(150, { durationMs: 90_000 }));
    expect(h.bests.casual.bestDealScore).toBe(200);
    expect(h.bests.casual.fastestClearMs).toBe(60_000);
    // Strictly better on both axes: both move.
    h = recordGame(h, win(201, { durationMs: 59_999 }));
    expect(h.bests.casual.bestDealScore).toBe(201);
    expect(h.bests.casual.fastestClearMs).toBe(59_999);
  });

  it('an equal-scoring bestWord does not displace the incumbent', () => {
    let h = recordGame(emptyHistory(), win(10, { words: ['cat'] }));
    expect(wordScore('act')).toBe(wordScore('cat'));
    h = recordGame(h, win(10, { words: ['act'] }));
    expect(h.bests.casual.bestWord).toEqual({ word: 'cat', score: wordScore('cat') });
    h = recordGame(h, win(10, { words: ['quiz'] }));
    expect(h.bests.casual.bestWord).toEqual({ word: 'quiz', score: wordScore('quiz') });
  });

  it('makeRecord picks the best word by score, not length, keeping the first on ties', () => {
    const r = makeRecord({
      mode: 'free',
      difficulty: 'casual',
      won: true,
      durationMs: 1_000,
      words: ['stares', 'quiz', 'cat'],
      dealScore: 10,
      at: 5,
    });
    expect(wordScore('quiz')).toBeGreaterThan(wordScore('stares'));
    expect(r.wordCount).toBe(3);
    expect(r.bestWord).toEqual({ word: 'quiz', score: wordScore('quiz') });
    // Tie on score: the first encountered wins.
    const tied = makeRecord({
      mode: 'free',
      difficulty: 'casual',
      won: false,
      durationMs: 1_000,
      words: ['cat', 'act'],
      dealScore: 0,
      at: 5,
    });
    expect(tied.bestWord).toEqual({ word: 'cat', score: wordScore('cat') });
  });

  it('makeRecord with no words yields wordCount 0 and a null bestWord', () => {
    const r = makeRecord({
      mode: 'free',
      difficulty: 'standard',
      won: false,
      durationMs: 2_000,
      words: [],
      dealScore: 0,
      at: 7,
    });
    expect(r.wordCount).toBe(0);
    expect(r.bestWord).toBeNull();
    // Folding it in leaves bestWord null.
    const h = recordGame(emptyHistory(), r);
    expect(h.bests.standard.bestWord).toBeNull();
  });

  it('does not mutate the input history', () => {
    const before = emptyHistory();
    const seeded = recordGame(before, win(100, { words: ['cat'] }));
    recordGame(seeded, win(999, { words: ['quiz'], durationMs: 1 }));
    expect(before).toEqual(emptyHistory());
    expect(seeded.games).toHaveLength(1);
    expect(seeded.bests.casual.bestDealScore).toBe(100);
    expect(seeded.bests.casual.bestWord).toEqual({ word: 'cat', score: wordScore('cat') });
  });

  it('round-trips through the versioned store with a memory backend', async () => {
    const store = createStore(memoryKV());
    let h = recordGame(emptyHistory(), win(210, { words: ['quiz', 'stares'] }));
    h = recordGame(h, loss({ words: ['cat'] }));
    await store.set('gameHistory', h);
    const loaded = await store.get<HistoryState>('gameHistory', emptyHistory());
    expect(loaded).toEqual(h);
    // Records keep folding correctly into the loaded copy.
    const next = recordGame(loaded, win(400, { durationMs: 10_000 }));
    expect(next.games).toHaveLength(3);
    expect(next.bests.casual.bestDealScore).toBe(400);
    expect(next.bests.casual.fastestClearMs).toBe(10_000);
    // A missing key resolves to empty history.
    expect(await store.get<HistoryState>('nope', emptyHistory())).toEqual(emptyHistory());
  });
});
