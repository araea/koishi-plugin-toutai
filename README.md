# 投胎模拟器

Koishi 插件：随机投胎模拟，模拟降生中国与世界的各项人生结果，并查看记录与排行榜

[![GitHub](https://img.shields.io/badge/GitHub-araea%2Fkoishi--plugin--toutai-181717?logo=github&logoColor=white)](https://github.com/araea/koishi-plugin-toutai)
[![npm](https://img.shields.io/npm/v/koishi-plugin-toutai?logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/koishi-plugin-toutai)

## 安装

```sh
npm i koishi-plugin-toutai
```

启用插件，并安装 `database` 与 `puppeteer` 服务。

## 快速使用

发送 `toutai.投胎中国` 或 `toutai.投胎世界` 开始模拟。两次投胎之间有冷却时间，由 `nextReincarnationCooldownSeconds` 调整。

| 指令 | 说明 |
| --- | --- |
| `toutai` | 查看指令列表 |
| `toutai.投胎中国` | 开始中国模拟 |
| `toutai.投胎世界` | 开始世界模拟 |
| `toutai.中国投胎记录` / `toutai.世界投胎记录` | 查看记录 |
| `toutai.中国投胎排行榜` / `toutai.世界投胎排行榜` | 查看排行 |

## 配置

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `defaultMaxDisplayCount` | number | `20` | 排行榜默认显示的人数，0 表示全部（仍受上限约束） |
| `maxDisplayCount` | number | `100` | 排行榜最多显示的人数，指令后的数字超过按它出图；0 表示不设上限 |
| `nextReincarnationCooldownSeconds` | number | `60` | 两次投胎之间的冷却时间（秒） |
| `shouldPrefixUsernameInMessageSending` | boolean | `true` | 回复时 @ 用户 |
| `retractDelay` | number | `0` | 上一条消息的自动撤回延迟（秒），0 表示不撤回；同一频道只保留最新一条 |
| `isMapImageIncludedAfterRebirth` | boolean | `true` | 投胎后附上一张地图 |
| `imageType` | `png` / `jpeg` / `webp` | `png` | 发送的图片格式 |

## 限制 / 风险

需要 `database` 服务保存记录，以及 `puppeteer` 服务渲染投胎结果地图。

## 链接

- [设计系统](DESIGN_SYSTEM.md)
- [MIT](LICENSE-MIT) / [Apache-2.0](LICENSE-APACHE)
