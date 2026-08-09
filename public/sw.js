/* Service worker：
 * 1. 讓 PWA 可安裝
 * 2. 接收 Android「分享」進來的截圖（Web Share Target POST），
 *    暫存到 Cache 後導回首頁觸發 AI 分析
 * 3. 分享進來的是文字／連結（例如 Google 地圖的分享）時，
 *    同樣暫存到 Cache，導回首頁開新增表單自動解析 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const image = formData.get('image');
          if (image && image.size > 0) {
            const cache = await caches.open('shared-images');
            await cache.put('/shared-image', new Response(image, { headers: { 'Content-Type': image.type } }));
            return Response.redirect('/?share-target=1', 303);
          }
          // 沒有圖片：把分享進來的文字/連結留給新增表單解析
          const text = [formData.get('url'), formData.get('text'), formData.get('title')]
            .filter((v) => typeof v === 'string' && v.trim())
            .join('\n');
          if (text) {
            const cache = await caches.open('shared-images');
            await cache.put('/shared-text', new Response(text, { headers: { 'Content-Type': 'text/plain' } }));
            return Response.redirect('/?share-text=1', 303);
          }
        } catch (e) {
          // 拿不到內容就單純導回首頁
        }
        return Response.redirect('/?share-target=1', 303);
      })(),
    );
  }
});
