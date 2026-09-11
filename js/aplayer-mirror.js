/*!
 * aplayer-mirror.js —— 音乐播放器的 Meting API 镜像自动选择
 *
 * 背景：Butterfly 的 MetingJS 默认使用 https://api.i-meto.com/meting/api，
 * 该服务已失效（歌单元数据偶尔还能返回，但 type=url 音频端点返回 404 空数组），
 * APlayer 因此报 “An audio error has occurred, player will skip forward in 2 seconds”。
 *
 * 做法：不再让 MetingJS 直接用写死的默认 API，而是由本脚本在初始化前探测镜像：
 * 拉取歌单 + 用 <audio> 真实试探第一首歌能否加载（媒体元素不受 CORS 限制，
 * 最接近实际播放），选出第一个真正可用的镜像后写入 data-api，
 * 再交给 MetingJS 正常初始化。
 *
 * 注意：div 上刻意不写 data-id，MetingJS 自己的 DOMContentLoaded 扫描才会跳过它，
 * 避免和本脚本抢占初始化。
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

  function tryMirror(mirror, server, id, ms) {
    return fetchPlaylist(mirror, server, id, ms).then(
      function (list) {
        var first = list.filter(function (t) { return t && t.url })[0]
        return probeAudio(first.url, ms).then(
          function () { return { mirror: mirror, ok: true } },
          function () { return { mirror: mirror, ok: false, reason: 'audio' } }
        )
      },
      function (err) { return { mirror: mirror, ok: false, reason: err.message } }
    )
  }

  // 先试首选镜像（成功就只花 1 次歌单 + 1 次音频探测），失败再并行试其余镜像
  function pick(order, server, id) {
    return tryMirror(order[0], server, id, FAST_TIMEOUT).then(function (first) {
      if (first.ok || order.length < 2) return first
      console.warn('[aplayer] 镜像不可用：' + order[0] + '（' + first.reason + '），尝试备用镜像…')
      var rest = order.slice(1)
      return Promise.all(rest.map(function (m) {
        return tryMirror(m, server, id, FALLBACK_TIMEOUT)
      })).then(function (results) {
        var ok = results.filter(function (r) { return r.ok })[0]
        if (ok) return ok
        // 都没通过音频校验时，退而求其次：至少歌单能拿到的镜像仍可列出歌曲
        var partial = results.filter(function (r) { return r.reason === 'audio' })[0]
        return partial || results[0] || first
      })
    })
  }

  function readCache() {
    try { return localStorage.getItem(CACHE_KEY) } catch (e) { return null }
  }

  function writeCache(mirror) {
    try { localStorage.setItem(CACHE_KEY, mirror) } catch (e) { /* 隐私模式下忽略 */ }
  }

  function run() {
    var div = document.querySelector('.aplayer[data-playlist-id]')
    if (!div) return

    var id = div.getAttribute('data-playlist-id')
    var server = div.getAttribute('data-server') || 'netease'
    if (!id) return

    // 上次验证通过的镜像优先，减少对免费镜像的请求
    var cached = readCache()
    var order = MIRRORS.slice()
    if (cached && MIRRORS.indexOf(cached) >= 0) {
      order = [cached].concat(MIRRORS.filter(function (m) { return m !== cached }))
    }

    pick(order, server, id).then(function (chosen) {
      if (chosen.ok) writeCache(chosen.mirror)
      div.setAttribute('data-api', chosen.mirror)
      div.setAttribute('data-id', id)

      if (typeof loadMeting === 'function') {
        // MetingJS 的 DOMContentLoaded 扫描会先把带 no-destroy 的元素标记成 no-reload
        // （哪怕当时没有 data-id、根本没初始化），所以这里必须先摘掉，否则它再次跳过。
        div.classList.remove('no-reload')
        loadMeting()
        console.info('[aplayer] 使用镜像：' + chosen.mirror + (chosen.ok ? '（已验证可播放）' : '（未通过音频校验）'))
      } else {
        console.warn('[aplayer] MetingJS 未加载，播放器无法初始化')
      }
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, false)
  } else {
    run()
  }
})()
