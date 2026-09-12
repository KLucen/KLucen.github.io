/*!
 * music-page.js —— /music/ 音乐页的专属播放器
 *
 * 页面结构写在 source/music/index.md 里：
 *   .music-card[data-playlist-id]  → 歌单卡片（可点）
 *   #music-page-player[data-playlist-id] → 专属播放器容器（默认载入哪个歌单）
 *   #music-page-status             → 状态文字
 *
 * 本脚本负责：
 *   - 用 APlayer 自己创建并持有这个播放器（不走 MetingJS，避免和吸底播放器抢初始化）；
 *   - 点卡片 → 通过 window.metingMirror.ensure() 取歌单（复用同一套镜像选择）→ 换列表并播放；
 *   - PJAX 进出音乐页时销毁 / 重建，避免实例泄漏。
 *
 * 注意：容器带 data-music-player 属性，aplayer-mirror.js 会据此跳过它；
 * 否则 APlayer 初始化后给容器加上 aplayer 类，会被 MetingJS 误当成待初始化播放器。
 */
(function () {
  'use strict'

  var BOX_ID = 'music-page-player'
  var STATUS_ID = 'music-page-status'
  var SERVER = 'netease'
  var THEME = '#49b1f5'

  var box = null      // 当前容器元素
  var player = null   // 当前 APlayer 实例
  var seq = 0         // 请求序号，避免快速连点时旧请求覆盖新结果

  function cards() {
    return [].slice.call(document.querySelectorAll('.music-card[data-playlist-id]'))
  }

  function setActive(card) {
    cards().forEach(function (c) { c.classList.toggle('is-active', c === card) })
  }

  function setStatus(text, isError) {
    var el = document.getElementById(STATUS_ID)
    if (!el) return
    el.textContent = text || ''
    el.classList.toggle('is-error', !!isError)
  }

  function toTracks(list) {
    return (list || []).filter(function (t) { return t && t.url }).map(function (t) {
      return {
        name: t.name || t.title || '未知曲目',
        artist: t.artist || t.author || '',
        url: t.url,
        cover: t.pic || t.cover || '',
        lrc: t.lrc || '',
        type: 'normal'   // 歌单返回的都是普通 mp3；m3u8 才会走 HLS 分支
      }
    })
  }

  function destroyPlayer() {
    if (player) {
      // 先清空列表再销毁：APlayer 的 destroy() 里会执行 audio.src=''，
      // 这会触发它内部的 error 处理；若此时列表非空，它会排一个 2 秒后
      // skipForward() 的定时器，而列表 DOM 那时已被销毁 —— 于是抛
      // "Cannot read properties of undefined (reading 'classList')"。
      // 清空后 audios.length 为 0，error 处理不会做任何事。
      try { player.list.clear() } catch (e) { /* 忽略 */ }
      try { player.destroy() } catch (e) { /* 已销毁过就忽略 */ }
    }
    player = null
    window.musicPagePlayer = null   // 调试句柄，顺便清掉
  }

  function load(id, card, autoplay) {
    if (!box) return
    setActive(card)
    setStatus('正在载入歌单…')

    var token = ++seq
    window.metingMirror.ensure(SERVER, id).then(function (res) {
      if (token !== seq) return                                  // 有更新的请求了
      if (box !== document.getElementById(BOX_ID)) return         // PJAX 已经把容器换走了
      var tracks = toTracks(res.list)
      if (!tracks.length) {
        setStatus('这个歌单没有可播放的曲目', true)
        return
      }

      if (!player) {
        // 用 APlayer 直接创建：容器一上来就有完整列表，不会出现空的占位状态
        player = new APlayer({
          container: box,
          audio: tracks,
          fixed: false,
          mini: false,
          autoplay: false,
          mutex: true,          // 与吸底播放器互斥，不会两个一起响
          listFolded: false,
          listMaxHeight: '360px',
          preload: 'none',
          theme: THEME,
          loop: 'all',
          order: 'list',
          volume: 0.7,
          storageName: 'metingjs-music'
        })
      } else {
        player.list.clear()
        player.list.add(tracks)
      }
      player.list.switch(0)
      if (autoplay) player.play()
      window.musicPagePlayer = player   // 调试句柄：控制台可直接查 window.musicPagePlayer

      setStatus('共 ' + tracks.length + ' 首' + (card ? ' · ' + card.getAttribute('data-playlist-name') : ''))
    }, function (err) {
      if (token !== seq) return
      setStatus('歌单载入失败：' + (err && err.message ? err.message : '未知错误'), true)
    })
  }

  function init() {
    var el = document.getElementById(BOX_ID)
    if (!el) {          // 不在音乐页（或 PJAX 已经离开）：收掉实例
      destroyPlayer()
      box = null
      return
    }
    if (box === el && player) return   // 同一个容器且已经建好，保持播放状态

    destroyPlayer()
    box = el

    var defaultCard = cards()[0]
    var defaultId = el.getAttribute('data-playlist-id') ||
      (defaultCard && defaultCard.getAttribute('data-playlist-id'))
    if (defaultId) load(defaultId, defaultCard, false)   // 首屏只载入，不自动播放
  }

  // 事件委托：PJAX 换进来的新卡片也能点
  document.addEventListener('click', function (e) {
    var target = e.target
    var card = target && target.closest ? target.closest('.music-card[data-playlist-id]') : null
    if (!card) return
    var el = document.getElementById(BOX_ID)
    if (!el) return
    e.preventDefault()
    if (box !== el) { destroyPlayer(); box = el }
    load(card.getAttribute('data-playlist-id'), card, true)
  }, false)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, false)
  } else {
    init()
  }

  if (window.btf && typeof window.btf.addGlobalFn === 'function') {
    window.btf.addGlobalFn('pjaxSend', function () {
      destroyPlayer()
      box = null
    }, 'musicPageDestroy')
    window.btf.addGlobalFn('pjaxComplete', init, 'musicPageInit')
  }
})()
