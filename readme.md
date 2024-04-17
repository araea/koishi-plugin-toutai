# 🚀 koishi-plugin-toutai

[![npm](https://img.shields.io/npm/v/koishi-plugin-toutai?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-toutai)

## 🎐 简介

模拟投胎到中国或世界各地，支持QQ官方MD模板、图片化输出、全数据统计以及排行榜系统等。

## 🎉 安装

您可通过 `Koishi` 插件市场搜索并安装该插件。

## 🌈 使用

1. 启动 `Puppeteer` 服务，以便生成图片。
2. 建议在 `指令管理` 中为该插件添加自定义别名。

## ⚙️ 配置项

- `imageType`: 发送的图片类型。
- `defaultMaxDisplayCount`: 排行榜默认显示的人数。
- `isMapImageIncludedAfterRebirth`: 是否在投胎后包含地图图片。
- `nextReincarnationCooldownSeconds`: 投胎的冷却时间，单位是秒。
- `shouldPrefixUsernameInMessageSending`: 是否在发送消息时加上 @用户名。
- `retractDelay`: 自动撤回等待的时间，单位是秒。值为 0 时不启用自动撤回功能。
- `isTextToImageConversionEnabled`: 是否开启将文本转为图片的功能（可选），如需启用，需要启用 \`markdownToImage\` 服务。
- `isEnableQQOfficialRobotMarkdownTemplate`: 是否启用 QQ 官方机器人的 Markdown 模板，带消息按钮。
  - `customTemplateId`：自定义模板 ID。
  - `key`：文本内容中特定插值的 key。
  - `numberOfMessageButtonsPerRow`：每行消息按钮的数量。

## 🌼 指令

- `toutai`: 显示投胎模拟器帮助。
- `toutai.投胎中国`: 模拟投胎到中国。
- `toutai.投胎世界`: 模拟投胎到世界各地。
- `toutai.中国投胎记录.总览/成功历史/地区分布/性别分布/第一次出现`: 查看中国投胎记录。
- `toutai.世界投胎记录.总览/成功历史/夭折历史`: 查看世界投胎记录。
- `toutai.中国投胎排行榜.成功次数/夭折次数/男孩次数/女孩次数`: 查看中国投胎排行榜。
- `toutai.世界投胎排行榜.成功次数/夭折次数/亚洲/欧洲/非洲/北美洲/南美洲/南极洲/大洋洲`: 查看世界投胎排行榜。
- `toutai.改名`: 更改玩家名字。

## 🌸 测试图（部分功能）
<details>
<summary>点击这里展开/折叠内容</summary>

### 投胎中国
![db0f4138bfd833c11fdd32f49ad98b32](https://github.com/araea/koishi-plugin-toutai/assets/120614554/d0d00886-cfb6-405c-87e0-b759053d0079)
### 投胎世界
![cfef361e06a5a296f0d8bb5ecc5b6dd4](https://github.com/araea/koishi-plugin-toutai/assets/120614554/f6af7b92-237e-4a14-a80b-3f2e9efe6b76)
### 性别分布
![46ea7c879a8fa3501e8fc9e4cb817fac](https://github.com/araea/koishi-plugin-toutai/assets/120614554/eace5521-f498-4e58-b4ef-01583b1c076b)
### 地区分布
![20bd046909b1e36ed9f0a837f5ed4e43](https://github.com/araea/koishi-plugin-toutai/assets/120614554/cef83aee-c322-473c-a5fd-574668cb9383)
### ...
</details>

## 🍧 致谢

* [ilHarp](https://forum.koishi.xyz/u/ilharp/summary) - ilHarp 赛高！
* [Koishi](https://koishi.chat/) - 强大的机器人框架
* [求插件](https://forum.koishi.xyz/t/topic/7415) - 插件由来 ~~动力源泉~~
* [中国投胎模拟器](https://toutai.cc/) - 中国投胎模拟器
* [世界投胎模拟器](https://uahh.site/reborn) - 世界投胎模拟器

## ✨ License

MIT License © 2024
