/*!
 * sw.js —— 站点 Service Worker
 *
 * 作用：
 *   1. 让站点离线可用（断网也能打开已访问过的页面）；
 *   2. 满足 PWA 可安装的前提之一（存在带 fetch 处理的 Service Worker）。
 *
 * 策略：一律「网络优先」，成功时顺手更新缓存，只有网络失败才回落到缓存。
 * 好处是在线时看到的永远是最新内容，不会因为 SW 缓存而吃到旧页面。
 *
 * 缓存范围：
 *   - 同源的所有 GET；
 *   - 跨域的**静态资源**（.css/.js/字体/图片）—— 主要是 jsDelivr、alicdn 这些 CDN，
 *     这样离线打开时样式和图标不会整个丢光；
 *   - 跨域的非静态请求（各种 API，比如 Meting 接口）一律不缓存，
 *     免得把接口返回的旧 JSON 当成新数据。
 *
 * 关键点：SW 只能缓存「经过它」的请求。首次访问时 SW 还没接管页面，
 * 页面自身的请求不会被缓存，所以这里同时做了两件事兜底：
 *   a) install 阶段预缓存首页与 manifest；
 *   b) 页面通过 postMessage(cache-urls) 把当前页用到的资源（含文档本身）交给 SW 缓存
 *      —— 见 source/js/pwa.js。这样「第一次访问完就断网」也能打开。
 *
 * 想彻底取消：把 _config.butterfly.yml 里 pwa.enable 改回 false、移除 /js/pwa.js 注入，
 * 然后在浏览器控制台执行一次：
 *   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
 */
const CACHE = 'klucen-v2'          // 改策略时把这个版本号 +1，旧的会被清掉
const MAX_CACHE_BYTES = 5 * 1024 * 1024
const PRECACHE = ['/', '/manifest.json']
const ASSET_RE = /\.(css|js|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot)(\?|$)/i

async function putSafe(cache, request, response) {
  if (!response) return
  if (!response.ok && response.type !== 'opaque') return
  const size = Number(response.headers.get('content-length') || 0)
  if (size && size > MAX_CACHE_BYTES) return
  try { await cache.put(request, response.clone()) } catch (e) { /* opaque/已消费等情况忽略 */ }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // 逐个缓存：任何一个失败都不该导致 SW 安装失败
    await Promise.all(PRECACHE.map(async url => {
      try { await putSafe(cache, url, await fetch(url)) } catch (e) {}
    }))
    await self.skipWaiting()      // 新版本立即生效，不排队等旧页面关闭
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    await self.clients.claim()    // 立刻接管尚未受控的页面
  })())
})

// 页面把「当前页用到的资源」交过来缓存（首次访问就断网也能打开的关键）
self.addEventListener('message', event => {
  const data = event.data
  if (!data || data.type !== 'cache-urls' || !Array.isArray(data.urls)) return
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await Promise.all(data.urls.map(async url => {
      try { await putSafe(cache, url, await fetch(url)) } catch (e) {}
    }))
  })())
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.pathname === '/sw.js') return              // SW 自身交给浏览器更新机制

  const sameOrigin = url.origin === self.location.origin
  const isAsset = ASSET_RE.test(url.pathname)
  if (!sameOrigin && !isAsset) return                // 跨域 API 一律不碰

  event.respondWith((async () => {
    try {
      const res = await fetch(req)
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone()
        putSafe(await caches.open(CACHE), req, copy)
      }
      return res
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true })
      if (hit) return hit
      if (req.mode === 'navigate') {
        const home = await caches.match('/', { ignoreSearch: true })   // 没缓存过的页面回首页
        if (home) return home
      }
      throw err
    }
  })())
})
