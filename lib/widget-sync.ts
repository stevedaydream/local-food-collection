import type { SavedRestaurant } from './types';

/**
 * 在 Capacitor Android 殼內時，把口袋名單同步給原生 widget（SharedPreferences）。
 * 一般瀏覽器 / PWA 環境沒有 window.Capacitor，直接 no-op。
 * 縮圖 (thumb) 是 data URL、體積大且 widget 用不到，同步前先移除。
 */
export function syncToWidget(list: SavedRestaurant[]) {
  try {
    const plugin = (window as any).Capacitor?.Plugins?.WidgetSync;
    if (!plugin) return;
    const slim = list.map(({ thumb: _thumb, ...rest }) => rest);
    plugin.syncRestaurants({ json: JSON.stringify(slim) }).catch(() => {});
  } catch {
    /* widget 同步失敗不影響主流程 */
  }
}
