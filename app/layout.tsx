import type { Metadata, Viewport } from 'next';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  title: '口袋美食地圖',
  description: '截圖分享進來，AI 自動歸檔你的口袋名單；不知道吃什麼時，一鍵隨機推薦。',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '口袋美食地圖', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  // 只留一個（不帶 media）的 theme-color，由 lib/theme.ts 依實際主題改寫；
  // 帶 media 的版本在文件順序上會贏過 JS 新增的那個，手動選色就會失效。
  themeColor: '#f2f7f5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        {/*
          在畫面畫出來之前先套上主題，深色使用者才不會看到白色閃一下。
          放 <body> 第一個子元素而不是自己寫 <head>——App Router 不支援手動 <head>，
          那樣做會讓 Next 的 CSS 注入失效（畫面只剩骨架）。
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }`,
          }}
        />
      </body>
    </html>
  );
}
