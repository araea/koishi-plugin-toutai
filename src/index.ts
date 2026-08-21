import { Context, h, RuntimeError, Schema } from "koishi";
import {} from "koishi-plugin-markdown-to-image-service";
import {} from "koishi-plugin-puppeteer";
import * as path from "path";
import * as fs from "fs";

export let name = "toutai";
export const inject = {
  required: ["database", "puppeteer"],
  optional: ["markdownToImage"],
};
export const usage = `一念既起，山河万里。

## 使用

1. 启动 \`puppeteer\` 服务。
2. 设置指令别名。

> 记录与榜单的图片以「轮回簿」版式绘制：宣纸底、朱印题头、
> 青属男 · 绛属女 · 松绿为生 · 朱砂为殁。
> 落点地图需要联网加载 ECharts。

## QQ 群

- 956758505`;

export interface Config {
  defaultMaxDisplayCount: number;
  nextReincarnationCooldownSeconds: number;

  shouldPrefixUsernameInMessageSending: boolean;
  retractDelay: number;
  isMapImageIncludedAfterRebirth: boolean;
  imageType: "png" | "jpeg" | "webp";
  isTextToImageConversionEnabled: boolean;
  isEnableQQOfficialRobotMarkdownTemplate: boolean;

  customTemplateId: string;
  key: string;
  numberOfMessageButtonsPerRow: number;
  isUsingUnifiedKoishiBuiltInUsername: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    defaultMaxDisplayCount: Schema.number()
      .min(0)
      .default(20)
      .description("排行榜默认显示的人数。"),
    nextReincarnationCooldownSeconds: Schema.number()
      .min(0)
      .default(60)
      .description(`投胎的冷却时间，单位是秒。`),
    shouldPrefixUsernameInMessageSending: Schema.boolean()
      .default(true)
      .description(`是否在发送消息时加上 @用户名。`),
    retractDelay: Schema.number()
      .min(0)
      .default(0)
      .description(
        `自动撤回等待的时间，单位是秒。值为 0 时不启用自动撤回功能。`,
      ),
    isMapImageIncludedAfterRebirth: Schema.boolean()
      .default(true)
      .description(`是否在投胎后包含地图图片。`),
    imageType: Schema.union(["png", "jpeg", "webp"])
      .default("png")
      .description(`发送的图片类型。`),
    isTextToImageConversionEnabled: Schema.boolean()
      .default(false)
      .description(
        `是否开启将文本转为图片的功能（可选），如需启用，需要启用 \`markdownToImage\` 服务。`,
      ),
    isEnableQQOfficialRobotMarkdownTemplate: Schema.boolean()
      .default(false)
      .description(`是否启用 QQ 官方机器人的 Markdown 模板，带消息按钮。`),
  }),
  Schema.union([
    Schema.object({
      isEnableQQOfficialRobotMarkdownTemplate: Schema.const(true).required(),
      customTemplateId: Schema.string()
        .default("")
        .description(`自定义模板 ID。`),
      key: Schema.string()
        .default("")
        .description(
          `文本内容中特定插值的 key，用于存放文本。如果你的插值为 {{.info}}，那么请在这里填 info。`,
        ),
      numberOfMessageButtonsPerRow: Schema.number()
        .min(2)
        .max(5)
        .default(2)
        .description(`每行消息按钮的数量。`),
      isUsingUnifiedKoishiBuiltInUsername: Schema.boolean()
        .default(true)
        .description(`是否使用统一的 Koishi 内置用户名。`),
    }),
    Schema.object({}),
  ]),
]) as any;

declare module "koishi" {
  interface Tables {
    toutai_records: ToutaiRecord;
  }
}

export interface ToutaiRecord {
  id: number;
  userId: string;
  username: string;
  timestamp: string;
  numberOfStillbirthsInChina: number;
  numberOfStillbirthsInWorld: number;
  birthResultsInChina: BirthResultInChina[];
  birthResultsInWorld: BirthResultInWorld[];
  unfortunateDemiseRecordsInWorld: UnfortunateDemiseRecordInWorld[];
}

interface BirthResultInWorld {
  index?: number;
  dictName: string;
  dictContinent: string;
  center: [number, number];
  coordinate: [number, number];
}

interface BirthResultInChina {
  id: number;
  order: string;
  index?: number;
  gender: string;
  category: string;
  province: string;
  probability: number;
}

interface UnfortunateDemiseRecordInWorld {
  index?: number;
  dictName: string;
  dictContinent: string;
}

interface Geometry {
  type: string;
  coordinates: number[][][];
}

interface Properties {
  name: string;
  cp: number[];
  childNum: number;
}

interface ChinaFeatures {
  type: string;
  id: string;
  properties: Properties;
  geometry: Geometry;
}

interface China {
  type: string;
  features: ChinaFeatures[];
}

interface BirthrateDetailedData {
  id: number;
  name: string;
  displayName: string;
  town: { [key: string]: { male: number; female: number } };
  city: { [key: string]: { male: number; female: number } };
  countryside: { [key: string]: { male: number; female: number } };
}

interface Region {
  id: string;
  name: string;
  total: number;
  male: number;
  female: number;
}

interface Country {
  code?: string;
  nameEn: string;
  nameCn: string;
  population: number;
  birthRate: number;
  position: [number, number];
  continent: string;
}

interface CountryData {
  [countryCode: string]: Country;
}

interface WorldBirthrateData {
  country: string;
  name: string;
  population: number;
  birthRate: number;
  birthRatePercentage: number;
}

interface NeonatalMortalityRateData {
  [key: string]: number;
}

/* ------------------------------------------------------------------ *
 *  视觉设计系统 ——《轮回簿》
 *
 *  所有图片共用一套「宣纸 · 墨色 · 朱砂」的版面语言：
 *  暖白纸面、金线内框、四角回纹、朱印题头、editorial 式的横线分栏。
 *  颜色语义固定：青蓝属男、绛红属女、松绿为生、朱砂为殁、赤金为序。
 * ------------------------------------------------------------------ */

// 画布宽度（含 body 内边距），截图裁剪与视口共用此值。
const CARD_WIDTH = 820;

type Tone = "azure" | "rose" | "jade" | "cinnabar" | "gold" | "ink";

// 地图（Canvas 绘制）无法读取 CSS 变量，故单列一份同源色值。
const CINNABAR = "#A6362C";
const HEAT_LOW = "#F1E5D0";
const HEAT_HIGH = "#C2703F";
const MAP_FONT =
  '"Noto Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const ECHARTS_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js";

/** 足迹热度色：0 → 浅茶，1 → 赭红，低值稍作提亮以免难以辨认。 */
function heatColor(ratio: number): string {
  const t = Math.pow(Math.max(0, Math.min(1, ratio)), 0.6);
  const from = [241, 229, 208];
  const to = [194, 112, 63];
  const channel = (i: number) => Math.round(from[i] + (to[i] - from[i]) * t);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }

:root {
    --paper: #F4EFE4;
    --card: #FFFDF8;
    --ink: #221E19;
    --ink-2: #514840;
    --ink-3: #8B8074;
    --line: #E2D9C6;
    --line-soft: #EFE8DA;
    --gold: #B08D4F;
    --cinnabar: #A6362C;
    --font-serif: "Noto Serif SC", "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", serif;
    --font-sans: "Noto Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif;
}

.t-azure    { --tone: #3E6C93; --tone-soft: rgba(62, 108, 147, .13); }
.t-rose     { --tone: #BC5A62; --tone-soft: rgba(188, 90, 98, .13); }
.t-jade     { --tone: #4F7F63; --tone-soft: rgba(79, 127, 99, .13); }
.t-cinnabar { --tone: #A6362C; --tone-soft: rgba(166, 54, 44, .13); }
.t-gold     { --tone: #B08D4F; --tone-soft: rgba(176, 141, 79, .16); }
.t-ink      { --tone: #514840; --tone-soft: rgba(81, 72, 64, .10); }

html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }

body {
    margin: 0;
    padding: 26px 22px 30px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    color: var(--ink);
    font-family: var(--font-sans);
    background-color: var(--paper);
    /* 纸纹：两层柔光 + 极淡的经纬纤维 */
    background-image:
        radial-gradient(120% 90% at 10% 0%, rgba(255, 253, 246, .96) 0%, rgba(244, 239, 228, 0) 58%),
        radial-gradient(100% 80% at 100% 100%, rgba(176, 141, 79, .12) 0%, rgba(244, 239, 228, 0) 55%),
        repeating-linear-gradient(90deg, rgba(34, 30, 25, .020) 0 1px, rgba(34, 30, 25, 0) 1px 4px),
        repeating-linear-gradient(0deg, rgba(34, 30, 25, .016) 0 1px, rgba(34, 30, 25, 0) 1px 5px);
}

/* ---------- 纸张 ---------- */
.sheet {
    position: relative;
    width: 100%;
    max-width: ${CARD_WIDTH - 44}px;
    padding: 34px 36px 24px;
    background: var(--card);
    border: 1px solid var(--line);
    box-shadow:
        0 0 0 1px rgba(255, 255, 255, .8) inset,
        0 24px 46px -32px rgba(34, 30, 25, .55);
}

.sheet::before {
    content: "";
    position: absolute;
    inset: 7px;
    border: 1px solid rgba(176, 141, 79, .30);
    pointer-events: none;
}

.corner {
    position: absolute;
    width: 15px;
    height: 15px;
    border: 1.5px solid var(--gold);
    opacity: .55;
}

.corner.tl { top: 12px;    left: 12px;  border-right: 0; border-bottom: 0; }
.corner.tr { top: 12px;    right: 12px; border-left: 0;  border-bottom: 0; }
.corner.bl { bottom: 12px; left: 12px;  border-right: 0; border-top: 0; }
.corner.br { bottom: 12px; right: 12px; border-left: 0;  border-top: 0; }

/* ---------- 题头 ---------- */
.masthead { position: relative; margin-bottom: 22px; padding-right: 84px; }

.eyebrow {
    margin: 0 0 9px;
    font-size: 12px;
    letter-spacing: .52em;
    text-indent: .52em;
    color: var(--ink-3);
}

.title {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 31px;
    font-weight: 700;
    line-height: 1.28;
    letter-spacing: .05em;
    color: var(--ink);
}

.subtitle {
    margin: 10px 0 0;
    font-size: 14.5px;
    letter-spacing: .04em;
    color: var(--ink-2);
}

.subtitle .sep { margin: 0 9px; color: var(--gold); }

.divider { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.divider i { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--line) 10%, var(--line) 90%, transparent); }
.divider b { font-size: 10px; font-weight: 400; color: var(--gold); }

/* ---------- 朱印 ---------- */
.seal {
    position: absolute;
    top: 2px;
    right: 0;
    display: grid;
    grid-auto-flow: column;
    direction: rtl;
    width: 62px;
    height: 62px;
    border: 2px solid var(--cinnabar);
    border-radius: 4px;
    transform: rotate(-4deg);
    color: var(--cinnabar);
    font-family: var(--font-serif);
    font-weight: 700;
    opacity: .88;
    box-shadow: 0 0 0 3px rgba(166, 54, 44, .06);
}

.seal.four { grid-template-rows: 1fr 1fr; font-size: 19px; }
.seal.two  { grid-template-rows: 1fr 1fr; grid-auto-flow: row; font-size: 24px; }
.seal span { display: flex; align-items: center; justify-content: center; }

/* ---------- 分栏 ---------- */
.section { margin-top: 26px; }
.section:first-child { margin-top: 0; }

.sec-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
.sec-hd .mark { width: 3px; height: 15px; background: var(--cinnabar); }
.sec-hd h2 { margin: 0; font-family: var(--font-serif); font-size: 16px; font-weight: 700; letter-spacing: .16em; color: var(--ink); }
.sec-hd .fill { flex: 1; height: 1px; background: repeating-linear-gradient(90deg, var(--line) 0 3px, transparent 3px 7px); }
.sec-hd .aside { font-size: 12px; letter-spacing: .1em; color: var(--ink-3); }

/* ---------- 数据卡 ---------- */
.grid { display: grid; gap: 12px; }
.grid.c2 { grid-template-columns: repeat(2, 1fr); }
.grid.c3 { grid-template-columns: repeat(3, 1fr); }
.grid.c4 { grid-template-columns: repeat(4, 1fr); }
.grid.c5 { grid-template-columns: repeat(5, 1fr); }

.stat {
    position: relative;
    overflow: hidden;
    padding: 13px 15px 12px;
    background: linear-gradient(180deg, #FFFDF8 0%, #FAF5EA 100%);
    border: 1px solid var(--line-soft);
}

.stat::before {
    content: "";
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 2px;
    background: var(--tone, var(--gold));
    opacity: .8;
}

.stat .k { display: block; font-size: 12.5px; letter-spacing: .18em; color: var(--ink-3); }

.stat .v {
    display: flex;
    align-items: baseline;
    gap: 5px;
    margin-top: 6px;
    font-family: var(--font-serif);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: .02em;
    color: var(--tone, var(--ink));
    font-variant-numeric: tabular-nums;
}

.stat .v small { font-family: var(--font-sans); font-size: 12.5px; font-weight: 400; color: var(--ink-3); }
.stat .note { margin-top: 5px; font-size: 12px; letter-spacing: .06em; color: var(--ink-3); }
.stat.hero { padding: 16px 18px 15px; }
.stat.hero .v { font-size: 33px; }

.meter { margin-top: 9px; height: 3px; background: rgba(34, 30, 25, .07); }
.meter i { display: block; height: 100%; background: var(--tone, var(--gold)); opacity: .85; }

/* ---------- 帐册（表格） ---------- */
table.ledger {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
}

.ledger thead th {
    padding: 9px 10px;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: .16em;
    color: var(--ink-3);
    text-align: center;
    border-top: 2px solid var(--ink);
    border-bottom: 1px solid var(--line);
}

.ledger tbody td {
    padding: 10px;
    font-size: 15.5px;
    color: var(--ink-2);
    text-align: center;
    border-bottom: 1px solid var(--line-soft);
}

.ledger tbody tr:nth-child(even) { background: rgba(176, 141, 79, .05); }
.ledger tbody tr:last-child td { border-bottom: 1px solid var(--ink); }
.ledger td.idx { font-family: var(--font-serif); font-size: 15px; color: var(--ink-3); }
.ledger thead th.l { text-align: left; padding-left: 18px; }
.ledger td.name { text-align: left; padding-left: 18px; font-size: 16px; letter-spacing: .03em; color: var(--ink); }
.ledger td.num { font-family: var(--font-serif); font-size: 17px; font-weight: 700; color: var(--ink); }
.ledger td.num small { font-family: var(--font-sans); font-size: 12px; font-weight: 400; color: var(--ink-3); margin-left: 3px; }
.ledger tr.self td { background: rgba(176, 141, 79, .13); }

/* ---------- 标签 ---------- */
.chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--tone, var(--ink-2));
    background: var(--tone-soft, rgba(81, 72, 64, .10));
}

.chip .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.chip.ghost { background: transparent; color: var(--ink-3); }

/* ---------- 名次 ---------- */
.medal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 25px;
    height: 25px;
    border-radius: 50%;
    font-family: var(--font-serif);
    font-size: 13px;
    font-weight: 700;
    color: #FFFDF8;
}

.medal.m1 { background: linear-gradient(150deg, #E4C264, #AF8B4A); }
.medal.m2 { background: linear-gradient(150deg, #D2D2CD, #9DA0A0); }
.medal.m3 { background: linear-gradient(150deg, #D5A47D, #A8744A); }

/* ---------- 条形榜 ---------- */
.bars { margin-top: 2px; }

.bar-row {
    display: grid;
    grid-template-columns: 24px 84px 1fr 104px;
    align-items: center;
    gap: 12px;
    padding: 7px 0;
    border-bottom: 1px solid var(--line-soft);
}

.bar-row:last-child { border-bottom: 0; }
.bar-row .no { font-family: var(--font-serif); font-size: 13px; color: var(--ink-3); text-align: right; }
.bar-row .rname { font-size: 15.5px; letter-spacing: .05em; color: var(--ink); text-align: right; }
.bar-row .track { position: relative; height: 13px; background: rgba(34, 30, 25, .06); }
.bar-row .track i { position: absolute; left: 0; top: 0; bottom: 0; min-width: 2px; background: linear-gradient(90deg, var(--tone-soft), var(--tone)); }
.bar-row .val { font-size: 14.5px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.bar-row .val em { margin-left: 7px; font-style: normal; font-size: 12.5px; color: var(--ink-3); }

/* ---------- 版记 ---------- */
.colophon {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 24px;
    padding-top: 11px;
    border-top: 1px solid var(--line);
    font-size: 11.5px;
    letter-spacing: .16em;
    color: var(--ink-3);
}

.colophon .r { letter-spacing: .06em; }
`;

/** 用户可控文本一律转为全角，避免破坏版面（h.unescape 之后仍然安全）。 */
function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[<>&"']/g,
    (c) => ({ "<": "＜", ">": "＞", "&": "＆", '"': "＂", "'": "＇" })[c],
  );
}

/** 朱印：四字作两列两行（自右向左），二字作一列。 */
function sealMarkup(text?: string): string {
  if (!text) return "";
  const chars = [...text];
  const shape = chars.length >= 4 ? "four" : "two";
  return `<div class="seal ${shape}">${chars
    .slice(0, 4)
    .map((c) => `<span>${c}</span>`)
    .join("")}</div>`;
}

interface PageOptions {
  docTitle: string;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  seal?: string;
  body: string;
  colophonLeft?: string;
  colophonRight?: string;
  style?: string;
  head?: string;
  script?: string;
}

/** 统一的页面骨架：纸张、内框、四角、题头、版记。 */
function buildPage(o: PageOptions): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${o.docTitle}</title>
<style>${BASE_CSS}${o.style ?? ""}</style>
${o.head ?? ""}
</head>
<body>
<div class="sheet">
    <span class="corner tl"></span><span class="corner tr"></span>
    <span class="corner bl"></span><span class="corner br"></span>
    <header class="masthead">
        ${sealMarkup(o.seal)}
        <p class="eyebrow">${o.eyebrow ?? "投 胎 模 拟 器"}</p>
        <h1 class="title">${o.title}</h1>
        ${o.subtitle ? `<p class="subtitle">${o.subtitle}</p>` : ""}
        <div class="divider"><i></i><b>❖</b><i></i></div>
    </header>
    ${o.body}
    <footer class="colophon">
        <span>${o.colophonLeft ?? "轮 回 簿"}</span>
        <span class="r">${o.colophonRight ?? ""}</span>
    </footer>
</div>
${o.script ?? ""}
</body>
</html>`;
}

/** 分栏标题。 */
function section(title: string, body: string, aside = ""): string {
  return `<section class="section">
    <div class="sec-hd">
        <span class="mark"></span>
        <h2>${title}</h2>
        <span class="fill"></span>
        ${aside ? `<span class="aside">${aside}</span>` : ""}
    </div>
    ${body}
</section>`;
}

interface StatOptions {
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  tone?: Tone;
  ratio?: number;
  hero?: boolean;
}

/** 数据卡：标签、数值、注脚，可选底部比例细线。 */
function statCard(o: StatOptions): string {
  const meter =
    o.ratio === undefined
      ? ""
      : `<div class="meter"><i style="width: ${clampPercent(o.ratio)}%"></i></div>`;
  return `<div class="stat t-${o.tone ?? "ink"}${o.hero ? " hero" : ""}">
    <span class="k">${o.label}</span>
    <span class="v">${o.value}${o.unit ? `<small>${o.unit}</small>` : ""}</span>
    ${o.note ? `<div class="note">${o.note}</div>` : ""}
    ${meter}
</div>`;
}

function chip(text: string, tone: Tone = "ink", withDot = false): string {
  return `<span class="chip t-${tone}">${withDot ? `<i class="dot"></i>` : ""}${text}</span>`;
}

function clampPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "0";
  return (Math.min(1, ratio) * 100).toFixed(2);
}

/** 百分比文本，保留一位小数且去掉多余的 .0。 */
function percentText(count: number, total: number): string {
  if (!total) return "0%";
  const value = (count / total) * 100;
  const text = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${text.replace(/\.0$/, "")}%`;
}

/* ------------------------------------------------------------------ *
 *  文本消息
 *
 *  统一版式：首行为「符号 + 事由」，随后以全角空格缩进的「标签　内容」，
 *  末行落一句短语。祝祷与哀辞各备数则，随机取用，免得次次雷同。
 * ------------------------------------------------------------------ */

const BLESSINGS = [
  "愿你此生，长安顺遂。",
  "愿你所往之处，皆有暖灯。",
  "山高水远，愿有归处。",
  "这一趟人间，好好去过。",
  "愿你被这世界温柔以待。",
];

const LAMENTS = [
  "魂灯未燃，已随风散。",
  "尚未睁眼，人间已远。",
  "来路太短，未及道别。",
  "命簿之上，添了一笔空白。",
];

function pickOne(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

/** 「标签　内容」——标签统一两字，字间加全角空格以对齐。 */
function entry(label: string, value: string): string {
  return `　${[...label].join("　")}　${value}`;
}

/** 文本转图片时的排版：首行作大字标题，其余作小字正文。 */
function toMarkdownLines(lines: string[], prefix?: string): string {
  let hasTitle = false;
  const body = lines.map((line) => {
    if (line.trim() === "" || line.includes("<img")) return line + "\n";
    if (hasTitle) return `### ${line}`;
    hasTitle = true;
    return `# ${line}`;
  });
  return (prefix ? [`### ${prefix}`, ...body] : body).join("\n");
}

function medal(rank: number): string {
  if (rank <= 3) return `<span class="medal m${rank}">${rank}</span>`;
  return String(rank);
}

/** 名次序数：金银铜之后用「第 N」朴素表达。 */
function rankText(rank: number): string {
  return rank > 0 ? `第 ${rank} 位` : "未上榜";
}

/* ------------------------------------------------------------------ *
 *  版面渲染
 *
 *  以下函数只负责「把数据排成版」，不碰浏览器、不碰数据库，
 *  截图交给 apply 内的 capture()。
 * ------------------------------------------------------------------ */

function translateGender(gender: string): string {
  switch (gender) {
    case "male":
      return "男";
    case "female":
      return "女";
    default:
      return gender;
  }
}

function translateGenderChild(gender: string): string {
  switch (gender) {
    case "male":
      return "男孩";
    case "female":
      return "女孩";
    default:
      return gender;
  }
}

/** 胎次的口语说法：「第三孩」「五孩及以上」。 */
function orderText(order: string): string {
  return order === "五及以上" ? "五孩及以上" : `第${order}孩`;
}

function trimUsername(username: string): string {
  const maxLength = 10;

  if (username.length <= maxLength) {
    return username;
  } else {
    return username.slice(0, maxLength) + "…";
  }
}

/** 性别分布：手绘 SVG 环图，不依赖任何外部图表库。 */
function renderGenderDistribution(
  username: string,
  birthResultsInChina: BirthResultInChina[],
): string {
  const total = birthResultsInChina.length;
  const male = birthResultsInChina.filter((r) => r.gender === "male").length;
  const female = total - male;

  const circumference = 2 * Math.PI * 62;
  const maleArc = total ? (male / total) * circumference : 0;
  const ratio = female ? (male / female).toFixed(2) : "—";

  const body = `
<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 160 160" width="228" height="228">
        <circle cx="80" cy="80" r="74" fill="none" stroke="rgba(176,141,79,.35)" stroke-width="1"></circle>
        <circle cx="80" cy="80" r="62" fill="none" stroke="rgba(34,30,25,.07)" stroke-width="19"></circle>
        <g transform="rotate(-90 80 80)">
            <circle cx="80" cy="80" r="62" fill="none" stroke="#3E6C93" stroke-width="19"
                    stroke-dasharray="${maleArc.toFixed(2)} ${(circumference - maleArc).toFixed(2)}"></circle>
            <circle cx="80" cy="80" r="62" fill="none" stroke="#BC5A62" stroke-width="19"
                    stroke-dasharray="${(circumference - maleArc).toFixed(2)} ${maleArc.toFixed(2)}"
                    stroke-dashoffset="${(-maleArc).toFixed(2)}"></circle>
        </g>
        <text class="donut-num" x="80" y="80" text-anchor="middle">${total}</text>
        <text class="donut-cap" x="80" y="100" text-anchor="middle">次 降 生</text>
    </svg>
    <div class="donut-side">
        ${statCard({
          label: "男 孩",
          value: male,
          unit: "次",
          tone: "azure",
          note: `占 ${percentText(male, total)}`,
          ratio: total ? male / total : 0,
        })}
        ${statCard({
          label: "女 孩",
          value: female,
          unit: "次",
          tone: "rose",
          note: `占 ${percentText(female, total)}`,
          ratio: total ? female / total : 0,
        })}
        <div class="ratio-note">性别比　男 <b>${ratio}</b> ： 女 <b>1.00</b></div>
    </div>
</div>`;

  return buildPage({
    docTitle: "中国投胎性别分布",
    title: "中国投胎 · 性别分布",
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>阴阳各半，皆是缘法`,
    seal: "阴阳",
    body: section("男 女 之 数", body, `合计 ${total} 次`),
    colophonRight: `男 ${male} · 女 ${female}`,
    style: `
.donut-wrap { display: flex; align-items: center; gap: 34px; }
.donut { flex: none; }
.donut-num { font-family: var(--font-serif); font-size: 38px; font-weight: 700; fill: var(--ink); }
.donut-cap { font-family: var(--font-sans); font-size: 10px; letter-spacing: .3em; fill: var(--ink-3); }
.donut-side { flex: 1; display: flex; flex-direction: column; gap: 12px; }
.ratio-note { padding-top: 2px; font-size: 13px; letter-spacing: .1em; color: var(--ink-3); text-align: center; }
.ratio-note b { font-family: var(--font-serif); font-size: 16px; color: var(--ink-2); }
`,
  });
}

/** 排行榜：名次、玩家、条形长短与次数。 */
function renderRankings(
  toutaiRecords: ToutaiRecord[],
  maxLeaderboardDisplayCount: number,
  options: {
    title: string;
    seal: string;
    valueLabel: string;
    tone: Tone;
    pick: (record: ToutaiRecord) => number;
    selfUserId: string;
  },
): string {
  const scored = toutaiRecords
    .map((record) => ({
      userId: record.userId,
      username: record.username,
      value: options.pick(record),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const rows = scored.slice(0, maxLeaderboardDisplayCount);
  const top = rows[0]?.value ?? 1;
  const selfRank =
    scored.findIndex((row) => row.userId === options.selfUserId) + 1;

  const list = rows
    .map((row, index) => {
      const isSelf = row.userId === options.selfUserId;
      return `<div class="bar-row rank t-${index < 3 ? "gold" : options.tone}${isSelf ? " me" : ""}">
    <span class="no">${medal(index + 1)}</span>
    <span class="rname">${esc(trimUsername(row.username))}${isSelf ? `<i class="me-tag">你</i>` : ""}</span>
    <span class="track"><i style="width: ${clampPercent(row.value / top)}%"></i></span>
    <span class="val">${row.value}<em>${options.valueLabel}</em></span>
</div>`;
    })
    .join("");

  return buildPage({
    docTitle: options.title,
    title: options.title,
    subtitle: `列位共 ${scored.length} 人<span class="sep">❖</span>${
      selfRank > 0 ? `阁下位居第 ${selfRank}` : "阁下尚未上榜"
    }`,
    seal: options.seal,
    body: section(
      "名 次 录",
      `<div class="bars">${
        rows.length
          ? list
          : `<div class="empty">榜上无名 —— 尚无人在此留下痕迹。</div>`
      }</div>`,
      rows.length ? `前 ${rows.length} 位` : "",
    ),
    colophonRight: rows.length
      ? `榜首 ${esc(trimUsername(rows[0].username))} · ${rows[0].value} ${options.valueLabel}`
      : "虚位以待",
    style: `
.bar-row.rank { grid-template-columns: 28px 1fr 190px 96px; }
.bar-row.rank .rname { text-align: left; font-size: 16px; }
.bar-row.rank .val { text-align: right; font-family: var(--font-serif); font-size: 17px; font-weight: 700; color: var(--ink); }
.bar-row.rank .val em { font-family: var(--font-sans); font-weight: 400; }
.bar-row.me { background: linear-gradient(90deg, rgba(176, 141, 79, .16), rgba(176, 141, 79, 0)); }
.me-tag {
    display: inline-block;
    margin-left: 8px;
    padding: 1px 7px;
    border: 1px solid rgba(166, 54, 44, .45);
    border-radius: 2px;
    font-size: 11px;
    font-style: normal;
    letter-spacing: .1em;
    color: var(--cinnabar);
}
.empty { padding: 26px 0; text-align: center; font-size: 15px; letter-spacing: .1em; color: var(--ink-3); }
`,
  });
}

/** 地区分布：省份条形榜。 */
function renderRegionDistribution(
  username: string,
  birthResultsInChina: BirthResultInChina[],
): string {
  const total = birthResultsInChina.length;
  const counts: { [province: string]: number } = {};
  for (const result of birthResultsInChina) {
    counts[result.province] = (counts[result.province] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[1] ?? 1;

  const bars = sorted
    .map(
      ([province, count], index) => `<div class="bar-row t-${count === top ? "cinnabar" : "azure"}">
    <span class="no">${index + 1}</span>
    <span class="rname">${province}</span>
    <span class="track"><i style="width: ${clampPercent(count / top)}%"></i></span>
    <span class="val">${count} 次<em>${percentText(count, total)}</em></span>
</div>`,
    )
    .join("");

  return buildPage({
    docTitle: "中国投胎地区分布",
    title: "中国投胎 · 地区分布",
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>足迹遍及 ${sorted.length} 省`,
    seal: "山河",
    body: section(
      "省 份 之 分",
      `<div class="bars">${bars}</div>`,
      `共 ${total} 次 · 最常降生于 ${sorted[0]?.[0] ?? "—"}`,
    ),
    colophonRight: `${sorted.length} 省 · ${total} 次`,
  });
}

/** 世界投胎夭折历史。 */
function renderWorldDemiseHistory(
  username: string,
  unfortunateDemiseRecordsInWorld: UnfortunateDemiseRecordInWorld[],
): string {
  const rows = unfortunateDemiseRecordsInWorld
    .map(
      (record) => `<tr>
    <td class="idx">${record.index}</td>
    <td>${chip(record.dictContinent, "ink")}</td>
    <td class="name">${record.dictName}</td>
</tr>`,
    )
    .join("");

  return buildPage({
    docTitle: "世界投胎夭折历史",
    title: "世界投胎 · 夭折历史",
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>未及睁眼，已别人间`,
    seal: "长夜",
    body: section(
      "殁 者 名 录",
      `<table class="ledger mourning">
    <thead><tr><th width="22%">次 第</th><th width="34%">大 洲</th><th class="l" width="44%">国 度</th></tr></thead>
    <tbody>${rows}</tbody>
</table>`,
      `近 ${unfortunateDemiseRecordsInWorld.length} 笔`,
    ),
    colophonLeft: "轮 回 簿 · 殁",
    colophonRight: "愿来世安稳",
    style: `
.ledger.mourning thead th { border-top-color: var(--cinnabar); }
.ledger.mourning td.name { color: var(--ink-2); }
`,
  });
}

/** 世界投胎成功历史。 */
function renderWorldBirthHistory(
  username: string,
  birthResultsInWorld: BirthResultInWorld[],
): string {
  const rows = birthResultsInWorld
    .map(
      (record) => `<tr>
    <td class="idx">${record.index}</td>
    <td>${chip(record.dictContinent, "jade")}</td>
    <td class="name">${record.dictName}</td>
</tr>`,
    )
    .join("");

  return buildPage({
    docTitle: "世界投胎成功历史",
    title: "世界投胎 · 降生纪年",
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>山南水北，皆曾为家`,
    seal: "寰宇",
    body: section(
      "降 生 名 录",
      `<table class="ledger">
    <thead><tr><th width="22%">次 第</th><th width="34%">大 洲</th><th class="l" width="44%">国 度</th></tr></thead>
    <tbody>${rows}</tbody>
</table>`,
      `近 ${birthResultsInWorld.length} 笔`,
    ),
    colophonRight: "自新至旧，依序而列",
  });
}

/** 中国投胎成功历史。 */
function renderChinaBirthHistory(
  username: string,
  birthResultsInChina: BirthResultInChina[],
): string {
  const rows = birthResultsInChina
    .map(
      (record) => `<tr>
    <td class="idx">${record.index}</td>
    <td>${chip(
      translateGender(record.gender),
      record.gender === "male" ? "azure" : "rose",
      true,
    )}</td>
    <td class="name">${record.province}</td>
    <td>${record.category ? chip(record.category, "ink") : "—"}</td>
    <td>${record.order ? orderText(record.order) : "—"}</td>
</tr>`,
    )
    .join("");

  return buildPage({
    docTitle: "中国投胎成功历史",
    title: "中国投胎 · 降生纪年",
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>一纸命簿，半生浮沉`,
    seal: "降生",
    body: section(
      "降 生 名 录",
      `<table class="ledger">
    <thead><tr><th width="14%">次 第</th><th width="17%">性 别</th><th width="25%">省 份</th><th width="22%">城 乡</th><th width="22%">胎 次</th></tr></thead>
    <tbody>${rows}</tbody>
</table>`,
      `近 ${birthResultsInChina.length} 笔`,
    ),
    colophonRight: "自新至旧，依序而列",
    style: `.ledger td.name { text-align: center; padding-left: 10px; }`,
  });
}

/** 世界投胎记录总览。 */
function renderWorldOverview(
  username: string,
  analysisResult,
  userRank: number,
  userStillbirthsRank: number,
  numberOfStillbirths: number,
): string {
  const { totalCount, dictContinentCounts, uniqueCountries, favourite } =
    analysisResult;
  const counts: { [key: string]: number } = dictContinentCounts;
  const attempts = totalCount + numberOfStillbirths;

  const hero = `<div class="grid c3">
    ${statCard({
      label: "降 生",
      value: totalCount,
      unit: "次",
      tone: "jade",
      note: rankText(userRank),
      hero: true,
    })}
    ${statCard({
      label: "夭 折",
      value: numberOfStillbirths,
      unit: "次",
      tone: "cinnabar",
      note: rankText(userStillbirthsRank),
      hero: true,
    })}
    ${statCard({
      label: "存 活 率",
      value: percentText(totalCount, attempts),
      tone: "gold",
      note: `共叩门 ${attempts} 次`,
      hero: true,
    })}
</div>`;

  const footprint = `<div class="grid c2">
    ${statCard({
      label: "履 及 之 国",
      value: uniqueCountries,
      unit: "国",
      tone: "azure",
    })}
    ${statCard({
      label: "最 常 降 生",
      value: favourite.name || "—",
      tone: "ink",
      note: favourite.count
        ? `${favourite.count} 次 · 占 ${percentText(favourite.count, totalCount)}`
        : "",
    })}
</div>`;

  const continents = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([continent, count], index) => {
      const tone = count === 0 ? "ink" : index < 3 ? "gold" : "azure";
      const bar = count
        ? `<i style="width: ${clampPercent(count / totalCount)}%"></i>`
        : "";
      return `<div class="bar-row t-${tone}">
    <span class="no">${index + 1}</span>
    <span class="rname">${continent}</span>
    <span class="track">${bar}</span>
    <span class="val">${count} 次<em>${percentText(count, totalCount)}</em></span>
</div>`;
    })
    .join("");

  const visited = Object.values(counts).filter((value) => value > 0).length;

  return buildPage({
    docTitle: "世界投胎记录总览",
    title: "世界投胎 · 记录总览",
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>七洲之内，已履 ${visited} 洲`,
    seal: "寰宇",
    body: [
      section("生 死 之 数", hero),
      section("行 迹", footprint),
      section(
        "大 洲 分 布",
        `<div class="bars">${continents}</div>`,
        `共 ${totalCount} 次`,
      ),
    ].join(""),
    colophonRight: `降生 ${totalCount} · 夭折 ${numberOfStillbirths}`,
  });
}

/** 中国投胎记录总览。 */
function renderChinaOverview(
  username: string,
  analysisResult,
  userRank: number,
  userStillbirthsRank: number,
  numberOfStillbirthsInChina: number,
): string {
  const {
    totalCount,
    orderCounts,
    genderCounts,
    categoryCounts,
    uniqueProvinces,
    favourite,
  } = analysisResult;
  const attempts = totalCount + numberOfStillbirthsInChina;

  const hero = `<div class="grid c3">
    ${statCard({
      label: "降 生",
      value: totalCount,
      unit: "次",
      tone: "jade",
      note: rankText(userRank),
      hero: true,
    })}
    ${statCard({
      label: "夭 折",
      value: numberOfStillbirthsInChina,
      unit: "次",
      tone: "cinnabar",
      note: rankText(userStillbirthsRank),
      hero: true,
    })}
    ${statCard({
      label: "存 活 率",
      value: percentText(totalCount, attempts),
      tone: "gold",
      note: `共叩门 ${attempts} 次`,
      hero: true,
    })}
</div>`;

  const region = `<div class="grid c3">
    ${(["城市", "城镇", "乡村"] as const)
      .map((key) =>
        statCard({
          label: [...key].join(" "),
          value: categoryCounts[key],
          unit: "次",
          tone: "ink",
          note: `占 ${percentText(categoryCounts[key], totalCount)}`,
          ratio: categoryCounts[key] / totalCount,
        }),
      )
      .join("")}
</div>
<div class="grid c2 gap-top">
    ${statCard({
      label: "履 及 之 省",
      value: uniqueProvinces,
      unit: "省",
      tone: "gold",
    })}
    ${statCard({
      label: "最 常 降 生",
      value: favourite.name || "—",
      tone: "ink",
      note: favourite.count
        ? `${favourite.count} 次 · 占 ${percentText(favourite.count, totalCount)}`
        : "",
    })}
</div>`;

  const gender = `<div class="grid c2">
    ${statCard({
      label: "男 孩",
      value: genderCounts.male,
      unit: "次",
      tone: "azure",
      note: `占 ${percentText(genderCounts.male, totalCount)}`,
      ratio: genderCounts.male / totalCount,
    })}
    ${statCard({
      label: "女 孩",
      value: genderCounts.female,
      unit: "次",
      tone: "rose",
      note: `占 ${percentText(genderCounts.female, totalCount)}`,
      ratio: genderCounts.female / totalCount,
    })}
</div>`;

  const orders = `<div class="grid c5">
    ${(["一", "二", "三", "四", "五及以上"] as const)
      .map((key) =>
        statCard({
          label: key === "五及以上" ? "五 及 以 上" : `第 ${key} 胎`,
          value: orderCounts[key],
          unit: "次",
          tone: "gold",
          note: percentText(orderCounts[key], totalCount),
          ratio: orderCounts[key] / totalCount,
        }),
      )
      .join("")}
</div>`;

  return buildPage({
    docTitle: "中国投胎记录总览",
    title: "中国投胎 · 记录总览",
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>生死有数，去来有痕`,
    seal: "命簿",
    body: [
      section("生 死 之 数", hero),
      section("城 乡 与 山 河", region),
      section("男 女 之 数", gender),
      section("胎 次", orders),
    ].join(""),
    colophonRight: `降生 ${totalCount} · 夭折 ${numberOfStillbirthsInChina}`,
    style: `
.gap-top { margin-top: 12px; }
.grid.c5 .stat { padding: 12px 12px 11px; }
.grid.c5 .stat .k { font-size: 11.5px; letter-spacing: .08em; }
.grid.c5 .stat .v { font-size: 22px; }
`,
  });
}

/** 中国投胎第一次出现：按初见先后排列的省份图鉴。 */
function renderFirstAppearance(
  username: string,
  birthResultsInChina: BirthResultInChina[],
  totalProvinceCount: number,
): string {
  const first: {
    [province: string]: { male: number | null; female: number | null };
  } = {};

  for (const result of birthResultsInChina) {
    const entry = (first[result.province] ??= { male: null, female: null });
    if (result.gender === "male" && entry.male === null) {
      entry.male = result.index ?? null;
    } else if (result.gender === "female" && entry.female === null) {
      entry.female = result.index ?? null;
    }
  }

  const earliest = (entry: { male: number | null; female: number | null }) =>
    Math.min(entry.male ?? Infinity, entry.female ?? Infinity);

  const provinces = Object.entries(first).sort(
    (a, b) => earliest(a[1]) - earliest(b[1]),
  );

  const cell = (value: number | null, gender: "male" | "female") =>
    value === null
      ? `<span class="chip ghost">未 逢</span>`
      : chip(
          `${translateGender(gender)} · 第 ${value} 次`,
          gender === "male" ? "azure" : "rose",
          true,
        );

  const rows = provinces
    .map(
      ([province, entry]) => `<tr>
    <td class="idx">${Number.isFinite(earliest(entry)) ? earliest(entry) : "—"}</td>
    <td class="name">${province}</td>
    <td>${cell(entry.male, "male")}</td>
    <td>${cell(entry.female, "female")}</td>
</tr>`,
    )
    .join("");

  const unlocked = provinces.length;

  return buildPage({
    docTitle: "中国投胎第一次出现",
    title: "中国投胎 · 初见图鉴",
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>已踏足 ${unlocked} / ${totalProvinceCount} 省`,
    seal: "初见",
    body: section(
      "初 见 之 序",
      `<div class="progress"><i style="width: ${clampPercent(unlocked / totalProvinceCount)}%"></i></div>
<table class="ledger">
    <thead><tr><th width="14%">初 见</th><th width="26%">省 份</th><th width="30%">男 孩</th><th width="30%">女 孩</th></tr></thead>
    <tbody>${rows}</tbody>
</table>`,
      `尚余 ${Math.max(0, totalProvinceCount - unlocked)} 省未至`,
    ),
    colophonRight: `${unlocked} / ${totalProvinceCount}`,
    style: `
.progress { height: 4px; margin-bottom: 16px; background: rgba(34, 30, 25, .07); }
.progress i { display: block; height: 100%; background: linear-gradient(90deg, rgba(176, 141, 79, .35), var(--gold)); }
.ledger td.name { text-align: center; padding-left: 10px; letter-spacing: .08em; }
`,
  });
}

/** 地图专用版式：题头 + 图版 + 图例带。 */
function buildMapPage(o: {
  docTitle: string;
  title: string;
  subtitle: string;
  seal: string;
  chartHeight: number;
  legend: string;
  colophonRight: string;
  script: string;
}): string {
  return buildPage({
    docTitle: o.docTitle,
    title: o.title,
    subtitle: o.subtitle,
    seal: o.seal,
    body: `<div class="plate"><div id="map" style="width: 100%; height: ${o.chartHeight}px;"></div></div>
<div class="legend">${o.legend}</div>`,
    colophonRight: o.colophonRight,
    head: `<script src="${ECHARTS_CDN}"></script>`,
    script: `<script>${o.script}</script>`,
    style: `
.plate {
    position: relative;
    padding: 10px;
    background: linear-gradient(180deg, #FBF6EA, #F5EEDF);
    border: 1px solid var(--line);
}

.plate::after {
    content: "";
    position: absolute;
    inset: 4px;
    border: 1px solid rgba(176, 141, 79, .28);
    pointer-events: none;
}

.legend {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 14px;
    font-size: 12.5px;
    letter-spacing: .08em;
    color: var(--ink-3);
}

.legend .ramp { width: 110px; height: 7px; background: linear-gradient(90deg, ${HEAT_LOW}, ${HEAT_HIGH}); }
.legend .spacer { flex: 1; }
.legend .key { display: inline-flex; align-items: center; gap: 6px; }
.legend .key i { width: 9px; height: 9px; border-radius: 50%; background: var(--cinnabar); }
.legend b { font-weight: 400; color: var(--ink-2); }
`,
  });
}

/** 静态涟漪 + 落点标记：不用动画，保证每次截图一致。 */
const MAP_MARKER_JS = `
function marker(coord, color) {
    var rings = [];
    for (var i = 0; i < 3; i++) {
        rings.push({
            type: 'circle',
            shape: { cx: 0, cy: 0, r: 9 + i * 9 },
            style: { stroke: color, fill: 'none', lineWidth: 1.4, opacity: 0.42 - i * 0.12 }
        });
    }
    return {
        type: 'group',
        x: coord[0],
        y: coord[1],
        children: rings.concat([
            { type: 'circle', shape: { cx: 0, cy: 0, r: 3.5 }, style: { fill: color } },
            {
                type: 'path',
                shape: {
                    d: 'M16 0c-5.523 0-10 4.477-10 10 0 10 10 22 10 22s10-12 10-22c0-5.523-4.477-10-10-10zM16 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z',
                    x: -9, y: -34, width: 18, height: 36
                },
                style: { fill: color, shadowBlur: 6, shadowColor: 'rgba(34,30,25,.35)', shadowOffsetY: 2 }
            }
        ])
    };
}
`;

function renderWorldMap(
  birthResultInWorld: BirthResultInWorld,
  username: string,
  world: unknown,
  worldData: CountryData,
): string {
  const nameEn =
    Object.values(worldData).find(
      (country) => country.nameCn === birthResultInWorld.dictName,
    )?.nameEn ?? "";

  const script = `
const myChart = echarts.init(document.getElementById('map'));
echarts.registerMap('world', ${JSON.stringify(world)});
${MAP_MARKER_JS}
myChart.setOption({
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: ${JSON.stringify(MAP_FONT)} },
    geo: {
        map: 'world',
        roam: false,
        zoom: 2.0,
        center: ${JSON.stringify(birthResultInWorld.center)},
        silent: true,
        label: { show: false },
        itemStyle: { areaColor: '#E7DFCF', borderColor: '#C6BAA3', borderWidth: 0.6 },
        regions: ${JSON.stringify(
          nameEn
            ? [
                {
                  name: nameEn,
                  itemStyle: {
                    areaColor: HEAT_HIGH,
                    borderColor: "#8E4B32",
                    borderWidth: 1,
                  },
                },
              ]
            : [],
        )},
        emphasis: { disabled: true }
    },
    series: [{
        type: 'custom',
        coordinateSystem: 'geo',
        geoIndex: 0,
        zlevel: 1,
        silent: true,
        data: [${JSON.stringify(birthResultInWorld.coordinate)}],
        renderItem: function (params, api) {
            return marker(api.coord([
                api.value(0, params.dataIndex),
                api.value(1, params.dataIndex)
            ]), '${CINNABAR}');
        }
    }]
});
`;

  return buildMapPage({
    docTitle: "世界投胎落点",
    title: `${birthResultInWorld.dictContinent} · ${birthResultInWorld.dictName}`,
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>第 ${birthResultInWorld.index} 次轮回 · 已落人间`,
    seal: "寰宇",
    chartHeight: 372,
    legend: `<span class="key"><i></i>本次落点</span>
<span>${birthResultInWorld.dictContinent} · <b>${birthResultInWorld.dictName}</b></span>
<span class="spacer"></span>
<span>经纬 ${birthResultInWorld.coordinate[0].toFixed(1)} , ${birthResultInWorld.coordinate[1].toFixed(1)}</span>`,
    colophonRight: "天涯何处不为家",
    script,
  });
}

function renderChinaMap(
  birthResults: BirthResultInChina[],
  birthResult: BirthResultInChina,
  username: string,
  chinaData: China,
  totalProvinceCount: number,
): string {
  // 各省累计概率决定颜色深浅，本次落点单独以朱砂标出。
  const provinceWeights: { [province: string]: number } = {};
  for (const result of birthResults) {
    provinceWeights[result.province] =
      (provinceWeights[result.province] || 0) + result.probability;
  }

  const weights = Object.values(provinceWeights);
  const maxWeight = weights.length ? Math.max(...weights) : 0;

  const regions = Object.entries(provinceWeights).map(([name, weight]) => ({
    name,
    itemStyle: { areaColor: heatColor(maxWeight ? weight / maxWeight : 0) },
  }));

  regions.push({
    name: birthResult.province,
    itemStyle: { areaColor: CINNABAR },
    label: { color: "#FFFDF8", fontSize: 11, fontWeight: "bold" },
    silent: true,
  } as any);

  const feature = chinaData.features.find(
    (item) => item.properties.name === birthResult.province,
  );

  const isSpecialRegion = ["香港", "澳门", "台湾"].includes(
    birthResult.province,
  );
  const detail = isSpecialRegion
    ? `${birthResult.province} · ${translateGenderChild(birthResult.gender)}`
    : `${birthResult.province} · ${birthResult.category} · ${translateGenderChild(birthResult.gender)} · ${orderText(birthResult.order)}`;

  const script = `
const myChart = echarts.init(document.getElementById('map'));
echarts.registerMap('china', ${JSON.stringify(chinaData)});
${MAP_MARKER_JS}
myChart.setOption({
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: ${JSON.stringify(MAP_FONT)} },
    geo: {
        map: 'china',
        roam: false,
        zoom: 1.2,
        silent: true,
        label: { show: true, fontSize: 9.5, color: '#6B6156' },
        itemStyle: { areaColor: '#FBF6EA', borderColor: '#C6BAA3', borderWidth: 0.8 },
        emphasis: { disabled: true },
        regions: ${JSON.stringify(regions)}
    }${
      feature
        ? `,
    series: [{
        type: 'custom',
        coordinateSystem: 'geo',
        geoIndex: 0,
        zlevel: 1,
        silent: true,
        data: [${JSON.stringify(feature.properties.cp)}],
        renderItem: function (params, api) {
            return marker(api.coord([
                api.value(0, params.dataIndex),
                api.value(1, params.dataIndex)
            ]), '${CINNABAR}');
        }
    }]`
        : ""
    }
});
`;

  return buildMapPage({
    docTitle: "中国投胎落点",
    title: detail,
    subtitle: `命主 ${esc(username)}<span class="sep">❖</span>第 ${birthResult.index} 次轮回 · 已落人间`,
    seal: "降生",
    chartHeight: 590,
    legend: `<span class="key"><i></i>本次落点</span>
<span class="ramp"></span>
<span>旧迹 由浅及深</span>
<span class="spacer"></span>
<span>已踏足 <b>${Object.keys(provinceWeights).length}</b> / ${totalProvinceCount} 省</span>`,
    colophonRight: "山河万里，此处是家",
    script,
  });
}

export function apply(ctx: Context, config: Config) {
  ctx.database.extend(
    "toutai_records",
    {
      id: "unsigned",
      userId: "string",
      username: "string",
      timestamp: { type: "string", initial: "" },
      birthResultsInChina: { type: "json", initial: [] },
      birthResultsInWorld: { type: "json", initial: [] },
      numberOfStillbirthsInChina: { type: "unsigned", initial: 0 },
      numberOfStillbirthsInWorld: { type: "unsigned", initial: 0 },
      unfortunateDemiseRecordsInWorld: { type: "json", initial: [] },
    },
    {
      primary: "id",
      autoInc: true,
    },
  );

  const filePath = path.join(__dirname, "emptyHtml.html").replace(/\\/g, "/");
  const pageGotoFilePath = "file://" + filePath;
  const ChinaJsonFilePath = path.join(__dirname, "assets", "China.json");
  const worldJsonFilePath = path.join(__dirname, "assets", "world.json");
  const worldDataJsonFilePath = path.join(
    __dirname,
    "assets",
    "worldData.json",
  );
  const worldBirthrateJsonFilePath = path.join(
    __dirname,
    "assets",
    "worldBirthrate.json",
  );
  const birthrateDetailedJsonFilePath = path.join(
    __dirname,
    "assets",
    "birthrateDetailed.json",
  );
  const neonatalMortalityRateJsonFilePath = path.join(
    __dirname,
    "assets",
    "neonatalMortalityRate.json",
  );

  // 同步读取文件，保留原有逻辑
  const ChinaData: China = JSON.parse(
    fs.readFileSync(ChinaJsonFilePath, "utf-8"),
  );
  const world: CountryData = JSON.parse(
    fs.readFileSync(worldJsonFilePath, "utf-8"),
  );
  const worldData: CountryData = JSON.parse(
    fs.readFileSync(worldDataJsonFilePath, "utf-8"),
  );
  const worldBirthrateData: WorldBirthrateData[] = JSON.parse(
    fs.readFileSync(worldBirthrateJsonFilePath, "utf-8"),
  );
  const birthrateDetailedData: BirthrateDetailedData[] = JSON.parse(
    fs.readFileSync(birthrateDetailedJsonFilePath, "utf-8"),
  );
  const neonatalMortalityRateData: NeonatalMortalityRateData = JSON.parse(
    fs.readFileSync(neonatalMortalityRateJsonFilePath, "utf-8"),
  );

  // 命簿共收录多少个省级行政区（national 为汇总行，不计）。
  const totalProvinceCount = birthrateDetailedData.filter(
    (region) => region.name !== "national",
  ).length;

  const logger = ctx.logger("toutai");
  const isQQOfficialRobotMarkdownTemplateEnabled =
    config.isEnableQQOfficialRobotMarkdownTemplate &&
    config.key !== "" &&
    config.customTemplateId !== "";
  const macauBirthPopulation = 3712;
  const taiwanBirthPopulation = 137413;
  const hongKongBirthPopulation = 33200;
  const chinaBirthPopulation = 12123210;
  const totalPopulation =
    chinaBirthPopulation +
    hongKongBirthPopulation +
    macauBirthPopulation +
    taiwanBirthPopulation;
  const continentDict = {
    AF: "非洲",
    EU: "欧洲",
    AS: "亚洲",
    OA: "大洋洲",
    NA: "北美洲",
    SA: "南美洲",
    AN: "南极洲",
  };

  ctx.command("toutai", "投胎模拟器帮助").action(async ({ session }) => {
    if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === "qq") {
      return await sendMessage(
        session,
        `❖ 投 胎 模 拟 器 ❖
一念既起，山河万里。
请择一处人间，投身而去。`,
        `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    }
    await session.execute(`toutai -h`);
  });

  ctx.command("toutai.投胎中国", "投胎到中国").action(async ({ session }) => {
    let { userId, username, timestamp } = session;
    username = await getSessionUserName(session);
    await updateNameInPlayerRecord(session, userId, username);
    const toutaiRecord = await ctx.database.get("toutai_records", { userId });
    if (toutaiRecord.length !== 0) {
      const lastTimestamp = Number(toutaiRecord[0].timestamp);
      const timeDifference = calculateTimeDifference(lastTimestamp, timestamp);
      const remainingWaitTime = Math.floor(
        config.nextReincarnationCooldownSeconds - timeDifference,
      );
      if (timeDifference < config.nextReincarnationCooldownSeconds) {
        return await sendMessage(
          session,
          `⏳ 轮回未启
　黄泉路上尚在排队，请再候 ${remainingWaitTime} 秒。`,
          `投胎中国 投胎世界 改名`,
          2,
        );
      }
    }
    const isRebirth = simulateRebirth(neonatalMortalityRateData["中国"]);
    if (!isRebirth) {
      const stillbirths = toutaiRecord[0].numberOfStillbirthsInChina + 1;
      const attempts = toutaiRecord[0].birthResultsInChina.length + stillbirths;
      await ctx.database.set(
        "toutai_records",
        { userId },
        {
          numberOfStillbirthsInChina: stillbirths,
          timestamp: String(timestamp),
        },
      );
      await sendMessage(
        session,
        `🕯 第 ${attempts} 次叩门 · 未能落地
　${pickOne(LAMENTS)}
　累计夭折 ${stillbirths} 次，再来一次吧。`,
        `投胎中国 投胎世界 改名`,
        2,
      );
    } else {
      const birthResult = simulateBirthInChina();
      if (toutaiRecord.length !== 0) {
        birthResult.index = toutaiRecord[0].birthResultsInChina.length + 1;
        toutaiRecord[0].birthResultsInChina.push(birthResult);
        await ctx.database.set(
          "toutai_records",
          { userId },
          {
            birthResultsInChina: toutaiRecord[0].birthResultsInChina,
            timestamp: String(timestamp),
          },
        );
      } else {
        birthResult.index = 1;
        await ctx.database.create("toutai_records", {
          userId: userId,
          username: username,
          birthResultsInChina: [birthResult],
          timestamp: String(timestamp),
        });
      }
      const isSpecialRegion = ["香港", "澳门", "台湾"].includes(
        birthResult.province,
      );
      const lines = [
        `🍼 第 ${birthResult.index} 次轮回 · 落地平安`,
        entry(
          "籍贯",
          isSpecialRegion
            ? birthResult.province
            : `${birthResult.province} · ${birthResult.category}`,
        ),
        entry("性别", translateGenderChild(birthResult.gender)),
      ];
      if (!isSpecialRegion) {
        lines.push(entry("排行", `家中${orderText(birthResult.order)}`));
      }
      lines.push(`　${pickOne(BLESSINGS)}`);
      const message = lines.join("\n");
      const mapBuffer = await generateChinaMap(
        toutaiRecord[0].birthResultsInChina,
        birthResult,
        username,
      );
      const hImg = config.isMapImageIncludedAfterRebirth
        ? `${h.image(mapBuffer, `image/${config.imageType}`)}\n`
        : ``;
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          message,
          `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      } else {
        await sendMessage(
          session,
          `${hImg}${message}`,
          `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
    }
  });

  ctx.command("toutai.投胎世界", "投胎到世界").action(async ({ session }) => {
    let { userId, username, timestamp } = session;
    username = await getSessionUserName(session);
    await updateNameInPlayerRecord(session, userId, username);
    const toutaiRecord = await ctx.database.get("toutai_records", { userId });
    if (toutaiRecord.length !== 0) {
      const lastTimestamp = Number(toutaiRecord[0].timestamp);
      const timeDifference = calculateTimeDifference(lastTimestamp, timestamp);
      const remainingWaitTime = Math.floor(
        config.nextReincarnationCooldownSeconds - timeDifference,
      );
      if (timeDifference < config.nextReincarnationCooldownSeconds) {
        return await sendMessage(
          session,
          `⏳ 轮回未启
　黄泉路上尚在排队，请再候 ${remainingWaitTime} 秒。`,
          `投胎中国 投胎世界 改名`,
        );
      }
    }
    const rebornCountry = simulateRebirthInWorld(worldBirthrateData);
    let foundElement = null;
    for (const countryCode in worldData) {
      if (worldData[countryCode].nameCn === rebornCountry) {
        foundElement = worldData[countryCode];
        break;
      }
    }
    const coordinate = foundElement["position"];
    const center = foundElement["position"];
    const dictName = foundElement["nameCn"];
    const dictContinent = continentDict[foundElement["continent"]];
    const neonatalMortalityRate = neonatalMortalityRateData[dictName] || 0;
    if (
      neonatalMortalityRate !== 0 &&
      !simulateRebirth(neonatalMortalityRate)
    ) {
      toutaiRecord[0].unfortunateDemiseRecordsInWorld.push({
        index: toutaiRecord[0].unfortunateDemiseRecordsInWorld.length + 1,
        dictName,
        dictContinent,
      });
      const stillbirths = toutaiRecord[0].numberOfStillbirthsInWorld + 1;
      await ctx.database.set(
        "toutai_records",
        { userId },
        {
          numberOfStillbirthsInWorld: stillbirths,
          timestamp: String(timestamp),
          unfortunateDemiseRecordsInWorld:
            toutaiRecord[0].unfortunateDemiseRecordsInWorld,
        },
      );
      return await sendMessage(
        session,
        `🕯 投身于 ${dictContinent} · ${dictName}
　${pickOne(LAMENTS)}
　累计夭折 ${stillbirths} 次，再来一次吧。`,
        `投胎中国 投胎世界 改名`,
      );
    }
    const birthResultInWorld = {
      index: 0,
      dictName,
      dictContinent,
      coordinate,
      center,
    };
    if (toutaiRecord.length !== 0) {
      birthResultInWorld.index = toutaiRecord[0].birthResultsInWorld.length + 1;
      toutaiRecord[0].birthResultsInWorld.push(birthResultInWorld);
      await ctx.database.set(
        "toutai_records",
        { userId },
        {
          birthResultsInWorld: toutaiRecord[0].birthResultsInWorld,
          timestamp: String(timestamp),
        },
      );
    } else {
      birthResultInWorld.index = 1;
      await ctx.database.create("toutai_records", {
        userId: userId,
        username: username,
        birthResultsInWorld: [birthResultInWorld],
        timestamp: String(timestamp),
      });
    }
    const mapBuffer = await generateWorldMap(birthResultInWorld, username);
    const hImg = config.isMapImageIncludedAfterRebirth
      ? `${h.image(mapBuffer, `image/${config.imageType}`)}\n`
      : ``;
    const message = [
      `🌍 第 ${birthResultInWorld.index} 次轮回 · 落地平安`,
      entry("大洲", dictContinent),
      entry("国度", dictName),
      `　${pickOne(BLESSINGS)}`,
    ].join("\n");
    if (
      !config.isTextToImageConversionEnabled &&
      isQQOfficialRobotMarkdownTemplateEnabled &&
      session.platform === "qq"
    ) {
      await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
      return await sendMessage(
        session,
        message,
        `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
      );
    } else {
      await sendMessage(
        session,
        `${hImg}${message}`,
        `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
      );
    }
  });

  ctx
    .command("toutai.中国投胎记录", "中国投胎记录帮助")
    .action(async ({ session }, startIndex) => {
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        return await sendMessage(
          session,
          `📜 中国投胎记录 · 可查条目
　请择一类查阅：`,
          `中国投胎记录总览 中国投胎成功历史 中国投胎地区分布 中国投胎性别分布 中国投胎第一次出现记录`,
          2,
        );
      }
      await session.execute(`toutai.中国投胎记录 -h`);
    });

  ctx
    .command("toutai.中国投胎记录.总览 [targetUser:text]", "中国投胎记录总览")
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);

      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;

      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `📜 命簿翻遍，未见此人的中国投胎记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }

      const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
        "toutai_records",
        {},
      );
      const userRank = getUserRankInChinaBirthResults(
        toutaiRecords,
        targetUserId,
      );
      const userStillbirthsRank = getChinaStillbirthsRanking(
        toutaiRecords,
        userId,
      );

      const { birthResultsInChina, numberOfStillbirthsInChina } =
        targetUserRecord[0];
      const analysisResult = analyzeChinaBirthResults(birthResultsInChina);
      const buffer = await generateChinaBirthOverviewTableImage(
        trimUsername(targetUserRecord[0].username),
        analysisResult,
        userRank,
        userStillbirthsRank,
        numberOfStillbirthsInChina,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.成功历史 [targetUser:text]",
      "中国投胎成功历史",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `📜 命簿翻遍，未见此人的中国投胎记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      const last20Records = birthResultsInChina.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      const buffer = await generateTableImageFromBirthResultsInChinaArray(
        trimUsername(targetUserRecord[0].username),
        last20Records,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.地区分布 [targetUser:text]",
      "中国投胎地区分布",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `📜 命簿翻遍，未见此人的中国投胎记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      const buffer = await generateBirthRegionHorizontalBarChartRankings(
        trimUsername(targetUserRecord[0].username),
        birthResultsInChina,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.性别分布 [targetUser:text]",
      "中国投胎性别分布",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `📜 命簿翻遍，未见此人的中国投胎记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      const buffer = await generateChineseBirthGenderDistributionPieChart(
        trimUsername(targetUserRecord[0].username),
        birthResultsInChina,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.第一次出现 [targetUser:text]",
      "中国投胎第一次出现",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `📜 命簿翻遍，未见此人的中国投胎记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      const buffer = await generateFirstChineseReincarnationRecordTableImage(
        trimUsername(targetUserRecord[0].username),
        birthResultsInChina,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command("toutai.世界投胎记录", "世界投胎记录帮助")
    .action(async ({ session }, startIndex) => {
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        return await sendMessage(
          session,
          `📜 世界投胎记录 · 可查条目
　请择一类查阅：`,
          `世界投胎成功历史 世界投胎夭折历史 世界投胎记录总览`,
          2,
        );
      }
      await session.execute(`toutai.世界投胎记录 -h`);
    });

  ctx
    .command("toutai.世界投胎记录.总览 [targetUser:text]", "世界投胎记录总览")
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);

      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;

      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInWorld.length === 0
      ) {
        return sendMessage(
          session,
          `📜 命簿翻遍，未见此人的世界投胎记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }

      const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
        "toutai_records",
        {},
      );
      const rankResult = getWorldRanking(toutaiRecords, targetUserId);
      const userRank = rankResult.birthResultsRank;
      const userStillbirthsRank = rankResult.numberOfStillbirthsRank;

      const { birthResultsInWorld, numberOfStillbirthsInWorld } =
        targetUserRecord[0];
      const analysisResult = analyzeWorldBirthResults(birthResultsInWorld);
      const buffer = await generateWorldBirthOverviewTableImage(
        trimUsername(targetUserRecord[0].username),
        analysisResult,
        userRank,
        userStillbirthsRank,
        numberOfStillbirthsInWorld,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.世界投胎记录.成功历史 [targetUser:text]",
      "世界投胎成功历史",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInWorld.length === 0
      ) {
        return sendMessage(
          session,
          `📜 命簿翻遍，未见此人的世界投胎记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInWorld } = targetUserRecord[0];
      const last20Records = birthResultsInWorld.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      const buffer = await generateTableImageFromBirthResultsInWorldArray(
        trimUsername(targetUserRecord[0].username),
        last20Records,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.世界投胎记录.夭折历史 [targetUser:text]",
      "世界投胎夭折历史",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].unfortunateDemiseRecordsInWorld.length === 0
      ) {
        return sendMessage(
          session,
          `📜 命簿翻遍，未见此人的世界夭折记录 —— 也算一桩幸事。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { unfortunateDemiseRecordsInWorld } = targetUserRecord[0];
      const last20Records = unfortunateDemiseRecordsInWorld.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      const buffer =
        await generateTableImageFromBirthResultsInWorldArrayForUnfortunateDemiseRecords(
          trimUsername(targetUserRecord[0].username),
          last20Records,
        );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command("toutai.中国投胎排行榜", "中国投胎排行榜帮助")
    .action(async ({ session }, startIndex) => {
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        return await sendMessage(
          session,
          `🏆 中国投胎排行榜 · 可阅榜单
　请择一榜观之：`,
          `中国投胎成功次数 中国投胎夭折次数 中国投胎男孩次数 中国投胎女孩次数`,
          2,
        );
      }
      await session.execute(`toutai.中国投胎排行榜 -h`);
    });

  ctx
    .command(
      "toutai.中国投胎排行榜.成功次数 [maxLeaderboardDisplayCount:number]",
      "中国投胎次数排行榜",
    )
    .action(
      async (
        { session },
        maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
      ) => {
        if (
          typeof maxLeaderboardDisplayCount !== "number" ||
          isNaN(maxLeaderboardDisplayCount) ||
          maxLeaderboardDisplayCount < 0
        ) {
          return "📜 榜单人数须是不小于 0 的数字，请重新输入。";
        }
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const buffer = await generateRankingsImage(
          toutaiRecords,
          maxLeaderboardDisplayCount,
          {
            title: "中国投胎 · 降生次数榜",
            seal: "降生",
            valueLabel: "次",
            tone: "jade",
            pick: (record) => record.birthResultsInChina.length,
            selfUserId: userId,
          },
        );
        const hImg = h.image(buffer, `image/${config.imageType}`);
        if (
          !config.isTextToImageConversionEnabled &&
          isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq"
        ) {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
          return await sendMessage(
            session,
            `<@${userId}>`,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        }
        await sendMessage(
          session,
          hImg,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      },
    );

  ctx
    .command(
      "toutai.中国投胎排行榜.夭折次数 [maxLeaderboardDisplayCount:number]",
      "中国夭折次数排行榜",
    )
    .action(
      async (
        { session },
        maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
      ) => {
        if (
          typeof maxLeaderboardDisplayCount !== "number" ||
          isNaN(maxLeaderboardDisplayCount) ||
          maxLeaderboardDisplayCount < 0
        ) {
          return "📜 榜单人数须是不小于 0 的数字，请重新输入。";
        }
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const buffer = await generateRankingsImage(
          toutaiRecords,
          maxLeaderboardDisplayCount,
          {
            title: "中国投胎 · 夭折次数榜",
            seal: "长夜",
            valueLabel: "次",
            tone: "cinnabar",
            pick: (record) => record.numberOfStillbirthsInChina,
            selfUserId: userId,
          },
        );
        const hImg = h.image(buffer, `image/${config.imageType}`);
        if (
          !config.isTextToImageConversionEnabled &&
          isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq"
        ) {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
          return await sendMessage(
            session,
            `<@${userId}>`,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        }
        await sendMessage(
          session,
          hImg,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      },
    );

  const genders = ["male", "female"];
  genders.forEach((gender) => {
    ctx
      .command(
        `toutai.中国投胎排行榜.${translateGenderChild(gender)}次数 [maxLeaderboardDisplayCount:number]`,
        `中国投胎${translateGenderChild(gender)}次数排行榜`,
      )
      .action(
        async (
          { session },
          maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
        ) => {
          if (
            typeof maxLeaderboardDisplayCount !== "number" ||
            isNaN(maxLeaderboardDisplayCount) ||
            maxLeaderboardDisplayCount < 0
          ) {
            return "📜 榜单人数须是不小于 0 的数字，请重新输入。";
          }
          let { userId, username } = session;
          username = await getSessionUserName(session);
          await updateNameInPlayerRecord(session, userId, username);
          const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
            "toutai_records",
            {},
          );
          const buffer = await generateRankingsImage(
            toutaiRecords,
            maxLeaderboardDisplayCount,
            {
              title: `中国投胎 · ${translateGenderChild(gender)}次数榜`,
              seal: gender === "male" ? "青阳" : "绛雪",
              valueLabel: "次",
              tone: gender === "male" ? "azure" : "rose",
              pick: (record) =>
                record.birthResultsInChina.filter(
                  (result) => result.gender === gender,
                ).length,
              selfUserId: userId,
            },
          );
          const hImg = h.image(buffer, `image/${config.imageType}`);
          if (
            !config.isTextToImageConversionEnabled &&
            isQQOfficialRobotMarkdownTemplateEnabled &&
            session.platform === "qq"
          ) {
            await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
            return await sendMessage(
              session,
              `<@${userId}>`,
              `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
              2,
              false,
            );
          }
          await sendMessage(
            session,
            hImg,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        },
      );
  });

  ctx
    .command("toutai.世界投胎排行榜", "世界投胎排行榜帮助")
    .action(async ({ session }, startIndex) => {
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        return await sendMessage(
          session,
          `🏆 世界投胎排行榜 · 可阅榜单
　请择一榜观之：`,
          `世界投胎成功次数 世界投胎夭折次数 世界投胎亚洲次数 世界投胎欧洲次数 世界投胎南美洲次数 世界投胎南极洲次数 世界投胎大洋洲次数 世界投胎北美洲次数 世界投胎非洲次数`,
          2,
        );
      }
      await session.execute(`toutai.世界投胎排行榜 -h`);
    });

  ctx
    .command(
      "toutai.世界投胎排行榜.成功次数 [maxLeaderboardDisplayCount:number]",
      "世界投胎成功次数排行榜",
    )
    .action(
      async (
        { session },
        maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
      ) => {
        if (
          typeof maxLeaderboardDisplayCount !== "number" ||
          isNaN(maxLeaderboardDisplayCount) ||
          maxLeaderboardDisplayCount < 0
        ) {
          return "📜 榜单人数须是不小于 0 的数字，请重新输入。";
        }
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const buffer = await generateRankingsImage(
          toutaiRecords,
          maxLeaderboardDisplayCount,
          {
            title: "世界投胎 · 降生次数榜",
            seal: "寰宇",
            valueLabel: "次",
            tone: "jade",
            pick: (record) => record.birthResultsInWorld.length,
            selfUserId: userId,
          },
        );
        const hImg = h.image(buffer, `image/${config.imageType}`);
        if (
          !config.isTextToImageConversionEnabled &&
          isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq"
        ) {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
          return await sendMessage(
            session,
            `<@${userId}>`,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        }
        await sendMessage(
          session,
          hImg,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      },
    );

  ctx
    .command(
      "toutai.世界投胎排行榜.夭折次数 [maxLeaderboardDisplayCount:number]",
      "世界投胎夭折次数排行榜",
    )
    .action(
      async (
        { session },
        maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
      ) => {
        if (
          typeof maxLeaderboardDisplayCount !== "number" ||
          isNaN(maxLeaderboardDisplayCount) ||
          maxLeaderboardDisplayCount < 0
        ) {
          return "📜 榜单人数须是不小于 0 的数字，请重新输入。";
        }
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const buffer = await generateRankingsImage(
          toutaiRecords,
          maxLeaderboardDisplayCount,
          {
            title: "世界投胎 · 夭折次数榜",
            seal: "长夜",
            valueLabel: "次",
            tone: "cinnabar",
            pick: (record) => record.numberOfStillbirthsInWorld,
            selfUserId: userId,
          },
        );
        const hImg = h.image(buffer, `image/${config.imageType}`);
        if (
          !config.isTextToImageConversionEnabled &&
          isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq"
        ) {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
          return await sendMessage(
            session,
            `<@${userId}>`,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        }
        await sendMessage(
          session,
          hImg,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      },
    );

  const continents = [
    "非洲",
    "欧洲",
    "亚洲",
    "北美洲",
    "南美洲",
    "大洋洲",
    "南极洲",
  ];
  continents.forEach((continent) => {
    ctx
      .command(
        `toutai.世界投胎排行榜.${continent} [maxLeaderboardDisplayCount:number]`,
        `世界投胎${continent}次数排行榜`,
      )
      .action(
        async (
          { session },
          maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
        ) => {
          if (
            typeof maxLeaderboardDisplayCount !== "number" ||
            isNaN(maxLeaderboardDisplayCount) ||
            maxLeaderboardDisplayCount < 0
          ) {
            return "📜 榜单人数须是不小于 0 的数字，请重新输入。";
          }
          let { userId, username } = session;
          username = await getSessionUserName(session);
          await updateNameInPlayerRecord(session, userId, username);
          const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
            "toutai_records",
            {},
          );
          const buffer = await generateRankingsImage(
            toutaiRecords,
            maxLeaderboardDisplayCount,
            {
              title: `世界投胎 · ${continent}次数榜`,
              seal: "寰宇",
              valueLabel: "次",
              tone: "azure",
              pick: (record) =>
                record.birthResultsInWorld.filter(
                  (result) => result.dictContinent === continent,
                ).length,
              selfUserId: userId,
            },
          );
          const hImg = h.image(buffer, `image/${config.imageType}`);
          if (
            !config.isTextToImageConversionEnabled &&
            isQQOfficialRobotMarkdownTemplateEnabled &&
            session.platform === "qq"
          ) {
            await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
            return await sendMessage(
              session,
              `<@${userId}>`,
              `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
              2,
              false,
            );
          }
          await sendMessage(
            session,
            hImg,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        },
      );
  });

  ctx
    .command("toutai.改名 [newPlayerName:text]", "更改玩家名字")
    .action(async ({ session }, newPlayerName) => {
      const { userId, user } = session;
      const username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);

      newPlayerName = newPlayerName?.trim();
      if (!newPlayerName) {
        return sendMessage(
          session,
          `✍ 请写下新的名号。`,
          `投胎中国 投胎世界 改名`,
        );
      }

      if (
        !(
          config.isEnableQQOfficialRobotMarkdownTemplate &&
          session.platform === "qq" &&
          config.key &&
          config.customTemplateId
        )
      ) {
        return sendMessage(
          session,
          `✍ 并非 QQ 官方机器人，无需改名。`,
          `改名`,
        );
      }

      if (newPlayerName.length > 20) {
        return sendMessage(
          session,
          `✍ 名号过长（至多 20 字），请另择一个。`,
          `投胎中国 投胎世界 改名`,
        );
      }

      if (newPlayerName.includes("@everyone")) {
        return sendMessage(
          session,
          `✍ 此名号不合规矩，请另择一个。`,
          `投胎中国 投胎世界 改名`,
        );
      }

      if (config.isUsingUnifiedKoishiBuiltInUsername) {
        return handleUnifiedKoishiUsername(session, newPlayerName);
      } else {
        return handleCustomUsername(ctx, session, userId, newPlayerName);
      }
    });

  async function handleUnifiedKoishiUsername(session, newPlayerName) {
    newPlayerName = h
      .transform(newPlayerName, { text: true, default: false })
      .trim();

    const users = await ctx.database.get("user", {});
    if (users.some((user) => user.name === newPlayerName)) {
      return sendMessage(session, `✍ 此名号已被他人占去，请另择一个。`, `改名`);
    }

    try {
      session.user.name = newPlayerName;
      await session.user.$update();
      return sendMessage(
        session,
        `✍ 名号已改 ——「${newPlayerName}」`,
        `查询玩家记录 开始游戏 改名`,
        2,
      );
    } catch (error) {
      if (RuntimeError.check(error, "duplicate-entry")) {
        return sendMessage(
          session,
          `✍ 此名号已被他人占去，请另择一个。`,
          `改名`,
        );
      } else {
        logger.warn(error);
        return sendMessage(session, `✍ 名号更改失败，请稍后再试。`, `改名`);
      }
    }
  }

  async function handleCustomUsername(ctx, session, userId, newPlayerName) {
    const players = await ctx.database.get("toutai_records", {});
    if (players.some((player) => player.username === newPlayerName)) {
      return sendMessage(
        session,
        `✍ 此名号已被他人占去，请另择一个。`,
        `投胎中国 投胎世界 改名`,
      );
    }

    const userRecord = await ctx.database.get("toutai_records", { userId });
    if (userRecord.length === 0) {
      await ctx.database.create("toutai_records", {
        userId,
        username: newPlayerName,
      });
    } else {
      await ctx.database.set(
        "toutai_records",
        { userId },
        { username: newPlayerName },
      );
    }
    return await sendMessage(
      session,
      `✍ 名号已改 ——「${newPlayerName}」`,
      `投胎中国 投胎世界 改名`,
      2,
    );
  }

  function simulateRebirthInWorld(
    worldData: WorldBirthrateData[],
  ): string | null {
    const randomValue = Math.random();

    let selectedCountry: WorldBirthrateData = null;

    while (!selectedCountry) {
      const randomIndex = Math.floor(Math.random() * worldData.length);
      const selected = worldData[randomIndex];

      if (selected.birthRatePercentage * 100 > randomValue) {
        selectedCountry = selected;
      }
    }

    return selectedCountry ? selectedCountry.name : null;
  }

  /** 在全体玩家中求名次：比自己高的人数 + 1，同分并列。 */
  function rankAmong(
    toutaiRecords: ToutaiRecord[],
    userId: string,
    pick: (record: ToutaiRecord) => number,
  ): number {
    const self = toutaiRecords.find((record) => record.userId === userId);
    if (!self) return -1;

    const own = pick(self);
    if (own <= 0) return -1;

    return (
      toutaiRecords.filter((record) => pick(record) > own).length + 1
    );
  }

  function getWorldRanking(
    toutaiRecords: ToutaiRecord[],
    userId: string,
  ): {
    numberOfStillbirthsRank: number;
    birthResultsRank: number;
  } {
    return {
      numberOfStillbirthsRank: rankAmong(
        toutaiRecords,
        userId,
        (record) => record.numberOfStillbirthsInWorld,
      ),
      birthResultsRank: rankAmong(
        toutaiRecords,
        userId,
        (record) => record.birthResultsInWorld.length,
      ),
    };
  }

  /** 统一的截图流程：等宽画布、二倍图、按内容高度裁切。 */
  async function capture(
    htmlContent: string,
    options: { width?: number; height?: number; fullPage?: boolean } = {},
  ): Promise<Buffer> {
    const width = options.width ?? CARD_WIDTH;
    const browser = ctx.puppeteer.browser;
    const browserContext = await browser.createBrowserContext();
    const page = await browserContext.newPage();
    try {
      await page.setViewport({
        width,
        height: options.height ?? 800,
        deviceScaleFactor: 2,
      });
      await page.goto(pageGotoFilePath);
      await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
      if (options.fullPage) {
        return await page.screenshot({ type: config.imageType, fullPage: true });
      }
      const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
      return await page.screenshot({
        type: config.imageType,
        clip: { x: 0, y: 0, width, height: bodyHeight },
      });
    } finally {
      await page.close();
      await browserContext.close();
    }
  }

  // 以下为「取数 → 排版 → 截图」的薄封装，排版逻辑见文件上方的 render* 函数。

  function generateChineseBirthGenderDistributionPieChart(
    username: string,
    birthResultsInChina: BirthResultInChina[],
  ) {
    return capture(renderGenderDistribution(username, birthResultsInChina));
  }

  function generateRankingsImage(
    toutaiRecords: ToutaiRecord[],
    maxLeaderboardDisplayCount: number,
    options: {
      title: string;
      seal: string;
      valueLabel: string;
      tone: Tone;
      pick: (record: ToutaiRecord) => number;
      selfUserId: string;
    },
  ) {
    return capture(
      renderRankings(toutaiRecords, maxLeaderboardDisplayCount, options),
    );
  }

  function generateBirthRegionHorizontalBarChartRankings(
    username: string,
    birthResultsInChina: BirthResultInChina[],
  ) {
    return capture(renderRegionDistribution(username, birthResultsInChina));
  }

  function generateTableImageFromBirthResultsInWorldArrayForUnfortunateDemiseRecords(
    username: string,
    unfortunateDemiseRecordsInWorld: UnfortunateDemiseRecordInWorld[],
  ) {
    return capture(
      renderWorldDemiseHistory(username, unfortunateDemiseRecordsInWorld),
    );
  }

  function generateTableImageFromBirthResultsInWorldArray(
    username: string,
    birthResultsInWorld: BirthResultInWorld[],
  ) {
    return capture(renderWorldBirthHistory(username, birthResultsInWorld));
  }

  function generateTableImageFromBirthResultsInChinaArray(
    username: string,
    birthResultsInChina: BirthResultInChina[],
  ) {
    return capture(renderChinaBirthHistory(username, birthResultsInChina));
  }

  function generateWorldBirthOverviewTableImage(
    username: string,
    analysisResult,
    userRank: number,
    userStillbirthsRank: number,
    numberOfStillbirths: number,
  ) {
    return capture(
      renderWorldOverview(
        username,
        analysisResult,
        userRank,
        userStillbirthsRank,
        numberOfStillbirths,
      ),
    );
  }

  function generateChinaBirthOverviewTableImage(
    username: string,
    analysisResult,
    userRank: number,
    userStillbirthsRank: number,
    numberOfStillbirthsInChina: number,
  ) {
    return capture(
      renderChinaOverview(
        username,
        analysisResult,
        userRank,
        userStillbirthsRank,
        numberOfStillbirthsInChina,
      ),
    );
  }

  function generateFirstChineseReincarnationRecordTableImage(
    username: string,
    birthResultsInChina: BirthResultInChina[],
  ) {
    return capture(
      renderFirstAppearance(username, birthResultsInChina, totalProvinceCount),
    );
  }

  function generateWorldMap(
    birthResultInWorld: BirthResultInWorld,
    username: string,
  ) {
    return capture(
      renderWorldMap(birthResultInWorld, username, world, worldData),
    );
  }

  function generateChinaMap(
    birthResults: BirthResultInChina[],
    birthResult: BirthResultInChina,
    username: string,
  ) {
    return capture(
      renderChinaMap(
        birthResults,
        birthResult,
        username,
        ChinaData,
        totalProvinceCount,
      ),
    );
  }

  async function processTargetUser(
    session: any,
    userId: string,
    username: string,
    targetUser: string,
  ): Promise<{
    targetUserRecord: ToutaiRecord[];
    targetUserId: string;
  }> {
    let targetUserRecord: ToutaiRecord[] = [];
    let targetUserId: string = userId;
    let targetUsername = username;

    if (!targetUser) {
      targetUserRecord = await ctx.database.get("toutai_records", { userId });
    } else {
      targetUser = await replaceAtTags(session, targetUser);

      if (
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        targetUserRecord = await ctx.database.get("toutai_records", {
          username: targetUser,
        });

        if (targetUserRecord.length === 0) {
          targetUserRecord = await ctx.database.get("toutai_records", {
            userId: targetUser,
          });

          if (targetUserRecord.length !== 0) {
            targetUserId = targetUser;
          }
        } else {
          targetUserId = targetUserRecord[0].userId;
        }
      } else {
        const userIdRegex = /<at id="([^"]+)"(?: name="([^"]+)")?\/>/;
        const match = targetUser.match(userIdRegex);
        targetUserId = match?.[1] ?? userId;
        targetUsername = match?.[2] ?? username;

        if (targetUserId === userId) {
          targetUserRecord = await ctx.database.get("toutai_records", {
            userId: targetUser,
          });

          if (targetUserRecord.length !== 0) {
            targetUserId = targetUser;
          }
        } else {
          targetUserRecord = await ctx.database.get("toutai_records", {
            userId: targetUserId,
          });
        }
      }
    }

    return { targetUserRecord, targetUserId };
  }

  function getChinaStillbirthsRanking(
    toutaiRecords: ToutaiRecord[],
    userId: string,
  ): number {
    return rankAmong(
      toutaiRecords,
      userId,
      (record) => record.numberOfStillbirthsInChina,
    );
  }

  function getUserRankInChinaBirthResults(
    toutaiRecords: ToutaiRecord[],
    userId: string,
  ): number {
    return rankAmong(
      toutaiRecords,
      userId,
      (record) => record.birthResultsInChina.length,
    );
  }

  /** 出现次数最多的一项，用于「最常降生」。 */
  function mostFrequent(counts: { [key: string]: number }): {
    name: string;
    count: number;
  } {
    let best = { name: "", count: 0 };
    for (const [name, count] of Object.entries(counts)) {
      if (count > best.count) best = { name, count };
    }
    return best;
  }

  function analyzeWorldBirthResults(birthResultsInWorld: BirthResultInWorld[]) {
    const totalCount = birthResultsInWorld.length;
    const dictContinentCounts: { [key: string]: number } = {
      非洲: 0,
      亚洲: 0,
      欧洲: 0,
      北美洲: 0,
      南美洲: 0,
      大洋洲: 0,
      南极洲: 0,
    };
    const countryCounts: { [key: string]: number } = {};

    for (const result of birthResultsInWorld) {
      if (dictContinentCounts.hasOwnProperty(result.dictContinent)) {
        dictContinentCounts[result.dictContinent]++;
      }
      countryCounts[result.dictName] = (countryCounts[result.dictName] || 0) + 1;
    }

    return {
      totalCount,
      dictContinentCounts,
      uniqueCountries: Object.keys(countryCounts).length,
      favourite: mostFrequent(countryCounts),
    };
  }

  function analyzeChinaBirthResults(birthResultsInChina: BirthResultInChina[]) {
    const totalCount = birthResultsInChina.length;

    const orderCounts = {
      一: 0,
      二: 0,
      三: 0,
      四: 0,
      五及以上: 0,
    };

    const genderCounts = {
      male: 0,
      female: 0,
    };

    const categoryCounts = {
      城镇: 0,
      城市: 0,
      乡村: 0,
    };

    const provinceCounts: { [key: string]: number } = {};

    for (const result of birthResultsInChina) {
      provinceCounts[result.province] =
        (provinceCounts[result.province] || 0) + 1;

      // 统计 order
      switch (result.order) {
        case "一":
          orderCounts.一++;
          break;
        case "二":
          orderCounts.二++;
          break;
        case "三":
          orderCounts.三++;
          break;
        case "四":
          orderCounts.四++;
          break;
        default:
          orderCounts["五及以上"]++;
          break;
      }

      // 统计 gender
      if (result.gender === "male") {
        genderCounts.male++;
      } else {
        genderCounts.female++;
      }

      // 统计 category
      switch (result.category) {
        case "城镇":
          categoryCounts.城镇++;
          break;
        case "城市":
          categoryCounts.城市++;
          break;
        case "乡村":
          categoryCounts.乡村++;
          break;
      }
    }

    return {
      totalCount,
      orderCounts,
      genderCounts,
      categoryCounts,
      uniqueProvinces: Object.keys(provinceCounts).length,
      favourite: mostFrequent(provinceCounts),
    };
  }

  async function replaceAtTags(session, content: string): Promise<string> {
    // 正则表达式用于匹配 at 标签
    const atRegex = /<at id="(\d+)"(?: name="([^"]*)")?\/>/g;

    // 匹配所有 at 标签
    let match;
    while ((match = atRegex.exec(content)) !== null) {
      const userId = match[1];
      const name = match[2];

      // 如果 name 不存在，根据 userId 获取相应的 name
      if (!name) {
        let guildMember;
        try {
          guildMember = await session.bot.getGuildMember(
            session.guildId,
            userId,
          );
        } catch (error) {
          guildMember = {
            user: {
              name: "未知用户",
            },
          };
        }

        // 替换原始的 at 标签
        const newAtTag = `<at id="${userId}" name="${guildMember.user.name}"/>`;
        content = content.replace(match[0], newAtTag);
      }
    }

    return content;
  }

  function calculateTimeDifference(
    previousTimestamp: number,
    currentTimestamp: number,
  ): number {
    return (currentTimestamp - previousTimestamp) / 1000;
  }

  function simulateRebirth(neonatalMortalityRate: number): boolean {
    // 新生儿死亡率，以小数形式表示（例如，3.19% 为 0.0319）
    neonatalMortalityRate = neonatalMortalityRate / 100;

    // 新生儿的命运
    const randomValue = Math.random();

    if (randomValue < neonatalMortalityRate) {
      return false;
    } else {
      return true;
    }
  }

  async function updateNameInPlayerRecord(
    session: any,
    userId: string,
    username: string,
  ): Promise<void> {
    const userRecord = await ctx.database.get("toutai_records", { userId });

    if (userRecord.length === 0) {
      await ctx.database.create("toutai_records", {
        userId,
        username,
      });
      return;
    }

    const existingRecord = userRecord[0];
    let isChange = false;

    if (
      username !== existingRecord.username &&
      (!(
        isQQOfficialRobotMarkdownTemplateEnabled && session.platform === "qq"
      ) ||
        (isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq" &&
          config.isUsingUnifiedKoishiBuiltInUsername))
    ) {
      existingRecord.username = username;
      isChange = true;
    }

    if (isChange) {
      await ctx.database.set(
        "toutai_records",
        { userId },
        {
          username: existingRecord.username,
        },
      );
    }
  }

  async function getSessionUserName(session: any): Promise<string> {
    let sessionUserName = session.username;

    if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === "qq") {
      const [user] = await ctx.database.get("user", { id: session.user.id });
      if (config.isUsingUnifiedKoishiBuiltInUsername && user.name) {
        sessionUserName = user.name;
      } else {
        let userRecord = await ctx.database.get("toutai_records", {
          userId: session.userId,
        });

        if (userRecord.length === 0) {
          await ctx.database.create("toutai_records", {
            userId: session.userId,
            username: sessionUserName,
          });

          userRecord = await ctx.database.get("toutai_records", {
            userId: session.userId,
          });
        }
        sessionUserName = userRecord[0].username;
      }
    }

    return sessionUserName;
  }

  function isSpecialProvince(province: string): boolean {
    return ["xiang_gang", "ao_men", "tai_wan"].includes(province);
  }

  function simulateBirthInChina(): BirthResultInChina {
    const randomNumber = Math.random() * totalPopulation;

    let cumulativePopulation = 0;
    for (const region of birthrateDetailedData) {
      if (region.name === "national") continue;
      for (const category of ["town", "city", "countryside"] as const) {
        for (const order of [
          "one",
          "two",
          "three",
          "four",
          "fivePlus",
        ] as const) {
          for (const gender of ["male", "female"] as const) {
            let population = region[category][order][gender];
            if (!isSpecialProvince(region.name)) {
              population *= 10;
            }
            cumulativePopulation += population;
            if (cumulativePopulation > randomNumber) {
              const probability = population / totalPopulation;
              return {
                id: region.id,
                province: region.displayName,
                gender: gender,
                category:
                  category === "town"
                    ? "城镇"
                    : category === "city"
                      ? "城市"
                      : "乡村",
                order:
                  order === "one"
                    ? "一"
                    : order === "two"
                      ? "二"
                      : order === "three"
                        ? "三"
                        : order === "four"
                          ? "四"
                          : "五及以上",
                probability: probability,
              };
            }
          }
        }
      }
    }

    return {
      id: 0,
      province: "",
      gender: "",
      category: "",
      order: "",
      probability: 0,
    };
  }

  function parseMarkdownCommands(markdownCommands: string): string[] {
    return markdownCommands
      .split(" ")
      .filter((command) => command.trim() !== "");
  }

  async function createButtons(session: any, markdownCommands: string) {
    const commands = parseMarkdownCommands(markdownCommands);

    const mapCommandToDataValue = (command: string) => {
      const commandMappings: Record<string, string> = {
        投胎中国: "toutai.投胎中国",
        投胎世界: "toutai.投胎世界",
        改名: "toutai.改名",
        中国投胎记录: "toutai.中国投胎记录",
        中国投胎成功历史: "toutai.中国投胎记录.成功历史",
        中国投胎地区分布: "toutai.中国投胎记录.地区分布",
        中国投胎性别分布: "toutai.中国投胎记录.性别分布",
        中国投胎第一次出现记录: "toutai.中国投胎记录.第一次出现",
        中国投胎记录总览: "toutai.中国投胎记录.总览",
        世界投胎记录: "toutai.世界投胎记录",
        世界投胎成功历史: "toutai.世界投胎记录.成功历史",
        世界投胎夭折历史: "toutai.世界投胎记录.夭折历史",
        世界投胎记录总览: "toutai.世界投胎记录.总览",
        投胎中国排行榜: "toutai.中国投胎排行榜",
        中国投胎成功次数: "toutai.中国投胎排行榜.成功次数",
        中国投胎夭折次数: "toutai.中国投胎排行榜.夭折次数",
        中国投胎男孩次数: "toutai.中国投胎排行榜.男孩次数",
        中国投胎女孩次数: "toutai.中国投胎排行榜.女孩次数",
        投胎世界排行榜: "toutai.世界投胎排行榜",
        世界投胎成功次数: "toutai.世界投胎排行榜.成功次数",
        世界投胎夭折次数: "toutai.世界投胎排行榜.夭折次数",
        世界投胎亚洲次数: "toutai.世界投胎排行榜.亚洲",
        世界投胎欧洲次数: "toutai.世界投胎排行榜.欧洲",
        世界投胎非洲次数: "toutai.世界投胎排行榜.非洲",
        世界投胎北美洲次数: "toutai.世界投胎排行榜.北美洲",
        世界投胎南极洲次数: "toutai.世界投胎排行榜.南极洲",
        世界投胎大洋洲次数: "toutai.世界投胎排行榜.大洋洲",
        世界投胎南美洲次数: "toutai.世界投胎排行榜.南美洲",
      };

      return commandMappings[command];
    };

    const createButton = async (command: string) => {
      let dataValue = mapCommandToDataValue(command);
      if (dataValue === undefined) {
        dataValue = command;
      }

      return {
        render_data: {
          label: command,
          visited_label: command,
          style: 1,
        },
        action: {
          type: 2,
          permission: { type: 2 },
          data: `${dataValue}`,
          enter: !["改名"].includes(command),
        },
      };
    };

    const buttonPromises = commands.map(createButton);
    return Promise.all(buttonPromises);
  }

  let sentMessages = [];
  const msgSeqMap: { [msgId: string]: number } = {};

  async function sendMessage(
    session: any,
    message: any,
    markdownCommands: string,
    numberOfMessageButtonsPerRow?: number,
    isAt: boolean = true,
    isButton: boolean = false,
  ): Promise<void> {
    numberOfMessageButtonsPerRow =
      numberOfMessageButtonsPerRow || config.numberOfMessageButtonsPerRow;
    const { bot, channelId, userId } = session;
    const username = await getSessionUserName(session);

    let messageId;
    let isPushMessageId = false;
    if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === "qq") {
      const msgSeq = msgSeqMap[session.messageId] || 10;
      msgSeqMap[session.messageId] = msgSeq + 100;
      const buttons = await createButtons(session, markdownCommands);

      const rows = [];
      let row = { buttons: [] };
      buttons.forEach((button, index) => {
        row.buttons.push(button);
        if (
          row.buttons.length === 5 ||
          index === buttons.length - 1 ||
          row.buttons.length === numberOfMessageButtonsPerRow
        ) {
          rows.push(row);
          row = { buttons: [] };
        }
      });

      if (!isButton && config.isTextToImageConversionEnabled) {
        const lines = message.toString().split("\n");
        const isOnlyImgTag =
          lines.length === 1 && lines[0].trim().startsWith("<img");
        if (isOnlyImgTag) {
          [messageId] = await session.send(message);
        } else {
          const modifiedMessage = toMarkdownLines(
            lines,
            config.shouldPrefixUsernameInMessageSending && isAt
              ? `@${username}`
              : undefined,
          );
          ctx.inject(["markdownToImage"], async (ctx) => {
            const imageBuffer =
              await ctx.markdownToImage.convertToImage(modifiedMessage);
            [messageId] = await session.send(
              h.image(imageBuffer, `image/${config.imageType}`),
            );
          });
        }
        if (config.retractDelay !== 0) {
          isPushMessageId = true;
          sentMessages.push(messageId);
        }

        if (config.isTextToImageConversionEnabled && markdownCommands !== "") {
          await sendMessage(
            session,
            "",
            markdownCommands,
            numberOfMessageButtonsPerRow,
            false,
            true,
          );
        }
      } else if (isButton && config.isTextToImageConversionEnabled) {
        const result = await session.qq.sendMessage(session.channelId, {
          msg_type: 2,
          msg_id: session.messageId,
          msg_seq: msgSeq,
          content: "",
          markdown: {
            custom_template_id: config.customTemplateId,
            params: [
              {
                key: config.key,
                values: [`<@${userId}>`],
              },
            ],
          },
          keyboard: {
            content: {
              rows: rows.slice(0, 5),
            },
          },
        });
        messageId = result.id;
      } else {
        if (message.attrs?.src || message.includes("<img")) {
          [messageId] = await session.send(message);
        } else {
          message = message.replace(/\n/g, "\r");
          if (config.shouldPrefixUsernameInMessageSending && isAt) {
            message = `<@${userId}>\r${message}`;
          }
          const result = await session.qq.sendMessage(session.channelId, {
            msg_type: 2,
            msg_id: session.messageId,
            msg_seq: msgSeq,
            content: "111",
            markdown: {
              custom_template_id: config.customTemplateId,
              params: [
                {
                  key: config.key,
                  values: [`${message}`],
                },
              ],
            },
            keyboard: {
              content: {
                rows: rows.slice(0, 5),
              },
            },
          });

          messageId = result.id;
        }
      }
    } else {
      if (config.isTextToImageConversionEnabled) {
        const lines = message.toString().split("\n");
        const isOnlyImgTag =
          lines.length === 1 && lines[0].trim().startsWith("<img");
        if (isOnlyImgTag) {
          [messageId] = await session.send(message);
        } else {
          const modifiedMessage = toMarkdownLines(
            lines,
            config.shouldPrefixUsernameInMessageSending && isAt
              ? `@${username}`
              : undefined,
          );
          ctx.inject(["markdownToImage"], async (ctx) => {
            const imageBuffer =
              await ctx.markdownToImage.convertToImage(modifiedMessage);
            [messageId] = await session.send(
              h.image(imageBuffer, `image/${config.imageType}`),
            );
          });
        }
      } else {
        if (config.shouldPrefixUsernameInMessageSending && isAt) {
          message = `${h.at(userId)} ~\n${message}`;
        }
        [messageId] = await session.send(message);
      }
    }

    if (config.retractDelay === 0) return;
    if (!isPushMessageId) {
      sentMessages.push(messageId);
    }

    if (sentMessages.length > 1) {
      const oldestMessageId = sentMessages.shift();
      setTimeout(async () => {
        await bot.deleteMessage(channelId, oldestMessageId);
      }, config.retractDelay * 1000);
    }
  }
}
