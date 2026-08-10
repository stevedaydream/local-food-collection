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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1d20' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        {/* 在畫面畫出來之前先套上主題，深色使用者才不會看到白色閃一下 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
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
