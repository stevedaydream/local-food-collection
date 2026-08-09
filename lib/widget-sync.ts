import { countryOf } from './country-bbox';
import type { DeviceLocation } from './location';
import type { SavedRestaurant } from './types';

/**
 * 在 Capacitor Android 殼內時，把口袋名單與目前位置同步給原生 widget（SharedPreferences）。
 * 一般瀏覽器 / PWA 環境沒有 window.Capacitor，直接 no-op。
 */
function widgetPlugin() {
  try {
    return (window as any).Capacitor?.Plugins?.WidgetSync ?? null;
  } catch {
    return null;
  }
}

/**
 * 同步口袋名單。
 * - 縮圖 (thumb) 是 data URL、體積大且 widget 用不到，同步前先移除
 * - countryCode 在這裡補算好（原生端沒有座標→國家的對照表），widget 才能做「跟著我的位置」
 */
export function syncToWidget(list: SavedRestaurant[]) {
  const plugin = widgetPlugin();
  if (!plugin) return;
  try {
    const slim = list.map(({ thumb: _thumb, ...rest }) => ({
      ...rest,
      countryCode: rest.countryCode ?? countryOf(rest.lat, rest.lng)?.code ?? null,
    }));
    plugin.syncRestaurants({ json: JSON.stringify(slim) }).catch(() => {});
  } catch {
    /* widget 同步失敗不影響主流程 */
  }
}

/**
 * 同步目前位置，讓 widget 的「📍 跟著我的位置」有依據。
 * widget 自己抓 GPS 需要背景定位權限，所以改由 App 每次成功定位時推過去。
 */
export function syncLocationToWidget(loc: DeviceLocation | null) {
  const plugin = widgetPlugin();
  if (!plugin || !loc) return;
  try {
    plugin
      .syncLocation({
        json: JSON.stringify({
          lat: loc.lat,
          lng: loc.lng,
          country: loc.country,
          countryCode: loc.countryCode,
          city: loc.city,
          district: loc.district,
          at: loc.at,
        }),
      })
      .catch(() => {});
  } catch {
    /* 舊版 App 沒有這個方法：忽略，widget 照舊用手動選的區域 */
  }
}
