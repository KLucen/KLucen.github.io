# Hexo → Mizuki 迁移记录

## 迁移时间
2026-09-20

## 迁移内容

### ✅ 已完成
- [x] 14 篇文章迁移（保留 abbrlink 和原始 URL）
- [x] 5 个相册迁移（邓紫棋、二次元、壁纸、旅游、美食，共 79 张图片）
- [x] 关于页面
- [x] 友情链接页面
- [x] 站点配置（标题、副标题、B站 UID）
- [x] URL 结构保持 `/posts/abbrlink.html` 格式
- [x] GitHub Actions 部署配置

### ⏳ 待配置
- [ ] Live2D 看板娘（需手动引入 live2d-widget）
- [ ] 评论系统（Waline/Twikoo）
- [ ] 音乐播放器页面（APlayer）
- [ ] 追番列表（Bilibili API 已配置，需验证）
- [ ] 说说/日记页面
- [ ] 百度站长平台重新提交 sitemap

## URL 映射表

所有文章 URL 保持不变：
- `/posts/66321874.html` - AI-Agent 章节精读笔记
- `/posts/640296d4.html` - AI-Agent 精读笔记仓库开源
- `/posts/dcdda2ae.html` - My birthday
- `/posts/73edb7ce.html` - dsh 桌面快捷启动插件
- `/posts/7e01b64d.html` - dsh 桌面快捷启动插件 v0.2
- `/posts/3c50d03d.html` - Markdown 语法
- `/posts/c84b68c2.html` - 修复了播放器切换页面后会重新播放的问题
- `/posts/3f1a38d7.html` - 听音乐
- `/posts/113bbe75.html` - 乐子分类创建
- `/posts/f9251f91.html` - 学习分类创建
- `/posts/c464c8c6.html` - 生活分类创建
- `/posts/236920fa.html` - 编程分类创建
- `/posts/ff624643.html` - 美食分类创建
- `/posts/ee52215e.html` - 随想分类创建

## 技术栈

- **框架**: Astro 7.1.3
- **主题**: Mizuki (基于 Fuwari)
- **部署**: GitHub Pages + GitHub Actions
- **评论**: 待配置（原 Waline）
- **图床**: pics.klucen.cn（外链模式）

## 配置说明

### Permalink 配置
```typescript
// src/config/permalinkConfig.ts
format: "posts/%abbrlink%.html"
```

### Bilibili 配置
```typescript
// src/config/siteConfig.ts
bilibili: {
  vmid: "190973118",
  // ...
}
```

## 部署步骤

1. 初始化 git 仓库并提交
2. 推送到 GitHub
3. 在仓库设置中启用 GitHub Pages（Source: GitHub Actions）
4. 更新 DNS 指向（如果更换了仓库名）

## 回滚方案

保留原 Hexo 仓库，如需回滚：
1. 恢复 DNS 到原仓库
2. 重新启用原仓库的 GitHub Pages

## 注意事项

1. 所有文章 URL 已保持兼容，百度收录不会丢失
2. 图片全部使用外链，无需迁移图片文件
3. 分类文章已标记为草稿（draft: true），不会显示在首页
4. 相册使用外链模式，图片仍在图床上
