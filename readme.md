# koishi-plugin-toutai

投胎模拟器插件。

## 安装

~~~sh
yarn add koishi-plugin-toutai
~~~

在 Koishi 配置中启用 koishi-plugin-toutai，并提供 puppeteer 和 database 服务。

## 指令

| 指令 | 说明 |
| --- | --- |
| toutai | 查看帮助 |
| toutai.投胎中国 | 开始中国模拟 |
| toutai.投胎世界 | 开始世界模拟 |
| toutai.中国投胎记录 / toutai.世界投胎记录 | 查看记录 |
| toutai.中国投胎排行榜 / toutai.世界投胎排行榜 | 查看排行 |

使用前可为指令设置别名。

## 许可证

可按 [Apache-2.0](LICENSE-APACHE) 或 [MIT](LICENSE-MIT) 使用。
