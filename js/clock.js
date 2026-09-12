/*!
 * clock.js —— 安知鱼电子钟卡片的本地修正版
 *
 * 为什么需要这个文件：
 * hexo-butterfly-clock-anzhiyu@1.1.9 自带的 clock.min.js 有两个已经失效的外部依赖：
 *   1. IP 定位接口 https://api.nsmao.net/api/ipip/query —— 该域名已注销（DNS 都解析不到）；
 *   2. 和风天气 key —— 插件在你没填 key 时会回落到作者硬编码的演示 key，该 key 现已失效（403）。
 * 而原脚本只在天气请求成功时才渲染卡片，所以卡片会永远停在加载动画上，控制台还会
 * 持续报「IP定位失败」。
 *
 * 本脚本的做法：
 *   - 不再请求任何 IP 定位服务（那个服务已经不存在，无法恢复）；
 *   - 立刻渲染时间/日期，不依赖任何网络请求，卡片不会再卡在加载状态；
 *   - 只有在 qweather_key 填了有效值时才去取天气，取不到就只显示时钟，
 *     不会报错、也不会遮挡时钟。
 *
 * 也就是说：不填 key 就是「电子钟」，填了 key 就自动变回「天气时钟」。
 *
 * 想显示城市名，把下面的 CITY_NAME 改成你要的文字即可（留空则不显示）。
 */
(function () {
  'use strict'

  // 卡片右下角显示的城市/地点名。留空则隐藏该栏。
  var CITY_NAME = ''

  var box = document.getElementById('hexo_electric_clock')
  if (!box) return // 只有配置了 electric_clock 且当前页面匹配时才存在

  // 以下变量由插件在 body 里注入（见 hexo-butterfly-clock-anzhiyu/index.js）
  var key = typeof qweather_key !== 'undefined' && qweather_key ? String(qweather_key) : ''
  var host = typeof qweather_api_host !== 'undefined' && qweather_api_host
    ? qweather_api_host
    : 'nj6r6pm8pt.re.qweatherapi.com'
  var rectangle = typeof clock_rectangle !== 'undefined' && clock_rectangle ? clock_rectangle : ''

  // 关键：插件在你把 qweather_key 留空时，会回落到作者硬编码的演示 key。
  // 那个 key 已经失效（请求必 403），所以这里把它等同于「没配 key」，
  // 免得每次打开页面都往控制台丢一条 403。等你填上自己的 key 就会自动生效。
  var DEAD_KEYS = ['b16a1fa0e63c46a4b8f28abfb06ae3fe']
  var weatherEnabled = !!key && DEAD_KEYS.indexOf(key) === -1 && !!rectangle

  // 和风天气图标码 -> 配色（沿用原脚本的取值）
  function iconColor(code) {
    switch (String(code)) {
      case '100': return '#fdcc45'
      case '101': return '#fe6976'
      case '102': case '103': return '#fe7f5b'
      case '104': case '150': case '151': case '152': case '153': case '154':
      case '800': case '801': case '802': case '803': case '804': case '805':
      case '806': case '807': return '#2152d1'
      case '300': case '301': case '305': case '306': case '307': case '308':
      case '309': case '310': case '311': case '312': case '313': case '314':
      case '315': case '316': case '317': case '318': case '350': case '351':
      case '399': return '#49b1f5'
      case '302': case '303': case '304': return '#fdcc46'
      case '400': case '401': case '402': case '403': case '404': case '405':
      case '406': case '407': case '408': case '409': case '410': case '456':
      case '457': case '499': return '#a3c2dc'
      case '500': case '501': case '502': case '503': case '504': case '507':
      case '508': case '509': case '510': case '511': case '512': case '513':
      case '514': case '515': return '#97acba'
      case '900': case '999': return 'red'
      case '901': return '#179fff'
      default: return '#000'
    }
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  var WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  function pad(num, digit) {
    var zero = ''
    for (var i = 0; i < digit; i++) zero += '0'
    return (zero + num).slice(-digit)
  }

  // weather 为 null 时只渲染时钟；有天气数据时补上天气/湿度/风向栏
  function render(weather) {
    var weatherHtml = ''
    var humidityHtml = ''
    var windHtml = ''

    if (weather) {
      var color = iconColor(weather.icon)
      weatherHtml = '<i class="qi-' + esc(weather.icon) + '-fill" style="color:' + color + '"></i> '
        + esc(weather.text) + ' <span class="temp">' + esc(weather.temp) + '</span> ℃'
      humidityHtml = '💧 ' + esc(weather.humidity) + '%'
      windHtml = '<i class="qi-gale"></i> ' + esc(weather.windDir)
    } else {
      // 没有天气时保留占位（CSS 是 flex + space-between，去掉会让布局偏移）
      weatherHtml = '&nbsp;'
      humidityHtml = '&nbsp;'
      windHtml = '<i class="qi-gale"></i>'
    }

    box.innerHTML = ''
      + '<div class="clock-row">'
      +   '<span id="card-clock-clockdate" class="card-clock-clockdate"></span>'
      +   '<span class="card-clock-weather">' + weatherHtml + '</span>'
      +   '<span class="card-clock-humidity">' + humidityHtml + '</span>'
      + '</div>'
      + '<div class="clock-row">'
      +   '<span id="card-clock-time" class="card-clock-time"></span>'
      + '</div>'
      + '<div class="clock-row">'
      +   '<span class="card-clock-windDir">' + windHtml + '</span>'
      +   '<span class="card-clock-location">' + esc(CITY_NAME) + '</span>'
      +   '<span id="card-clock-dackorlight" class="card-clock-dackorlight"></span>'
      + '</div>'

    // 多次执行（pjax 回到首页）时只保留一个计时器
    if (window.__clockTimer) clearInterval(window.__clockTimer)
    window.__clockTimer = setInterval(tick, 1000)
    tick()
  }

  function tick() {
    var cd = new Date()
    var timeEl = document.getElementById('card-clock-time')
    if (!timeEl) return
    var hour = cd.getHours()
    document.getElementById('card-clock-clockdate').innerHTML =
      pad(cd.getFullYear(), 4) + '-' + pad(cd.getMonth() + 1, 2) + '-' + pad(cd.getDate(), 2) + ' ' + WEEK[cd.getDay()]
    timeEl.innerHTML = pad(hour, 2) + ':' + pad(cd.getMinutes(), 2) + ':' + pad(cd.getSeconds(), 2)
    document.getElementById('card-clock-dackorlight').innerHTML = hour > 12 ? ' P M' : ' A M'
  }

  // 先出时钟，天气是「锦上添花」，取不到就不动声色地保持纯时钟
  render(null)

  if (weatherEnabled) {
    fetch('https://' + host + '/v7/weather/now?location=' + encodeURIComponent(rectangle) + '&key=' + encodeURIComponent(key))
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data && data.code === '200' && data.now && document.getElementById('hexo_electric_clock')) {
          render(data.now)
        } else if (data && data.code && data.code !== '200') {
          console.warn('[clock] 和风天气返回 code=' + data.code + '，仅显示时钟')
        }
      })
      .catch(function (err) {
        console.warn('[clock] 天气获取失败，仅显示时钟：' + err.message)
      })
  }
})()
