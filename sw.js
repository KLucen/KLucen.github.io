/*!
 * sw.js —— 极简 Service Worker
 *
 * 作用有两个：
 *   1. 让站点可以离线访问（网络失败时用缓存兜底）；
 *   2. 满足 PWA 可安装的前提之一（存在带 fetch 处理的 Service Worker）。
 *
 * 策略：同源 GET 一律「网络优先」，成功时顺手更新缓存。
 * 这样做的好处是在线时看到的永远是最新内容，不会因为 SW 缓存而吃到旧页面；
 * 只有网络失败时才回落到缓存。跨域请求（jsDelivr、Meting 接口、网易云图床等）
 * 一律不拦截，避免把第三方响应缓存住，导致「明明更新了却还是旧的」。
 *
 * 想彻底取消：把 _config.butterfly.yml 里 pwa.enable 改回 false 并删掉
 * /js/pwa.js 的注入；已装过 SW 的浏览器需要注销一次（见 pwa.js 注释说明）。
 */
const CACHE = 'klucen-v1'
const MAX_CACHE_BYTES = 5 * 1024 * 1024   // 超过 5MB 的响应不入缓存

self.addEventListener('install', () => {
  self.skipWaiting()          // 新版本立即生效，不排队等待旧页面全部关闭
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    await self.clients.claim()  // 立刻接管尚未受控的页面
  })())
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return   // 第三方一律不碰
  if (url.pathname === '/sw.js') return             // SW 自身交给浏览器更新机制

  event.respondWith((async () => {
    try {
      const res = await fetch(req)
      if (res && res.ok && res.type === 'basic') {
        const size = Number(res.headers.get('content-length') || 0)
        if (!size || size <= MAX_CACHE_BYTES) {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {})
        }
      }
      return res
    } catch (err) {
      const hit = await caches.match(req)
      if (hit) return hit
      if (req.mode === 'navigate') {
        const home = await caches.match('/')   // 离线直接访问某个没缓存过的页面时回首页
        if (home) return home
      }
      throw err
    }
  })())
})
