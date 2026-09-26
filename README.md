# 投胎模拟器

Koishi 插件，随机生成中国或世界范围的人生开局，并记录结果。

## 安装

```sh
yarn add koishi-plugin-toutai
```

在 Koishi 中启用，并安装 `database` 与 `puppeteer` 服务。

## 指令

| 指令 | 说明 |
| --- | --- |
| `toutai` | 查看帮助 |
| `toutai.投胎中国` | 开始中国模拟 |
| `toutai.投胎世界` | 开始世界模拟 |
| `toutai.中国投胎记录` / `toutai.世界投胎记录` | 查看记录 |
| `toutai.中国投胎排行榜` / `toutai.世界投胎排行榜` | 查看排行 |

可在 Koishi 中为指令设置别名。

## 地图设计与验证

地图以 [M3 Expressive](https://m3.material.io/blog/building-with-m3-expressive) 为视觉规范，角色配色与 HCT 算法复用共享设计系统；[Apple HIG](https://developer.apple.com/design/human-interface-guidelines/accessibility) 用于平台体验与可访问性。`src/map-theme.ts` 集中维护地图组件 Token：青绿色 primary 表示本次落点，浅色单调色阶表示历史权重，定位针、靶心和文字标签补充颜色信息。图例与地图使用相同的 HCT 色阶。

按 [WCAG 2.2](https://www.w3.org/TR/WCAG22/) 的对比度要求检查地图文字（至少 4.5:1）与落点识别（至少 3:1）；保留随地图发送的文本投胎结果。截图不能替代聊天客户端的读屏与缩放验收，也不代表整个客户端已通过 AA 认证。

在现有 Koishi 开发工作区安装 esbuild、puppeteer-core，并提供 Chromium 后运行：

```sh
node scripts/check-design-system.mjs
node scripts/verify-maps.mjs
```

验证脚本检查 101 档颜色、首次投胎、历史足迹、港澳台、世界及小岛地图，生成截图；可用 `CHROMIUM_PATH` 指定浏览器。静态地图不播放动画。

## 许可证

可按 [Apache-2.0](LICENSE-APACHE) 或 [MIT](LICENSE-MIT) 使用。
