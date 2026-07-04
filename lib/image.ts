/** 用 canvas 將圖片縮放並轉為 JPEG data URL */
async function drawScaled(file: Blob, maxEdge: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

/** 分析用：縮到 1568px 內、控制上傳量與 token 成本 */
export async function toAnalyzePayload(file: Blob): Promise<{ base64: string; mediaType: string }> {
  const dataUrl = await drawScaled(file, 1568, 0.85);
  return { base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
}

/** 收藏卡片縮圖：小尺寸避免塞爆 localStorage */
export async function toThumb(file: Blob): Promise<string> {
  return drawScaled(file, 160, 0.7);
}
