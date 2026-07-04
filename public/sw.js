/* Service worker：
 * 1. 讓 PWA 可安裝
 * 2. 接收 Android「分享」進來的截圖（Web Share Target POST），
 *    暫存到 Cache 後導回首頁觸發 AI 分析 */

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
          }
        } catch (e) {
          // 拿不到圖片就單純導回首頁
        }
        return Response.redirect('/?share-target=1', 303);
      })(),
    );
  }
});
