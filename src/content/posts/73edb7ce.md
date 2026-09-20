---
title: 给 dsh web 做了个桌面快捷启动插件
published: 2026-09-09 19:30:00
description: ''
tags:
  - 编程
category: 编程
draft: false
abbrlink: '73edb7ce'
---

给 `dsh web` 写了个小插件 —— **dsh-desktop_quick_launcher**,补上我一直觉得最缺的两块体验:**双击桌面图标启动**,和**在界面里一键退出**。

仓库在 [GitHub: KLucen/dsh-desktop_quick_launcher](https://github.com/KLucen/dsh-desktop_quick_launcher)(Apache-2.0)。

## 为什么会有这个插件

`dsh web` 是本地优先的服务,日常用其实挺舒服:浏览器打开就是完整 GUI,不占资源、不上云。但「本地服务」嘛,总有点桌面应用才有的别扭感:

- **启动要开终端**:先找到终端,敲 `dsh web`,等它起来,再手动开浏览器;
- **退出没入口**:界面里没有「关掉服务」的按钮,关掉浏览器只是断开连接,服务还在后台占着 3080 端口,要么留着吃内存,要么回终端 Ctrl+C。

其实之前有 [@linxin666/dsh-desktop-launcher](https://www.npmjs.com/package/@linxin666/dsh-desktop-launcher) 这个插件解决过类似问题,但它已经退役了。与其依赖别人维护,不如自己动手独立重建一个:能按自己的习惯调整,许可证干净(Apache-2.0,派生关系见仓库 NOTICE),于是就有了这个插件。

## 它能做什么

插件是**双面结构**:

- **Host 端**:cordis 插件(注入 `webServer`),提供两个 API,负责「生成桌面图标」和「优雅退出」;
- **Client 端**:加载进 `dsh web` 页面,右下角多出两个小按钮。

整体就是下图这么个关系:

```
┌─────────────────── dsh web 进程(Host) ───────────────────┐
│  /api/dsh-desktop_quick_launcher/create   → 生成桌面图标   │
│  /api/dsh-desktop_quick_launcher/shutdown → 优雅退出进程   │
│              ▲                               ▲           │
│              └────────── fetch ──────────────┘           │
│   Client(浏览器右下角悬浮按钮):                           │
│     ⏻ 一键退出 · ＋ 一键生成/刷新桌面图标                  │
└──────────────────────────────────────────────────────────┘
```

### ① 双击桌面图标启动

第一次用,在界面里点右下角那个「生成图标」小按钮,桌面就会出现一个 `DSH-Web` 图标(Windows 是 `.lnk`,macOS 是 `.command`,Linux 是 `.desktop`;dsh 图标会复制到脚本旁边,以后就算包被移动,快捷方式也不会失效)。

双击之后脚本会做三件事:

1. **先探测** GUI 地址——如果 `dsh web` 已经在运行,直接打开浏览器、退出脚本;
2. 没在运行的话,**隐藏启动** `dsh web --no-open`,然后轮询等待服务就绪(给了 150 秒预算,冷启动慢的机器也够);
3. 就绪后自动打开浏览器。打开这一步还带了**三连兜底**:`Start-Process` → `explorer.exe` → `cmd /c start`,"启动成功了但没弹浏览器"这种情况基本被消灭了。

排查也简单:每一步(调用了什么命令、找到了哪个 dsh、spawn 的 pid、子进程早退、就绪、每次打开尝试、超时)都写进脚本旁边的 `launcher.log`,出问题看一个文件就够,不用猜。

### ② 界面内一键退出

右下角有一个固定的**圆形电源按钮**(悬浮在页面角落)。点击后弹出的是**自定义确认弹窗**,不是浏览器那个又丑又不可控的原生 `confirm`;确认后请求 `POST /shutdown`:

- 宿主进程收到后走**优雅退出**(优先用 dsh launcher 提供的 `ctx.appExit`,没有就回退 `process.exit(0)`);
- 关键细节:先让响应送达浏览器,**再退出进程**,然后页面自己关闭——不会出现"点了没反应"的错觉。

按钮旁边还有个小按钮,用来**一键生成/刷新桌面图标**,结果用 toast 提示。比如图标被误删了、或者想换一套启动配置,不用再摸终端。

### ③ 安全边界:只允许本机操作

`create` 和 `shutdown` 这两个接口**仅限 loopback**:会同时校验 socket 地址、Host 头和同源标记。也就是说,即使哪天把 `dsh web` 暴露到了局域网,别人也没法远程给你创建图标或者远程关机。默认还带 `enabled` 总开关,不想要可以整体关掉。

配置走 schemastery,暴露在 `desktop-quick-launcher` 命名空间下:`enabled` / `announceToAgent` / `dshCommand` / `url` / `profile` / `iconPath` / `confirmShutdown`,可以在 dsh web 的设置里按需调整(比如换端口、换自定义图标)。

## 安装

还没发布到 npm,先走 GitHub:

```bash
dsh plugin --profile web add github:KLucen/dsh-desktop_quick_launcher
# 重启 dsh web 后生效(客户端产物是启动时装载的)
dsh web
```

直连不了 github.com 的话(比如在墙内),用镜像地址:

```bash
dsh plugin --profile web add "https://gh-proxy.com/https://codeload.github.com/KLucen/dsh-desktop_quick_launcher/tar.gz/refs/heads/main"
```

重启后进页面,右下角应该能看到按钮了;点「生成图标」→ 桌面出现 `DSH-Web` → 以后双击就能开,用完点电源按钮就能关,再也不用为它专门开终端了。

> 小提醒:第一次双击启动时服务要冷启动(最长 150 秒),**别在就绪前反复双击**——多个脚本实例会各自拉起一个 `dsh web`,后来的会因 3080 端口被占用而退出(日志里会提示),等第一次启动完成就好。

## 踩坑记录(写给想写 dsh web 插件的人)

开发过程中最折腾的不是功能本身,而是 **Client 端产物怎么让 dsh web 正常加载**:

- DSH 的浏览器端 loader 要求每个插件的 `./client` 入口是 **classic script**,并且必须通过 `window.__ModuleLoader__.load({ id, factory })` 自注册(`react`/`react-dom` 是由 loader 的 `require` 注入的);
- 如果直接发一个纯 ESM 的 `client.mjs`,`dsh web` 会**启动中止**,报 `loaded without registering ... via ModuleLoader.load`;
- 解决方案:`pnpm build` 里用 esbuild 做一个包装步骤(`scripts/wrap-client.mjs`)产出 `lib/client.js`,再在 VM 里校验产物(`scripts/verify-client.mjs`)。
- 血泪教训:别图省事用 PowerShell 手写包装文件——会破坏 UTF-8,界面中文直接变乱码,老老实实从源码 rebuild。

手动升级也有个坑:直接 bump 版本后 `pnpm install`,顶层 `node_modules` 里的条目可能还链着旧版本的 store 目录。正确姿势是先 `dsh plugin --profile web remove dsh-desktop_quick_launcher`,再重新 add。

## 已知限制(如实说)

- 退出按钮会终止**整个** `dsh web` 进程:正在跑的会话/任务会被中断(会话有持久化,重启后可恢复);
- `/create` 和 `/shutdown` 刻意只限 loopback:通过远程浏览器连接局域网暴露的服务时,这两个按钮不可用;
- Windows 下生成的图标固定叫 `DSH-Web.lnk`,同名快捷方式会被覆盖;
- macOS / Linux 的启动脚本由同一套模板生成,但主要在 Windows 上开发验证,那边有问题欢迎带 `launcher.log` 反馈;
- SDK 依赖锁定在 `@deepseek-ai/* 0.1.2-rc.1` 一线,会随 DSH 发布节奏更新。

## 尾巴

至此,`dsh web` 终于有点「正经本地应用」的样子了:桌面上双击图标就能开,用完点一下电源按钮就走,不用再记命令、不用再找终端。

如果这个插件对你有用,欢迎去 [GitHub 仓库](https://github.com/KLucen/dsh-desktop_quick_launcher) 点个 Star,有问题或建议直接开 issue;[中文 README](https://github.com/KLucen/dsh-desktop_quick_launcher/blob/main/README.zh.md) 里有更完整的安装和故障排查说明。

水完这篇,证明博主还活着(确信)。
