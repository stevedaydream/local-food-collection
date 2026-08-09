/**
 * Capacitor 殼內：其他 App 分享截圖進來時，原生端（ShareReceiverPlugin）
 * 先把圖暫存為 base64，這裡取回轉成 Blob 交給 AnalyzeSheet。
 * 一般瀏覽器 / PWA 沒有 window.Capacitor，回傳 null。
 */
function sharePlugin() {
  return (window as any).Capacitor?.Plugins?.ShareReceiver;
}

export async function takePendingSharedImage(): Promise<Blob | null> {
  try {
    const plugin = sharePlugin();
    if (!plugin) return null;
    const { data, mimeType } = await plugin.getPendingImage();
    if (!data) return null;
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'image/jpeg' });
  } catch {
    return null;
  }
}

/**
 * Capacitor 殼內：其他 App 分享「文字」進來（Google 地圖 → 分享 → 口袋美食地圖，
 * 內容是店名 + 短網址）時，原生端暫存的文字；取回後交給 EditSheet 自動解析。
 */
export async function takePendingSharedText(): Promise<string | null> {
  try {
    const plugin = sharePlugin();
    if (!plugin) return null;
    const { text } = await plugin.getPendingText();
    return text || null;
  } catch {
    return null;
  }
}
