import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { C } from './src/theme';
import { deals, existsPlayableWord, isValidWord } from './src/dict';
import { MAX_WORD, makeDealState, reducer } from './src/game';
import type { TrayEntry } from './src/types';

// ---------------------------------------------------------------- helpers

/** Pops its children in on mount (scale + fade). Re-key to replay. */
function PopIn({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 190, useNativeDriver: true }).start();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

function LetterCard({
  letter,
  width,
  height,
  glow = false,
  lifted = false,
}: {
  letter: string;
  width: number;
  height: number;
  glow?: boolean;
  lifted?: boolean;
}) {
  return (
    <View
      style={[
        styles.letterCard,
        { width, height, borderRadius: Math.max(6, Math.round(width * 0.15)) },
        glow && styles.letterCardGlow,
        lifted && styles.letterCardLifted,
      ]}
    >
      <Text style={[styles.letterCardCorner, { fontSize: Math.max(8, Math.round(width * 0.2)) }]}>
        {letter.toUpperCase()}
      </Text>
      <Text style={[styles.letterCardText, { fontSize: Math.round(width * 0.52) }]}>
        {letter.toUpperCase()}
      </Text>
    </View>
  );
}

function CardBack({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[styles.cardBack, { width, height, borderRadius: Math.max(6, Math.round(width * 0.15)) }]}
    >
      <Text style={[styles.cardBackSpade, { fontSize: Math.round(width * 0.42) }]}>♠</Text>
      {children}
    </View>
  );
}

function WordChip({ word }: { word: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{word.toUpperCase()}</Text>
    </View>
  );
}

function BigButton({
  label,
  onPress,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bigButton,
        kind === 'primary' ? styles.bigButtonPrimary : styles.bigButtonGhost,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={kind === 'primary' ? styles.bigButtonPrimaryText : styles.bigButtonGhostText}>
        {label}
      </Text>
    </Pressable>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.overlayScrim}>
      <PopIn style={styles.overlayCard}>{children}</PopIn>
    </View>
  );
}

// ---------------------------------------------------------------- app

export default function App() {
  const { width } = useWindowDimensions();
  const [state, dispatch] = useReducer(reducer, null, () =>
    makeDealState(0, { won: 0, played: 0, streak: 0 }),
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Animated values (transform/opacity only, native driver).
  const trayY = useRef(new Animated.Value(0)).current;
  const trayOpacity = useRef(new Animated.Value(1)).current;
  const stockShakeX = useRef(new Animated.Value(0)).current;
  const trayShakeX = useRef(new Animated.Value(0)).current;
  const foundationRef = useRef<ScrollView>(null);

  const runShake = useCallback((v: Animated.Value) => {
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 5, duration: 45, useNativeDriver: true }),
      Animated.timing(v, { toValue: -5, duration: 65, useNativeDriver: true }),
      Animated.timing(v, { toValue: 3, duration: 55, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, []);

  // ---------------- derived state
  const deal = deals[state.dealIndex];
  const word = state.tray.map((e) => e.letter).join('');
  const wordValid = isValidWord(word);
  const tableauLeft = useMemo(
    () => state.columns.reduce((n, c) => n + c.length, 0),
    [state.columns],
  );
  const usableLetters = useMemo(() => {
    const letters: string[] = [];
    for (const col of state.columns) {
      if (col.length > 0) letters.push(col[col.length - 1]);
    }
    if (state.waste.length > 0) letters.push(state.waste[state.waste.length - 1]);
    return letters;
  }, [state.columns, state.waste]);
  const anyPlay = useMemo(() => existsPlayableWord(usableLetters), [usableLetters]);
  const canRecycle = state.stock.length === 0 && state.waste.length > 0 && state.recyclesLeft > 0;
  const canDraw = state.stock.length > 0 || canRecycle;
  const isDead = !state.won && tableauLeft > 0 && !anyPlay && !canDraw;
  const showDrawHint = !state.won && !isDead && !anyPlay && tableauLeft > 0;
  const wasteTop = state.waste.length > 0 ? state.waste[state.waste.length - 1] : null;
  const wasteInTray = state.tray.some((e) => e.source === 'waste');
  const bestWord = state.played.reduce((a, b) => (b.length > a.length ? b : a), '');

  // ---------------- layout metrics
  const pad = 12;
  const colW = Math.floor((width - pad * 2 - 4 * 6) / 7);
  const cardH = Math.round(colW * 1.35);
  const pileW = colW + 8;
  const pileH = Math.round(pileW * 1.3);
  const trayW = Math.floor((width - pad * 2 - 5 * 7) / MAX_WORD);
  const trayH = Math.round(trayW * 1.28);

  // ---------------- handlers
  const onStockTap = () => {
    if (busyRef.current) return;
    if (!canDraw) {
      runShake(stockShakeX); // inert stock: tiny shake
      return;
    }
    dispatch({ type: 'draw' });
  };

  const onTapColumn = (col: number) => {
    if (busyRef.current) return;
    if (state.tray.length >= MAX_WORD) {
      runShake(trayShakeX); // tray full
      return;
    }
    dispatch({ type: 'tapColumn', col });
  };

  const onTapWaste = () => {
    if (busyRef.current) return;
    if (state.tray.length >= MAX_WORD) {
      runShake(trayShakeX);
      return;
    }
    dispatch({ type: 'tapWaste' });
  };

  const onTapTray = (index: number) => {
    if (busyRef.current) return;
    dispatch({ type: 'tapTray', index });
  };

  const onClear = () => {
    if (busyRef.current) return;
    dispatch({ type: 'clearTray' });
  };

  const onPlay = () => {
    if (busyRef.current || !wordValid) return;
    busyRef.current = true;
    setBusy(true);
    // Tray cards fly up toward the foundation, then the play commits.
    Animated.parallel([
      Animated.timing(trayY, { toValue: -64, duration: 260, useNativeDriver: true }),
      Animated.timing(trayOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => {
      dispatch({ type: 'play' });
      trayY.setValue(0);
      trayOpacity.setValue(1);
      busyRef.current = false;
      setBusy(false);
    });
  };

  const onRedeal = () => {
    if (busyRef.current) return;
    dispatch({ type: 'redeal' });
  };

  const onShare = async () => {
    const message =
      `LETTERFALL ♠ deal #${state.dealIndex + 1}\n` +
      `cleared in ${state.played.length} words · best: ${bestWord.toUpperCase()}\n` +
      `word klondike — every deal winnable`;
    try {
      await Share.share({ message });
    } catch {
      // sharing cancelled or unavailable — nothing to do
    }
  };

  // ---------------- render
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.root}>
        {/* top bar */}
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>LETTERFALL</Text>
          <View style={styles.topBarRight}>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>
                {state.stats.won}/{state.stats.played}
              </Text>
              <Text style={styles.statLabel}>won</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{state.stats.streak}</Text>
              <Text style={styles.statLabel}>streak</Text>
            </View>
            <Pressable
              onPress={onRedeal}
              hitSlop={8}
              style={({ pressed }) => [styles.redealBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.redealGlyph}>↻</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.dealRow}>
          <Text style={styles.dealText}>deal #{state.dealIndex + 1}</Text>
          <Text style={styles.dealLabel}>{deal ? deal.label : ''}</Text>
        </View>

        {/* stock / waste / foundation */}
        <View style={styles.pilesRow}>
          <Animated.View style={{ transform: [{ translateX: stockShakeX }] }}>
            <Pressable onPress={onStockTap} style={({ pressed }) => pressed && canDraw ? { opacity: 0.8 } : null}>
              {state.stock.length > 0 ? (
                <CardBack width={pileW} height={pileH}>
                  <Text style={styles.stockCount}>{state.stock.length}</Text>
                </CardBack>
              ) : (
                <View style={[styles.emptyPile, { width: pileW, height: pileH }]}>
                  <Text style={[styles.recycleGlyph, canRecycle ? styles.recycleOn : styles.recycleOff]}>
                    {canRecycle ? '↻' : '·'}
                  </Text>
                </View>
              )}
            </Pressable>
            <View style={styles.pipsRow}>
              <View style={[styles.pip, state.recyclesLeft >= 1 && styles.pipOn]} />
              <View style={[styles.pip, state.recyclesLeft >= 2 && styles.pipOn]} />
            </View>
            <Text style={styles.pileCaption}>stock</Text>
          </Animated.View>

          <View style={styles.wasteWrap}>
            {wasteTop !== null ? (
              <PopIn key={`${state.dealIndex}-w-${state.waste.length}`}>
                <Pressable disabled={wasteInTray || busy} onPress={onTapWaste}>
                  <LetterCard
                    letter={wasteTop}
                    width={pileW}
                    height={pileH}
                    glow={!wasteInTray}
                    lifted={wasteInTray}
                  />
                </Pressable>
              </PopIn>
            ) : (
              <View style={[styles.emptyPile, { width: pileW, height: pileH }]} />
            )}
            <Text style={[styles.pileCaption, styles.wasteCaption]}>waste</Text>
          </View>

          <Text style={styles.flowArrow}>→</Text>

          <View style={styles.foundationCol}>
            <ScrollView
              ref={foundationRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.foundationScroll}
              contentContainerStyle={styles.foundationContent}
              onContentSizeChange={() => foundationRef.current?.scrollToEnd({ animated: true })}
            >
              {state.played.length === 0 ? (
                <Text style={styles.foundationEmpty}>played words land here</Text>
              ) : (
                state.played.map((w, i) => <WordChip key={i} word={w} />)
              )}
            </ScrollView>
            <Text style={styles.tableauLeft}>tableau left: {tableauLeft}</Text>
          </View>
        </View>

        {/* tableau columns */}
        <View style={styles.columnsRow}>
          {state.columns.map((col, i) => {
            const inTray = state.tray.some((e) => e.source === i);
            const faceDown = Math.max(0, col.length - 1);
            const top = col.length > 0 ? col[col.length - 1] : null;
            return (
              <View key={i} style={{ width: colW }}>
                {Array.from({ length: faceDown }, (_, j) => (
                  <View key={j} style={[styles.stub, j > 0 && styles.stubOverlap]} />
                ))}
                {top !== null ? (
                  <PopIn
                    key={`${state.dealIndex}-c${i}-${col.length}`}
                    style={faceDown > 0 ? styles.topCardOverlap : undefined}
                  >
                    <Pressable
                      disabled={inTray || busy}
                      onPress={() => onTapColumn(i)}
                      style={({ pressed }) => (pressed && !inTray ? { opacity: 0.8 } : null)}
                    >
                      <LetterCard
                        letter={top}
                        width={colW}
                        height={cardH}
                        glow={!inTray}
                        lifted={inTray}
                      />
                    </Pressable>
                  </PopIn>
                ) : (
                  <View style={[styles.emptyColSlot, { width: colW, height: cardH }]} />
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.hintRow}>
          {showDrawHint ? <Text style={styles.hintText}>no plays — draw</Text> : null}
        </View>

        <View style={styles.spacer} />

        {/* word tray */}
        <Animated.View style={[styles.trayRow, { transform: [{ translateX: trayShakeX }] }]}>
          {Array.from({ length: MAX_WORD }, (_, i) => {
            const entry = state.tray[i] as TrayEntry | undefined;
            if (!entry) {
              return (
                <View
                  key={`slot-${i}`}
                  style={[styles.traySlot, { width: trayW, height: trayH }]}
                />
              );
            }
            return (
              <Animated.View
                key={`card-${i}`}
                style={{ opacity: trayOpacity, transform: [{ translateY: trayY }] }}
              >
                <Pressable disabled={busy} onPress={() => onTapTray(i)}>
                  <LetterCard letter={entry.letter} width={trayW} height={trayH} />
                </Pressable>
              </Animated.View>
            );
          })}
        </Animated.View>

        {/* actions */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={onClear}
            disabled={busy || state.tray.length === 0}
            style={({ pressed }) => [
              styles.clearButton,
              state.tray.length === 0 && { opacity: 0.4 },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.clearButtonText}>CLEAR</Text>
          </Pressable>
          <Pressable
            onPress={onPlay}
            disabled={busy || !wordValid}
            style={({ pressed }) => [
              styles.playButton,
              wordValid ? styles.playButtonReady : styles.playButtonIdle,
              pressed && wordValid && { opacity: 0.85 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={wordValid ? styles.playTextReady : styles.playTextIdle}
            >
              {wordValid ? `PLAY ${word.toUpperCase()}` : word.length > 0 ? word.toUpperCase() : 'PLAY'}
            </Text>
            <Text style={[styles.playSub, wordValid && styles.playSubReady]}>
              {wordValid
                ? `${word.length} letters`
                : word.length === 0
                  ? 'tap cards to spell'
                  : word.length < 3
                    ? 'too short'
                    : 'not a word'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* win overlay */}
      {state.won && (
        <Overlay>
          <Text style={styles.overlayKicker}>
            deal #{state.dealIndex + 1} · {deal ? deal.label : ''}
          </Text>
          <Text style={styles.overlayTitle}>TABLEAU CLEARED</Text>
          <View style={styles.overlayRule} />
          <View style={styles.wonWordsWrap}>
            {state.played.map((w, i) => (
              <WordChip key={i} word={w} />
            ))}
          </View>
          <Text style={styles.overlayStat}>
            {state.played.length} words · best {bestWord.toUpperCase()}
          </Text>
          <BigButton label="SHARE" onPress={onShare} />
          <BigButton label="NEXT DEAL" kind="ghost" onPress={onRedeal} />
        </Overlay>
      )}

      {/* dead deal overlay */}
      {isDead && (
        <Overlay>
          <Text style={styles.overlayKicker}>
            deal #{state.dealIndex + 1} · {deal ? deal.label : ''}
          </Text>
          <Text style={styles.overlayTitle}>DEAD DEAL</Text>
          <View style={styles.overlayRule} />
          <Text style={styles.overlayBody}>
            The shuffle got you — no word left in these letters. This line ran out; the next deal is
            a fresh one, and every deal has a winning path.
          </Text>
          <BigButton label="REDEAL" onPress={onRedeal} />
        </Overlay>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- styles

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
} as const;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  root: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },

  // top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statBlock: {
    alignItems: 'center',
  },
  statValue: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: C.inkFaint,
    fontSize: 9,
    letterSpacing: 1,
  },
  redealBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redealGlyph: {
    color: C.ink,
    fontSize: 18,
    lineHeight: 22,
  },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
    marginBottom: 10,
  },
  dealText: {
    color: C.inkMuted,
    fontSize: 12,
  },
  dealLabel: {
    color: C.inkFaint,
    fontSize: 11,
    fontStyle: 'italic',
  },

  // stock / waste / foundation row
  pilesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stockCount: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    color: C.inkMuted,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
  },
  pip: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.inkFaint,
  },
  pipOn: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  pileCaption: {
    color: C.inkFaint,
    fontSize: 9,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 3,
  },
  wasteWrap: {
    alignItems: 'center',
  },
  wasteCaption: {
    marginTop: 6,
  },
  emptyPile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recycleGlyph: {
    fontSize: 22,
  },
  recycleOn: {
    color: C.accent,
  },
  recycleOff: {
    color: C.inkFaint,
  },
  flowArrow: {
    color: C.inkFaint,
    fontSize: 14,
    alignSelf: 'center',
    marginTop: -14,
  },
  foundationCol: {
    flex: 1,
    justifyContent: 'center',
  },
  foundationScroll: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderSoft,
    backgroundColor: C.surface,
    flexGrow: 0,
  },
  foundationContent: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  foundationEmpty: {
    color: C.inkFaint,
    fontSize: 11,
    fontStyle: 'italic',
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceHi,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipText: {
    color: C.ink,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tableauLeft: {
    color: C.inkMuted,
    fontSize: 11,
    marginTop: 5,
    marginLeft: 2,
    fontVariant: ['tabular-nums'],
  },

  // tableau
  columnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  stub: {
    height: 14,
    borderRadius: 4,
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: C.border,
  },
  stubOverlap: {
    marginTop: -8,
  },
  topCardOverlap: {
    marginTop: -5,
  },
  emptyColSlot: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderSoft,
    opacity: 0.6,
  },

  // letter cards
  letterCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardEdge,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  letterCardGlow: {
    borderColor: C.accentDim,
    shadowColor: C.accent,
    shadowOpacity: 0.45,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  letterCardLifted: {
    opacity: 0.35,
    transform: [{ translateY: -5 }],
  },
  letterCardText: {
    color: C.cardInk,
    fontWeight: '800',
  },
  letterCardCorner: {
    position: 'absolute',
    top: 3,
    left: 4,
    color: C.cardInkSoft,
    fontWeight: '700',
  },

  // card backs
  cardBack: {
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  cardBackSpade: {
    color: C.accentFaint,
  },

  // hint
  hintRow: {
    height: 20,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: C.accent,
    fontSize: 12,
    letterSpacing: 1,
  },
  spacer: {
    flex: 1,
  },

  // tray
  trayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  traySlot: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.borderSoft,
    backgroundColor: C.surface,
  },

  // actions
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  clearButton: {
    width: 76,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: C.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  playButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  playButtonIdle: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  playButtonReady: {
    backgroundColor: C.accent,
  },
  playTextIdle: {
    color: C.inkMuted,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 2,
  },
  playTextReady: {
    color: '#0c2417',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 2,
  },
  playSub: {
    color: C.inkFaint,
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  playSubReady: {
    color: 'rgba(12,36,23,0.65)',
  },

  // overlays
  overlayScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: 22,
    alignItems: 'center',
  },
  overlayKicker: {
    color: C.inkFaint,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 6,
  },
  overlayTitle: {
    color: C.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
  },
  overlayRule: {
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.accent,
    marginTop: 10,
    marginBottom: 14,
  },
  overlayBody: {
    color: C.inkMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 18,
  },
  wonWordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  overlayStat: {
    color: C.inkMuted,
    fontSize: 13,
    marginBottom: 18,
  },
  bigButton: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  bigButtonPrimary: {
    backgroundColor: C.accent,
  },
  bigButtonPrimaryText: {
    color: '#0c2417',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
  },
  bigButtonGhost: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
  },
  bigButtonGhostText: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
