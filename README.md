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

## 许可证

可按 [Apache-2.0](LICENSE-APACHE) 或 [MIT](LICENSE-MIT) 使用。

## 显示与交互

发送 `toutai.显示 文字` 或 `toutai.显示 图文` 切换个人显示偏好。同一机器人中的配套插件共享选择，重启后恢复图文。图文模式中的信息图片附带文字说明；作品素材与感官测试的适用边界见 [设计系统](./DESIGN_SYSTEM.md)。

本次更新：图片附带文字结果与完整请求范围的排行榜；文字模式跳过地图，并保留已发文字消息。
