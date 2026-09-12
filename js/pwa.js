/*!
 * pwa.js —— 注册 Service Worker，并把当前页用到的资源交给它缓存
 *
 * Butterfly 的 pwa 配置只负责输出 manifest 链接，并不会注册 Service Worker，
 * 而「离线可访问 / 可安装」都要求有 SW，所以这里自己注册 /sw.js。
 *
 * 为什么要额外 postMessage：
 * SW 只能缓存「经过它」的请求。首次访问时 SW 尚未接管页面，
 * 页面自己的 HTML/CSS/JS 请求不会被缓存，于是「第一次看完就断网」会打不开。
 * 这里在 SW 就绪后把当前文档与同源静态资源交给它缓存，补上这一段。
 *
 * 只在 https（或 localhost 调试）下注册，因为浏览器不允许其他环境使用 SW。
 * 注册时机也不能等 load 事件：本站第三方资源多，load 可能长时间不触发。
 *
 * 想撤销：把 _config.butterfly.yml 里的 pwa.enable 关掉并移除本脚本注入，
 * 然后在浏览器控制台执行一次：
 *   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
 */
(function () {
  'use strict'

  if (!('serviceWorker' in navigator)) return

  var secure = location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
  if (!secure) return

  function collectUrls () {
    var urls = [location.origin + location.pathname]
    var nodes = document.querySelectorAll('link[rel="stylesheet"][href], script[src]')
    for (var i = 0; i < nodes.length; i++) {
      var u = nodes[i].href || nodes[i].src
      // 只交同源资源；跨域 CDN 由 SW 自己按静态资源规则缓存
      if (u && u.indexOf(location.origin) === 0 && urls.indexOf(u) === -1) urls.push(u)
    }
    return urls
  }

  function warmCache (reg) {
    var sw = navigator.serviceWorker.controller || (reg && reg.active)
    if (!sw) return
    try {
      sw.postMessage({ type: 'cache-urls', urls: collectUrls() })
    } catch (e) { /* 忽略 */ }
  }

  navigator.serviceWorker.register('/sw.js').then(function (reg) {
    warmCache(reg)
    // 首次注册时 SW 可能还没激活，等它就绪后再补一次
    navigator.serviceWorker.ready.then(function () { warmCache(reg) }).catch(function () {})
  }).catch(function (err) {
    console.warn('[pwa] Service Worker 注册失败：' + (err && err.message ? err.message : err))
  })
})()
