/** 預設中心：台北市（定位失敗時的退路） */
export const TAIPEI = { lat: 25.033, lng: 121.5654 };

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: {
    Geolocation?: {
      getCurrentPosition: (opts?: {
        timeout?: number;
      }) => Promise<{ coords: { latitude: number; longitude: number } }>;
    };
  };
}

/** 取得目前位置：Capacitor 殼用原生定位、瀏覽器用 navigator.geolocation，都失敗退回台北 */
export async function getPosition(): Promise<{ lat: number; lng: number; fallback: boolean }> {
  try {
    const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
    if (cap?.isNativePlatform?.() && cap.Plugins?.Geolocation) {
      const pos = await cap.Plugins.Geolocation.getCurrentPosition({ timeout: 8000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, fallback: false };
    }
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('unsupported'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 300000 });
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, fallback: false };
  } catch {
    return { ...TAIPEI, fallback: true };
  }
}
