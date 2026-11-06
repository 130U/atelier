# 摄影与音乐主页：模板调研

调研日期：2026-11-06。星标数、许可证和最近提交时间均通过 GitHub API 核对。

## 结论

- **现在的网站：** 《二手的光》（Secondhand Light），Claude 的第一个展览，发布在 `www.theodoreoy.com/atelier/`，和主站分开维护。
- **图像不用模板，也不用图像模型：** 每幅作品是一段逐像素计算的 JavaScript 程序（`art/works/`）。灯箱、相册结构的思路参考了 Astro Photo Folio。
- **音乐不托管音频文件：** 六张唱片都是作曲规则，用 Web Audio 在浏览器里实时合成，所以没有版权问题，也不占带宽。
- **首页是“潜空间”：** CLIP 给所有作品算出向量，UMAP 投影到三维；访客选一个情绪词，最相关的作品会围着检索点展开。

## 摄影模板对比

| 模板 | 技术栈 | 许可证 | 星标 | 最近提交 | 特点 | 适合度 |
|---|---|---|---|---|---|---|
| [Astro Photo Folio](https://github.com/XD-QIN/astro-photo-folio) | Astro 7，静态 | MIT | 17 | 2026-10-07 | 数码 / 胶片两个分集、按月日历、摄影博客、即时打开的灯箱、侧边栏导航；是 GitHub 模板仓库 | 高：轻、静态、易改 |
| [Bridget](https://github.com/Sped0n/bridget) | Hugo + SolidJS | MIT | 205 | 2026-11-02 | 图片随鼠标轨迹逐张出现，底部一行极简导航；专为摄影师和视觉艺术家设计 | 高（视觉）；Hugo 模板语言需另学 |
| [Hugo Theme Gallery](https://github.com/nicokaiser/hugo-theme-gallery) | Hugo | MIT | 762 | 2026-05-28 | 深色、相册分类、等高拼图布局、灯箱；成熟稳定 | 中：可靠但风格较常规 |
| [Gallery Deluxe](https://github.com/bep/gallerydeluxe) | Hugo 模块 | MIT | 218 | 2026-09-18 | 由 Hugo 作者维护，针对大量图片优化 | 中：照片很多时考虑 |
| [Exif Photo Blog](https://github.com/sambecker/exif-photo-blog) | Next.js + Vercel Postgres/Blob | 仓库未附许可证 | 1.7k | 2026-11-05 | 网页后台上传，每张照片显示光圈、快门、ISO、胶片模拟 | 低：没有许可证即默认保留所有权利，不能直接改用 |
| [Afilmory](https://github.com/Afilmory/afilmory) | Vite + React 单体仓库 | AGPL-3.0（附界面署名要求），库代码 MIT | 2.7k | 2026-11-03 | 观感最精致：WebGL 看图、EXIF、地图、S3/GitHub 同步 | 低：偏完整应用，许可证约束强，难与音乐合并 |
| [ChronoFrame](https://github.com/HoshinoSuzumi/chronoframe) | 自托管服务 | AGPL-3.0 | 2.0k | 2026-11-06 | 在线管理照片、支持 Live Photo、地图 | 低：需要服务器 |

在线演示：[Astro Photo Folio](https://xd-qin.github.io/) · [Bridget](https://bridget-demo.sped0n.com) · [Hugo Theme Gallery](https://nicokaiser.github.io/hugo-theme-gallery/) · [Exif Photo Blog](https://photos.sambecker.com) · [Afilmory](https://afilmory.art)

## 音乐部分的做法

| 做法 | 说明 | 取舍 |
|---|---|---|
| 唱片墙（推荐） | 用一个 JSON 或 Markdown 文件记录专辑：封面、年份、一句感受、Apple Music / Spotify / 网易云链接 | 完全可控、风格统一、没有版权问题；需要自己写页面 |
| 官方嵌入播放器 | Apple Music、Spotify、网易云的外链播放器 iframe | 合法、能试听；样式由平台决定，用在单个详情页比较好 |
| [APlayer](https://github.com/DIYgod/APlayer) + [MetingJS](https://github.com/metowolf/MetingJS) | 中文博客常用的悬浮播放器，可按网易云或 QQ 音乐歌单 ID 拉取 | 都是 MIT；依赖第三方接口，部分歌曲因版权拿不到；APlayer 最近一次提交在 2024-02 |
| “正在听”卡片 | 用 GitHub Actions 定时从 Last.fm 或 ListenBrainz 拉最近播放，生成 JSON 供页面读取 | 不需要后端；需要先开始记录听歌数据。参考 [Yudaotor/nowplaying](https://github.com/Yudaotor/nowplaying)（GPL-3.0，只借鉴思路） |

## 部署与分离

- **GitHub Pages**：免费账户只能从公开仓库发布；项目站可以单独绑定子域名（如 `photos.theodoreoy.com`）或另一个域名，和主站分开。
- **Cloudflare Pages / Vercel**：可以从私有仓库部署，也能绑定独立域名。
- 自己拍的照片建议先压缩、去除 GPS 信息再放进仓库；照片多了以后可以改放对象存储（如 Cloudflare R2）。
- 别人的摄影作品需要取得授权并署名，或者只放链接。

## 来源

- [Astro 主题目录：Astro Photo Folio](https://astro.build/themes/details/astro-photo-folio/)
- [Hugo 主题目录：Bridget](https://themes.gohugo.io/themes/bridget)
- [Hugo 主题目录：Hugo Theme Gallery](https://themes.gohugo.io/themes/hugo-theme-gallery)
- [MetingJS 使用说明](https://github.com/metowolf/MetingJS)
- [用 GitHub Actions 生成 “Now Listening” 数据](https://injoon5.vercel.app/blog/now-listening)
- [Andy Bell：个人网站的音乐收藏页](https://piccalil.li/projects/personal-site/8)
- [Speckyboy：摄影师作品集网站案例](https://speckyboy.com/photographer-portfolio-web-design-inspiration.md)
- [clip-from-zero：在浏览器里运行 CLIP 的图片搜索](https://github.com/dev48v/clip-from-zero)
- [Spotify 开发者社区：音频特征接口停止对新应用开放](https://community.spotify.com/t5/Spotify-for-Developers/Web-API-Get-Track-s-Audio-Features-403-error/td-p/6654507)
- [Rauno Freiberg 的作品集（设计工程师风格参考）](https://rauno.me)
