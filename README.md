# 投胎模拟器

Koishi 插件：随机投胎模拟，模拟降生中国与世界的各项人生结果，并查看记录与排行榜

[![GitHub](https://img.shields.io/badge/GitHub-仓库-181717?logo=github)](https://github.com/araea/koishi-plugin-toutai)
[![npm](https://img.shields.io/badge/npm-包-CC3534?logo=npm)](https://www.npmjs.com/package/koishi-plugin-toutai)

## 安装

```sh
yarn add koishi-plugin-toutai
```

启用插件后，需安装 `database` 与 `puppeteer` 服务（`koishi-plugin-puppeteer`）。

## 快速使用

发送 `toutai.投胎中国` 或 `toutai.投胎世界` 开始模拟。两次投胎之间有冷却时间，可在配置中调整。

## 配置

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `defaultMaxDisplayCount` | number | 20 | 排行榜默认显示的人数。 |
| `nextReincarnationCooldownSeconds` | number | 60 | 两次投胎之间的冷却时间（秒）。 |
| `shouldPrefixUsernameInMessageSending` | boolean | true | 回复时 @ 用户。 |
| `retractDelay` | number | 0 | 上一条消息的自动撤回延迟（秒），0 表示不撤回。同一频道只保留最新一条。 |
| `isMapImageIncludedAfterRebirth` | boolean | true | 投胎后附上一张地图。 |
| `imageType` | "png" \| "jpeg" \| "webp" | "png" | 发送的图片格式。 |

## 指令

| 指令 | 说明 |
| --- | --- |
| `toutai` | 查看帮助 |
| `toutai.投胎中国` | 开始中国模拟 |
| `toutai.投胎世界` | 开始世界模拟 |
| `toutai.中国投胎记录` / `toutai.世界投胎记录` | 查看记录 |
| `toutai.中国投胎排行榜` / `toutai.世界投胎排行榜` | 查看排行 |

## 限制 / 风险

需要 `database` 服务保存记录，以及 `puppeteer` 服务渲染投胎结果地图。地图图片默认随投胎结果发送（`isMapImageIncludedAfterRebirth`）。

## 必要链接

- GitHub 仓库：https://github.com/araea/koishi-plugin-toutai
- npm 包：https://www.npmjs.com/package/koishi-plugin-toutai
