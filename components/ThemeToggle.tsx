'use client';

import { useEffect, useState } from 'react';
import { applyTheme, loadThemeChoice, resolveTheme, saveThemeChoice, type ThemeChoice } from '@/lib/theme';

/**
 * 標題列的淺色／深色開關：兩段式滑軌，滑塊停在目前呈現的那一側。
 * 三段狀態裡的「自動（跟隨系統）」放在 ⚙️ 設定，這裡只做一鍵切換。
 */
export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('auto');
  const [shown, setShown] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const initial = loadThemeChoice();
    setChoice(initial);
    setShown(resolveTheme(initial));
    // 使用者在系統層切換時，auto 模式要跟著動
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const current = loadThemeChoice();
      if (current === 'auto') setShown(resolveTheme('auto'));
    };
    mq.addEventListener('change', onChange);
    // 設定裡改了選項時同步這顆開關
    const onTheme = () => {
      const current = loadThemeChoice();
      setChoice(current);
      setShown(resolveTheme(current));
    };
    window.addEventListener('food-map:theme', onTheme);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('food-map:theme', onTheme);
    };
  }, []);

  const toggle = () => {
    const next: ThemeChoice = shown === 'dark' ? 'light' : 'dark';
    saveThemeChoice(next);
    setChoice(next);
    setShown(next);
  };

  // auto 時 applyTheme 沒被呼叫過，補一次讓狀態列顏色正確
  useEffect(() => {
    if (choice === 'auto') applyTheme('auto');
  }, [choice, shown]);

  return (
    <button
      className="theme-switch"
      role="switch"
      aria-checked={shown === 'dark'}
      aria-label={shown === 'dark' ? '切換到淺色' : '切換到深色'}
      title={choice === 'auto' ? '跟隨系統（點一下改成手動）' : shown === 'dark' ? '深色' : '淺色'}
      onClick={toggle}
      data-mode={shown}
    >
      <span className="theme-switch-face" aria-hidden="true">
        ☀
      </span>
      <span className="theme-switch-face" aria-hidden="true">
        ☾
      </span>
      <span className="theme-switch-knob" aria-hidden="true" />
    </button>
  );
}
