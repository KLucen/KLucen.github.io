/*!
 * pwa.js —— 注册 Service Worker
 *
 * Butterfly 的 pwa 配置只负责输出 manifest 链接，并不会注册 Service Worker，
 * 而「离线可访问 / 可安装」都要求有 SW，所以这里自己注册 /sw.js。
 *
 * 只在 https（或 localhost 调试）下注册，因为浏览器不允许其他环境使用 SW。
 *
 * 想撤销：把 _config.butterfly.yml 里的 pwa.enable 关掉并移除本脚本的注入，
 * 然后在浏览器控制台执行一次：
 *   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
 * 再清掉站点数据即可。
 */
(function () {
  'use strict'

  if (!('serviceWorker' in navigator)) return

  var secure = location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
  if (!secure) return

  // 直接注册，不等 load 事件：这个站第三方资源较多，load 可能被拖很久甚至不触发，
  // 挂到 load 上会导致 SW 注册被无限期推迟。defer 脚本执行时 DOM 已解析完，注册时机足够安全。
  navigator.serviceWorker.register('/sw.js').catch(function (err) {
    console.warn('[pwa] Service Worker 注册失败：' + (err && err.message ? err.message : err))
  })
})()
