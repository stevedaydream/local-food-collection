import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '口袋美食地圖',
  description: '截圖分享進來，AI 自動歸檔你的口袋名單；不知道吃什麼時，一鍵隨機推薦。',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '口袋美食地圖', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#1a1614',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
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
