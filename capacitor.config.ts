import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stevedaydream.localfood',
  appName: '口袋美食地圖',
  // 殼直接載入線上版本；webDir 只是離線 fallback 頁
  webDir: 'capacitor-shell',
  server: {
    url: 'https://local-food-collection.vercel.app',
    androidScheme: 'https',
  },
};

export default config;
