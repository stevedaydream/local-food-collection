'use client';

import { useEffect, useRef, useState } from 'react';

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
/** 骰子滾動時長 (ms) */
export const ROLL_MS = 2000;

/** 全屏骰子滾動動畫，播完呼叫 onDone */
export default function DiceRoll({ onDone }: { onDone: () => void }) {
  const [face, setFace] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const iv = setInterval(() => setFace((f) => (f + 1 + Math.floor(Math.random() * 5)) % 6), 130);
    const t = setTimeout(() => doneRef.current(), ROLL_MS);
    return () => {
      clearInterval(iv);
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="dice-overlay">
      <span className="dice-face">{FACES[face]}</span>
      <p className="dice-hint">骰子滾動中…</p>
    </div>
  );
}
