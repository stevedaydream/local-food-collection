/**
 * 淺色 / 深色主題：三種狀態——auto（跟隨系統）、light、dark。
 * 主題只是把 <html data-theme> 換掉，配色本身全在 app/globals.css 的 token 裡。
 */

export type ThemeChoice = 'auto' | 'light' | 'dark';

const KEY = 'food-map:theme';

/** 狀態列顏色要跟著換，不然 PWA 上面那條會跟畫面對不起來 */
const BAR: Record<'light' | 'dark', string> = {
  light: '#f2f7f5',
  dark: '#0e1d20',
};

export function loadThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'auto';
  const raw = localStorage.getItem(KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'auto';
}

/** 目前實際呈現的是哪一種（auto 時看系統設定） */
export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'auto') return choice;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);

  // 全部 theme-color meta 一起改（含 Next 注入的那個），狀態列才不會跟畫面不同調
  const color = BAR[resolveTheme(choice)];
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = color;
    document.head.appendChild(meta);
    return;
  }
  metas.forEach((meta) => {
    meta.removeAttribute('media');
    meta.setAttribute('content', color);
  });
}

export function saveThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* 存不進去就只在這次生效 */
  }
  applyTheme(choice);
}

/**
 * 在 <head> 就跑掉的一行腳本：先把 data-theme 補上，避免深色使用者看到白色閃一下。
 * 這裡回傳字串給 app/layout.tsx 內嵌。
 */
export const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem('${KEY}');` +
  `var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);` +
  `if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);` +
  `var m=document.querySelector('meta[name="theme-color"]');` +
  `if(m){m.removeAttribute('media');m.setAttribute('content',d?'${BAR.dark}':'${BAR.light}')}` +
  `}catch(e){}`;
