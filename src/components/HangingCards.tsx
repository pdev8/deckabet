import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Accelerometer } from 'expo-sensors';

import LetterCard from './LetterCard';
import { C } from '../theme';

// Title-screen ambience (DB-168): letter cards are pulled up from below on
// strings, settle midair, and dangle. The whole scene shifts a little with the
// phone's tilt (accelerometer) for a parallax feel — cards nearer the "front"
// (bigger) move more. Honors reduce-motion with a still, level scene.

const LETTERS = 'DECKABET'.split('');
const PARALLAX = 16; // px of shift at full tilt, scaled by each card's depth
const STRING_W = 1.5;

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface Hanger {
  letter: string;
  x: number; // center x
  stringLen: number; // top edge → card top at rest (also the card's rest height)
  cardW: number;
  cardH: number;
  depth: number; // 0.4–1 → size + parallax weight
  amp: number; // dangle degrees
  period: number; // dangle ms
  delay: number; // rise stagger
  dir: 1 | -1; // initial sway direction
}

function makeHangers(width: number): Hanger[] {
  const n = LETTERS.length;
  const cellW = width / n;
  return LETTERS.map((letter, i) => {
    const depth = rand(0.45, 1);
    const cardW = Math.round(30 + depth * 26); // 30–56
    return {
      letter,
      x: Math.round(i * cellW + cellW * (0.25 + Math.random() * 0.5)),
      // Rest height = string length from the top edge; varied so the cards hang
      // at staggered depths and frame the centered menu.
      stringLen: Math.round(rand(80, 470)),
      cardW,
      cardH: Math.round(cardW * 1.4),
      depth,
      amp: rand(1.5, 3.2),
      period: rand(2600, 4200),
      delay: Math.round(rand(0, 700)),
      dir: Math.random() < 0.5 ? 1 : -1,
    };
  });
}

export default function HangingCards({ reduceMotion = false }: { reduceMotion?: boolean }) {
  const { width, height } = useWindowDimensions();
  const hangers = useMemo(() => makeHangers(width), [width]);

  // Shared tilt, updated from the accelerometer; each card reads it scaled.
  const tilt = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const rise = useMemo(() => hangers.map(() => new Animated.Value(0)), [hangers]);
  const sway = useMemo(() => hangers.map(() => new Animated.Value(0)), [hangers]);

  // Pull the cards up and start them dangling.
  useEffect(() => {
    if (reduceMotion) {
      rise.forEach((v) => v.setValue(1));
      return;
    }
    const anims = rise.map((v, i) =>
      Animated.sequence([
        Animated.delay(hangers[i].delay),
        Animated.spring(v, { toValue: 1, friction: 6, tension: 38, useNativeDriver: true }),
      ]),
    );
    anims.forEach((a) => a.start());

    const loops = sway.map((v, i) => {
      const { period, dir } = hangers[i];
      v.setValue(dir);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: -dir, duration: period, useNativeDriver: true }),
          Animated.timing(v, { toValue: dir, duration: period, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return loop;
    });
    return () => {
      anims.forEach((a) => a.stop());
      loops.forEach((l) => l.stop());
    };
  }, [rise, sway, hangers, reduceMotion]);

  // Accelerometer → parallax tilt (low-passed to kill jitter).
  useEffect(() => {
    if (reduceMotion) return;
    let sx = 0;
    let sy = 0;
    let sub: { remove: () => void } | null = null;
    try {
      Accelerometer.setUpdateInterval(33);
      sub = Accelerometer.addListener(({ x, y }) => {
        sx = sx * 0.82 + clamp(x, -1, 1) * 0.18;
        sy = sy * 0.82 + clamp(-y, -1, 1) * 0.18;
        tilt.setValue({ x: sx, y: sy });
      });
    } catch {
      // no sensor on this device — cards just hang level
    }
    return () => sub?.remove();
  }, [tilt, reduceMotion]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {hangers.map((h, i) => {
        const start = height - h.stringLen + h.cardH + 80; // begins fully below the screen
        const riseY = rise[i].interpolate({ inputRange: [0, 1], outputRange: [start, 0] });
        const px = Animated.multiply(tilt.x, h.depth * PARALLAX);
        const py = Animated.multiply(tilt.y, h.depth * PARALLAX);
        const rotate = sway[i].interpolate({
          inputRange: [-1, 1],
          outputRange: [`-${h.amp}deg`, `${h.amp}deg`],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.unit,
              {
                left: h.x - h.cardW / 2,
                width: h.cardW,
                transform: [
                  { translateX: px },
                  { translateY: Animated.add(riseY, py) },
                  { rotate },
                ],
              },
            ]}
          >
            {/* string from the top edge down to the card */}
            <View style={[styles.string, { height: h.stringLen }]} />
            <LetterCard letter={h.letter} width={h.cardW} height={h.cardH} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  unit: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
  },
  string: {
    width: STRING_W,
    backgroundColor: C.border,
  },
});
