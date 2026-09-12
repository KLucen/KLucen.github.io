/*!
 * aplayer-mirror.js —— Meting 播放器镜像自动选择 + 全站吸底播放器管理
 *
 * 背景：Butterfly 的 MetingJS 默认使用 https://api.i-meto.com/meting/api，该服务已半失效
 * （歌单元数据偶尔还能返回，但 type=url 音频端点返回 404 空数组），APlayer 会报
 * “An audio error has occurred, player will skip forward in 2 seconds”。
 *
 * 做法：不再让 MetingJS 直接用写死的默认 API，而是由本脚本在初始化前探测镜像：
 * 拉取歌单 + 用 <audio> 真实试探第一首能否加载（媒体元素不受 CORS 限制，最接近实际播放），
 * 选出可用镜像后写入 data-api，再交给 MetingJS 正常初始化。
 *
 * 兼容多播放器：页面上所有 .aplayer[data-playlist-id] 都会被处理；PJAX 之后新注入的
 * 播放器由 pjaxComplete 钩子补上（走已选定的镜像，不再重复探测）。
 *
 * 音乐页 /music/ 有自己的专属播放器（见 music-page.js），所以在该路径下不初始化、
 * 也不显示全站吸底播放器，避免两个播放器打架。
 *
 * 关键坑：div 上刻意不写 data-id —— MetingJS 的 DOMContentLoaded 扫描会无条件给带
 * no-destroy 的元素标记 no-reload（哪怕当时没有 data-id、根本没初始化），所以这里
 * 在调 loadMeting() 之前必须先摘掉 no-reload。
 *
 * 对外暴露 window.metingMirror，供 music-page.js 复用同一套镜像选择逻辑。
 */
(function () {
  'use strict'

  // Meting API 镜像，按优先级排列。:server / :type / :id 由 MetingJS 负责替换。
  var MIRRORS = [
    'https://api.injahow.cn/meting/?server=:server&type=:type&id=:id',
    'https://api.qijieya.cn/meting/?server=:server&type=:type&id=:id',
    'https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r'
  ]

  var CACHE_KEY = 'meting-mirror'
  var FAST_TIMEOUT = 7000
  var FALLBACK_TIMEOUT = 10000

  // 这些路径下隐藏全站吸底播放器（音乐页有专属播放器）。留空数组则到处都显示。
  var HIDE_FIXED_ON = ['/music/']
  var FIXED_HIDE_CLASS = 'meting-fixed-hidden'

  var chosenApi = null   // 已选定的镜像模板
  var probing = {}       // server:id -> 进行中的探测 Promise

  function buildUrl(mirror, server, type, id) {
    return String(mirror)
      .replace(':server', server)
      .replace(':type', type)
      .replace(':id', id)
      .replace(':r', String(Math.random()))
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')) }, ms)
      promise.then(
        function (v) { clearTimeout(timer); resolve(v) },
        function (e) { clearTimeout(timer); reject(e) }
      )
    })
  }

  // 歌单元数据是否可用
  function fetchPlaylist(mirror, server, id, ms) {
    var url = buildUrl(mirror, server, 'playlist', id)
    return withTimeout(
      fetch(url, { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        // 上游挂掉时经常返回 HTML 错误页，res.json() 会直接抛错，正好当作失败
        return res.json()
      }),
      ms
    ).then(function (data) {
      if (!Array.isArray(data) || !data.length) throw new Error('empty playlist')
      if (!data.some(function (t) { return t && t.url })) throw new Error('no audio url')
      return data
    })
  }

  // 用 <audio> 试探音频真的能加载：躲开“歌单能返回但音频 404”这类半死不活的镜像
  function probeAudio(url, ms) {
    return new Promise(function (resolve, reject) {
      var el = new Audio()
      var settled = false
      var timer = setTimeout(function () { finish(false) }, ms)

      function finish(ok) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        el.onloadedmetadata = el.oncanplay = el.onerror = null
        try { el.removeAttribute('src') } catch (e) {}
        if (ok) resolve()
        else reject(new Error('audio unavailable'))
      }

      el.onloadedmetadata = function () { finish(true) }
      el.oncanplay = function () { finish(true) }
      el.onerror = function () { finish(false) }
      el.preload = 'metadata'
      el.src = url
    })
  }

  function attempt(mirror, server, id, ms) {
    return fetchPlaylist(mirror, server, id, ms).then(
      function (list) {
        var first = list.filter(function (t) { return t && t.url })[0]
        return probeAudio(first.url, ms).then(
          function () { return { api: mirror, list: list, ok: true } },
          function () { return { api: mirror, list: list, ok: false, reason: 'audio' } }
        )
      },
      function (err) { return { api: mirror, ok: false, reason: err.message } }
    )
  }

  function readCache() {
    try { return localStorage.getItem(CACHE_KEY) } catch (e) { return null }
  }

  function writeCache(mirror) {
    try { localStorage.setItem(CACHE_KEY, mirror) } catch (e) { /* 隐私模式下忽略 */ }
  }

  // 先试缓存/首选镜像（成功就只花 1 次歌单 + 1 次音频探测），失败再并行试其余镜像
  function probeAndChoose(server, id) {
    var cached = readCache()
    var order = MIRRORS.slice()
    if (cached && MIRRORS.indexOf(cached) >= 0) {
      order = [cached].concat(MIRRORS.filter(function (m) { return m !== cached }))
    }

    return attempt(order[0], server, id, FAST_TIMEOUT).then(function (first) {
      if (first.ok || order.length < 2) return first
      console.warn('[aplayer] 镜像不可用：' + order[0] + '（' + first.reason + '），尝试备用镜像…')
      var rest = order.slice(1)
      return Promise.all(rest.map(function (m) {
        return attempt(m, server, id, FALLBACK_TIMEOUT)
      })).then(function (results) {
        var ok = results.filter(function (r) { return r.ok })[0]
        if (ok) return ok
        // 都没通过音频校验时，退而求其次：至少歌单能拿到的镜像仍可列出歌曲
        var partial = results.filter(function (r) { return r.reason === 'audio' })[0]
        return partial || results[0] || first
      })
    })
  }

  // 对外接口：选定（或复用）一个可用镜像，并顺手返回该歌单数据，避免调用方重复请求
  function ensure(server, id) {
    if (chosenApi) {
      return fetchPlaylist(chosenApi, server, id, FALLBACK_TIMEOUT).then(
        function (list) { return { api: chosenApi, list: list, ok: true } },
        function () { return probeAndChoose(server, id) }   // 该镜像取不到这个歌单，重新探测
      )
    }
    var key = server + ':' + id
    if (!probing[key]) {
      probing[key] = probeAndChoose(server, id).then(function (res) {
        delete probing[key]
        if (res && res.ok) { chosenApi = res.api; writeCache(chosenApi) }
        return res
      })
    }
    return probing[key]
  }

  window.metingMirror = {
    ensure: ensure,
    url: function (server, type, id) {
      return buildUrl(chosenApi || MIRRORS[0], server, type, id)
    }
  }

  function normalizePath() {
    var p = location.pathname.replace(/index\.html$/, '')
    if (p.length > 1 && p.charAt(p.length - 1) !== '/') p += '/'
    return p
  }

  function hideFixed() {
    return HIDE_FIXED_ON.indexOf(normalizePath()) !== -1
  }

  // 该初始化哪些播放器：跳过音乐页专属播放器与（音乐页上的）吸底播放器
  function pendingPlayers() {
    var hide = hideFixed()
    return [].slice.call(document.querySelectorAll('.aplayer[data-playlist-id]:not([data-id])'))
      .filter(function (el) {
        if (el.hasAttribute('data-music-player')) return false
        if (hide && el.getAttribute('data-fixed') === 'true') return false
        return true
      })
  }

  // 音乐页上把吸底播放器藏起来（并暂停，避免音乐在看不见的地方继续播）
  function syncFixedVisibility() {
    var hide = hideFixed()
    var players = window.aplayers || []
    for (var i = 0; i < players.length; i++) {
      var p = players[i]
      if (!p || !p.options || !p.options.fixed || !p.container) continue
      if (hide) {
        try { p.pause() } catch (e) {}
        p.container.classList.add(FIXED_HIDE_CLASS)
      } else {
        p.container.classList.remove(FIXED_HIDE_CLASS)
      }
    }
  }

  function initPlayers() {
    var seed = pendingPlayers()[0]
    if (!seed) return

    var server = seed.getAttribute('data-server') || 'netease'
    var id = seed.getAttribute('data-playlist-id')

    ensure(server, id).then(function (res) {
      // 探测期间可能发生了 PJAX，这里重新查一次，只处理仍在文档里、且还没初始化的
      var list = pendingPlayers()
      if (!list.length) return
      list.forEach(function (el) {
        el.classList.remove('no-reload')
        el.setAttribute('data-api', res.api)
        el.setAttribute('data-id', el.getAttribute('data-playlist-id'))
      })
      if (typeof loadMeting === 'function') loadMeting()
      // 防止后续 loadMeting 重复初始化（MetingJS 只对 no-destroy 元素自动加 no-reload）
      list.forEach(function (el) { el.classList.add('no-reload') })
      console.info('[aplayer] 使用镜像：' + res.api + (res.ok ? '（已验证可播放）' : '（未通过音频校验）'))
    })
  }

  function boot() {
    syncFixedVisibility()
    initPlayers()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false)
  } else {
    boot()
  }

  // PJAX：补初始化新注入的播放器，并同步吸底播放器的显隐
  if (window.btf && typeof window.btf.addGlobalFn === 'function') {
    window.btf.addGlobalFn('pjaxComplete', function () {
      syncFixedVisibility()
      if (chosenApi) initPlayers()
      // 还没选定镜像时无需处理：首次探测完成后 boot/initPlayers 会自己收尾
    }, 'aplayerMirrorInit')
  }
})()
