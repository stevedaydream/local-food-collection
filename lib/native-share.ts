/**
 * Capacitor 殼內：其他 App 分享截圖進來時，原生端（ShareReceiverPlugin）
 * 先把圖暫存為 base64，這裡取回轉成 Blob 交給 AnalyzeSheet。
 * 一般瀏覽器 / PWA 沒有 window.Capacitor，回傳 null。
 */
export async function takePendingSharedImage(): Promise<Blob | null> {
  try {
    const plugin = (window as any).Capacitor?.Plugins?.ShareReceiver;
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
