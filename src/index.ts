import { MAP_COLORS, HEAT_RAMP, heatColor } from './map-theme'
import { SCHEME, SEAL, TONE_CSS, toneRoles, type Tone } from './theme'
import { present } from './ux'
import { helpOf } from './help'
import { Context, h, Schema } from "koishi";
import {} from "koishi-plugin-puppeteer";
import {
  baseline,
  components,
  ELEVATION,
  EMPHASIZED_WEIGHT,
  FONT_STACK,
} from "./m3";
import * as path from "path";
import * as fs from "fs";

export let name = "toutai";
export const inject = {
  required: ["database", "puppeteer"],
};
export const usage = `## 使用

发送 \`toutai.投胎中国\` 或 \`toutai.投胎世界\` 开始模拟。

## 指令

| 指令 | 说明 |
| --- | --- |
| \`toutai\` | 查看指令列表 |
| \`toutai.投胎中国\` | 开始中国模拟 |
| \`toutai.投胎世界\` | 开始世界模拟 |
| \`toutai.中国投胎记录\` / \`toutai.世界投胎记录\` | 查看记录 |
| \`toutai.中国投胎排行榜\` / \`toutai.世界投胎排行榜\` | 查看排行 |`;

export interface Config {
  defaultMaxDisplayCount: number;
  maxDisplayCount: number;
  nextReincarnationCooldownSeconds: number;

  shouldPrefixUsernameInMessageSending: boolean;
  retractDelay: number;
  isMapImageIncludedAfterRebirth: boolean;
  imageType: "png" | "jpeg" | "webp";
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    defaultMaxDisplayCount: Schema.number()
      .min(0)
      .default(20)
      .description("排行榜默认显示的人数，0 表示全部（仍受下面的上限约束）。"),
    maxDisplayCount: Schema.natural()
      .default(100)
      .description("排行榜最多显示的人数：指令后面的数字超过它按它出图，0 表示不设上限。"),
    nextReincarnationCooldownSeconds: Schema.number()
      .min(0)
      .default(60)
      .description(`两次投胎之间的冷却时间（秒）。`),
    shouldPrefixUsernameInMessageSending: Schema.boolean()
      .default(true)
      .description(`回复时 @ 用户。`),
    retractDelay: Schema.number()
      .min(0)
      .default(0)
      .description(
        `上一条消息的自动撤回延迟（秒），0 表示不撤回。同一频道只保留最新一条。`,
      ),
    isMapImageIncludedAfterRebirth: Schema.boolean()
      .default(true)
      .description(`投胎后附上一张地图。`),
    imageType: Schema.union(["png", "jpeg", "webp"])
      .default("png")
      .description(`发送的图片格式。`),
  }),
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
 *  一页暖白的纸，墨色正文。强色只给两样东西：朱印，和承载「生 / 殁 / 男 / 女」
 *  含义的色块；其余全部是纸面的明度层次（surface-container 系列），不靠色相取悦。
 *  配色取值见 theme.ts，形状、字阶、高度取自 m3.ts。
 *
 *  字号刻意比 M3 的手机基准大一档、最小 14px：聊天里的图会被缩到约一半宽再看，
 *  按 12px 排的脚注缩出来只剩 5 个点。节奏按 4px 栅格：色块之间 12、分栏之间 36、
 *  页边 40，同一类间距在所有版式里取同一个值。
 * ------------------------------------------------------------------ */

// 画布宽度（含 body 内边距），截图裁剪与视口共用此值。
const CARD_WIDTH = 820;

/** 地图上的文字取系统正文栈，与出图保持一致。 */
const MAP_FONT = FONT_STACK;
const ECHARTS_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js";

const BASE_CSS = `
${baseline(SCHEME)}
${components()}
${TONE_CSS}

html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }

/* 页底比纸深一档，纸才托得起来 */
body {
    margin: 0;
    padding: 24px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-font);
    font-size: 16px;
    line-height: 1.5;
    background-color: var(--md-sys-color-surface-container);
}

.sheet {
    width: 100%;
    max-width: ${CARD_WIDTH - 48}px;
    padding: 40px 36px 28px;
    background: var(--md-sys-color-surface-container-lowest);
    border-radius: var(--md-sys-shape-corner-extra-large-increased);
    box-shadow: ${ELEVATION[1]};
}

/* ---------- 题头 ---------- */
.masthead { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 32px; }
.masthead .text { flex: 1; min-width: 0; }

.eyebrow {
    margin: 0 0 8px;
    font-size: 15px;
    line-height: 20px;
    font-weight: ${EMPHASIZED_WEIGHT.label};
    letter-spacing: .12em;
    color: var(--md-sys-color-primary);
}

.title {
    margin: 0;
    font-size: 34px;
    line-height: 44px;
    font-weight: ${EMPHASIZED_WEIGHT.headline};
    letter-spacing: .01em;
    color: var(--md-sys-color-on-surface);
    overflow-wrap: anywhere;
}

.subtitle {
    margin: 10px 0 0;
    font-size: 17px;
    line-height: 26px;
    color: var(--md-sys-color-on-surface-variant);
}
.subtitle b { font-weight: ${EMPHASIZED_WEIGHT.label}; color: var(--md-sys-color-on-surface); overflow-wrap: anywhere; }
/* 间隔点只是装饰，用描边色即可（文字对比度不适用） */
.sep { margin: 0 8px; color: var(--md-sys-color-outline); }

.tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }

/* ---------- 朱印 ---------- */
/* 字号 × 行高 × 两行 = 52px，落在 64px 的印面内，不压边 */
.seal {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: var(--md-sys-shape-corner-large);
    background: ${SEAL.background};
    color: ${SEAL.foreground};
    outline: 1.5px solid rgba(255, 255, 255, .5);
    outline-offset: -5px;
    font-size: 24px;
    line-height: 26px;
    font-weight: ${EMPHASIZED_WEIGHT.title};
}

/* ---------- 分栏 ---------- */
.masthead + .section { margin-top: 0; }
.section + .section { margin-top: 36px; }

.sec-hd { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.sec-hd h2 { margin: 0; font-size: 22px; line-height: 28px; font-weight: ${EMPHASIZED_WEIGHT.title}; letter-spacing: .02em; color: var(--md-sys-color-on-surface); }
.sec-hd .aside { font-size: 15px; line-height: 20px; color: var(--md-sys-color-on-surface-variant); text-align: right; }

/* ---------- 数据卡 ---------- */
.grid { display: grid; gap: 12px; }
.grid + .grid { margin-top: 12px; }
.grid.c2 { grid-template-columns: repeat(2, 1fr); }
.grid.c3 { grid-template-columns: repeat(3, 1fr); }
.grid.c5 { grid-template-columns: repeat(5, 1fr); }

.stat {
    --track-bg: rgba(255, 255, 255, .65);
    display: flex;
    flex-direction: column;
    padding: 20px 22px 20px;
    background: var(--tone-container, var(--md-sys-color-surface-container-low));
    color: var(--on-tone, var(--md-sys-color-on-surface));
    border-radius: var(--md-sys-shape-corner-extra-large);
}

.stat .k { font-size: 16px; line-height: 22px; font-weight: ${EMPHASIZED_WEIGHT.label}; }

.stat .v {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 8px;
    font-size: 42px;
    line-height: 48px;
    font-weight: ${EMPHASIZED_WEIGHT.display};
    letter-spacing: -.01em;
}
.stat .v.text { font-size: 32px; line-height: 48px; letter-spacing: .02em; }
.stat .v small { font-size: 16px; line-height: 22px; font-weight: 500; letter-spacing: 0; }
.stat .note { margin-top: 4px; font-size: 15px; line-height: 22px; }
.stat.hero .v { font-size: 52px; line-height: 56px; }
.stat .meter { margin-top: auto; padding-top: 16px; }

.grid.c5 .stat { padding: 16px 14px 16px; border-radius: var(--md-sys-shape-corner-large-increased); }
.grid.c5 .stat .k { font-size: 15px; }
.grid.c5 .stat .v { font-size: 32px; line-height: 40px; }
.grid.c5 .stat .v small { font-size: 14px; }
.grid.c5 .stat .note { font-size: 14px; }

/* ---------- 比例条：填充与轨道是两块全圆角色块，中间留 4px 空隙 ---------- */
.track { display: flex; gap: 4px; width: 100%; height: 8px; }
.track i { display: block; height: 100%; border-radius: var(--md-sys-shape-corner-full); }
.track .fill { min-width: 8px; background: var(--tone, var(--md-sys-color-primary)); }
.track .rest { background: var(--track-bg, var(--md-sys-color-surface-container-highest)); }

/* ---------- 分段列表：每行一块圆角容器，行间 4px，不画分隔线 ---------- */
table.ledger { width: 100%; border-collapse: separate; border-spacing: 0 4px; margin: -4px 0; }

.ledger th {
    padding: 8px 14px 6px;
    font-size: 15px;
    line-height: 20px;
    font-weight: ${EMPHASIZED_WEIGHT.label};
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
}

.ledger td {
    --track-bg: var(--md-sys-color-surface-container-highest);
    height: 52px;
    padding: 0 14px;
    background: var(--md-sys-color-surface-container-low);
    color: var(--md-sys-color-on-surface);
    font-size: 18px;
    line-height: 26px;
    text-align: center;
    vertical-align: middle;
}
.ledger td:first-child { border-radius: var(--md-sys-shape-corner-large) 0 0 var(--md-sys-shape-corner-large); }
.ledger td:last-child { border-radius: 0 var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-large) 0; }
.ledger th.l, .ledger td.l { text-align: left; }
.ledger td.idx { font-size: 17px; font-weight: ${EMPHASIZED_WEIGHT.label}; color: var(--md-sys-color-on-surface-variant); }

.ledger tr.self td {
    --track-bg: rgba(255, 255, 255, .6);
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
}

/* 条形榜：名次、名字、条、数。名字列随最长的名字撑开，条列吃掉剩下的宽度，条的起点对齐 */
.bars td.no { min-width: 48px; padding: 0 8px 0 14px; text-align: right; font-size: 17px; font-weight: ${EMPHASIZED_WEIGHT.label}; color: var(--md-sys-color-on-surface-variant); }
.bars tr.self td.no { color: var(--md-sys-color-on-secondary-container); }
.bars td.name { padding: 0 8px 0 4px; text-align: left; white-space: nowrap; font-weight: 500; }
.bars td.bar { width: 100%; padding: 0 16px 0 14px; }
.bars td.val { padding: 0 18px 0 0; text-align: right; white-space: nowrap; font-size: 22px; font-weight: ${EMPHASIZED_WEIGHT.title}; }
.bars td.val small { margin-left: 4px; font-size: 15px; font-weight: 500; color: var(--md-sys-color-on-surface-variant); }
.bars tr.self td.val small { color: var(--md-sys-color-on-secondary-container); }
.bars td.pct { width: 64px; padding: 0 18px 0 0; text-align: right; font-size: 16px; color: var(--md-sys-color-on-surface-variant); }

.me-tag {
    display: inline-flex;
    align-items: center;
    height: 22px;
    margin-left: 8px;
    padding: 0 8px;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    font-size: 14px;
    font-style: normal;
    font-weight: ${EMPHASIZED_WEIGHT.label};
    vertical-align: middle;
}

/* 名次章：金银铜底色与前景由组件的 m3-badge--* 提供 */
.medal { width: 32px; height: 32px; font-size: 16px; }

/* ---------- 标签 ---------- */
.chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--tone-container, var(--md-sys-color-surface-container-highest));
    color: var(--on-tone, var(--md-sys-color-on-surface));
    font-size: 16px;
    line-height: 1;
    font-weight: ${EMPHASIZED_WEIGHT.label};
    white-space: nowrap;
    vertical-align: middle;
}
.chip.t-ink { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface); }
.chip .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tone); }
.chip.ghost { background: transparent; box-shadow: inset 0 0 0 1px var(--md-sys-color-outline-variant); color: var(--md-sys-color-on-surface-variant); font-weight: 500; }

/* ---------- 空态 ---------- */
.empty {
    padding: 44px 24px;
    border-radius: var(--md-sys-shape-corner-extra-large);
    background: var(--md-sys-color-surface-container-low);
    color: var(--md-sys-color-on-surface-variant);
    font-size: 17px;
    line-height: 30px;
    text-align: center;
}
.empty b { display: block; margin-bottom: 4px; font-size: 22px; line-height: 30px; color: var(--md-sys-color-on-surface); }

/* ---------- 版记 ---------- */
.colophon {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    margin-top: 36px;
    padding-top: 16px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    font-size: 14px;
    line-height: 20px;
    color: var(--md-sys-color-on-surface-variant);
}
.colophon .l { letter-spacing: .12em; }
`;

/** 用户可控文本一律转为全角，避免破坏版面（h.unescape 之后仍然安全）。 */
function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[<>&"']/g,
    (c) => ({ "<": "＜", ">": "＞", "&": "＆", '"': "＂", "'": "＇" })[c],
  );
}

/** 朱印：两个字，竖排。 */
function sealMarkup(text?: string): string {
  if (!text) return "";
  return `<div class="seal" aria-hidden="true">${[...text]
    .slice(0, 2)
    .map((c) => `<span>${c}</span>`)
    .join("")}</div>`;
}

interface PageOptions {
  docTitle: string;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** 题头下的一排标签（已拼好的 HTML）。 */
  tags?: string;
  seal?: string;
  body: string;
  colophonLeft?: string;
  colophonRight?: string;
  style?: string;
  head?: string;
  script?: string;
}

/** 统一的页面骨架：纸张、题头、版记。 */
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
    <header class="masthead">
        <div class="text">
            <p class="eyebrow">${o.eyebrow ?? "投胎模拟器"}</p>
            <h1 class="title">${o.title}</h1>
            ${o.subtitle ? `<p class="subtitle">${o.subtitle}</p>` : ""}
            ${o.tags ? `<div class="tags">${o.tags}</div>` : ""}
        </div>
        ${sealMarkup(o.seal)}
    </header>
    ${o.body}
    <footer class="colophon">
        <span class="l">${o.colophonLeft ?? "轮回簿"}</span>
        <span>${o.colophonRight ?? ""}</span>
    </footer>
</div>
${o.script ?? ""}
</body>
</html>`;
}

/** 题头副标题：「命主 某某 · 一句话」。 */
function subtitleOf(username: string, rest: string): string {
  return `命主 <b>${esc(username)}</b><span class="sep">·</span>${rest}`;
}

/** 分栏标题。 */
function section(title: string, body: string, aside = ""): string {
  return `<section class="section">
    <div class="sec-hd">
        <h2>${title}</h2>
        ${aside ? `<span class="aside">${aside}</span>` : ""}
    </div>
    ${body}
</section>`;
}

/** 比例条：ratio 取 0～1；超出收进范围，非数按 0。 */
function track(ratio: number): string {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const fill = r > 0 ? `<i class="fill" style="flex: ${r.toFixed(4)} 1 0"></i>` : "";
  const rest = r < 1 ? `<i class="rest" style="flex: ${(1 - r).toFixed(4)} 1 0"></i>` : "";
  return `<span class="track">${fill}${rest}</span>`;
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

/** 数据卡：标签、数值、注脚，可选底部比例条（总是贴着卡片底边，同一排的卡片条对齐）。 */
function statCard(o: StatOptions): string {
  // 数字用大字，省名这类文字值缩一档，免得撑破卡片
  const numeric = /^[\d.,]+%?$/.test(String(o.value));
  return `<div class="stat t-${o.tone ?? "ink"}${o.hero ? " hero" : ""}">
    <span class="k">${o.label}</span>
    <span class="v${numeric ? "" : " text"}">${o.value}${o.unit ? `<small>${o.unit}</small>` : ""}</span>
    ${o.note ? `<span class="note">${o.note}</span>` : ""}
    ${o.ratio === undefined ? "" : `<div class="meter">${track(o.ratio)}</div>`}
</div>`;
}

function chip(text: string, tone: Tone = "ink", withDot = false): string {
  return `<span class="chip t-${tone}">${withDot ? `<i class="dot"></i>` : ""}${text}</span>`;
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

/** 金银铜三种金属色由 m3-badge--gold / --silver / --bronze 提供。 */
const MEDAL_CLASS = ["", "m3-badge--gold", "m3-badge--silver", "m3-badge--bronze"];

function medal(rank: number): string {
  if (rank <= 3) {
    return `<span class="medal m3-badge ${MEDAL_CLASS[rank]}">${rank}</span>`;
  }
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

/**
 * 环图：段与段之间留缝、两端圆头（M3 新版进度环的样子）。
 * 圆头会向两端各多出半个线宽，所以每段的实线长度要减去「缝 + 线宽」。
 * 某一段太短放不下圆头时，整圈退回平头加细缝；只有一段时画整圈。
 */
function donut(
  parts: { value: number; color: string }[],
  center: string,
  caption: string,
): string {
  const R = 78;
  const W = 26;
  const C = 2 * Math.PI * R;
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const live = total > 0 ? parts.filter((part) => part.value > 0) : [];
  const round =
    live.length > 1 && live.every((part) => (part.value / total) * C - 8 - W > 4);

  let cursor = 0;
  const arcs = live
    .map((part) => {
      if (live.length === 1) {
        return `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${part.color}" stroke-width="${W}"></circle>`;
      }
      const span = (part.value / total) * C;
      const gap = round ? 8 : 3;
      const cap = round ? W : 0;
      const dash = span - gap - cap;
      const start = cursor + gap / 2 + cap / 2;
      cursor += span;
      return `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${part.color}" stroke-width="${W}"
            stroke-linecap="${round ? "round" : "butt"}"
            stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-start).toFixed(2)}"></circle>`;
    })
    .join("");

  return `<div class="donut">
    <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="${R}" fill="none" stroke="${SCHEME.surfaceContainerHigh}" stroke-width="${W}"></circle>
        <g transform="rotate(-90 100 100)">${arcs}</g>
    </svg>
    <div class="c"><b>${center}</b><span>${caption}</span></div>
</div>`;
}

/** 性别分布：环图加两张数据卡。 */
function renderGenderDistribution(
  username: string,
  birthResultsInChina: BirthResultInChina[],
): string {
  const total = birthResultsInChina.length;
  const male = birthResultsInChina.filter((r) => r.gender === "male").length;
  const female = total - male;
  const ratio = female ? (male / female).toFixed(2) : "—";

  const body = `
<div class="gender">
    ${donut(
      [
        { value: male, color: toneRoles("azure").solid },
        { value: female, color: toneRoles("rose").solid },
      ],
      String(total),
      "次降生",
    )}
    <div class="gender-side">
        ${statCard({
          label: "男孩",
          value: male,
          unit: "次",
          tone: "azure",
          note: `占 ${percentText(male, total)}`,
          ratio: total ? male / total : 0,
        })}
        ${statCard({
          label: "女孩",
          value: female,
          unit: "次",
          tone: "rose",
          note: `占 ${percentText(female, total)}`,
          ratio: total ? female / total : 0,
        })}
        <p class="ratio">性别比　男 <b>${ratio}</b> ： 女 <b>1.00</b></p>
    </div>
</div>`;

  return buildPage({
    docTitle: "中国投胎性别分布",
    title: "中国投胎 · 性别分布",
    subtitle: subtitleOf(username, "阴阳各半，皆是缘法"),
    seal: "阴阳",
    body: section("男女之数", body, `合计 ${total} 次`),
    colophonRight: `男 ${male} · 女 ${female}`,
    style: `
.gender { display: flex; align-items: center; gap: 32px; }
.donut { position: relative; flex: none; width: 248px; height: 248px; }
.donut svg { display: block; width: 100%; height: 100%; }
.donut .c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.donut .c b { font-size: 56px; line-height: 60px; font-weight: ${EMPHASIZED_WEIGHT.display}; letter-spacing: -.01em; }
.donut .c span { font-size: 16px; line-height: 22px; color: var(--md-sys-color-on-surface-variant); }
.gender-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.ratio { margin: 4px 0 0; text-align: center; font-size: 16px; line-height: 24px; color: var(--md-sys-color-on-surface-variant); }
.ratio b { font-size: 20px; font-weight: ${EMPHASIZED_WEIGHT.title}; color: var(--md-sys-color-on-surface); }
`,
  });
}

interface RankingOptions {
  title: string;
  seal: string;
  valueLabel: string;
  tone: Tone;
  pick: (record: ToutaiRecord) => number;
  selfUserId: string;
  /** 空榜与文本兜底里给用户的下一步指令。 */
  tip: string;
}

/**
 * 排行榜的计分与排序：图与文本兜底共用这一份，两条通道的名次才对得上。
 * 并列同名次（1、1、3）：与总览里「第 N 位」的算法一致，奖牌也跟着并列走。
 */
export function rankRows(
  toutaiRecords: ToutaiRecord[],
  pick: (record: ToutaiRecord) => number,
): { userId: string; username: string; value: number; rank: number }[] {
  const sorted = toutaiRecords
    .map((record) => ({
      userId: record.userId,
      username: record.username,
      value: pick(record),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || row.value !== sorted[index - 1].value) rank = index + 1;
    return { ...row, rank };
  });
}

/**
 * 这一张榜列多少名：指令给了就用指令的，没给用默认值；再收进上限。
 *
 * 0 表示「全部」：有上限就列到上限为止，上限也是 0 才真的全部列出（返回 Infinity，
 * 交给 `slice` 用）。从前默认值配 0 时，图片榜 `slice(0, 0)` 出的是一张空榜。
 */
function displayLimit(requested: number | undefined, fallback: number, max: number) {
  const n = requested ?? fallback;
  if (n <= 0) return max > 0 ? max : Infinity;
  return max > 0 ? Math.min(n, max) : n;
}

/** 排行榜：名次、玩家、条形长短与次数。 */
function renderRankings(
  toutaiRecords: ToutaiRecord[],
  count: number,
  options: RankingOptions,
): string {
  const scored = rankRows(toutaiRecords, options.pick);

  const rows = scored.slice(0, count);
  const top = rows[0]?.value ?? 1;
  const selfRank =
    scored.find((row) => row.userId === options.selfUserId)?.rank ?? 0;

  const list = rows
    .map((row) => {
      const isSelf = row.userId === options.selfUserId;
      return `<tr class="t-${options.tone}${isSelf ? " self" : ""}">
    <td class="no">${medal(row.rank)}</td>
    <td class="name">${esc(trimUsername(row.username))}${isSelf ? `<i class="me-tag">你</i>` : ""}</td>
    <td class="bar">${track(row.value / top)}</td>
    <td class="val">${row.value}<small>${options.valueLabel}</small></td>
</tr>`;
    })
    .join("");

  return buildPage({
    docTitle: options.title,
    title: options.title,
    subtitle: subtitleLine(
      `列位共 ${scored.length} 人`,
      selfRank > 0 ? `阁下位居第 ${selfRank}` : "阁下尚未上榜",
    ),
    seal: options.seal,
    body: section(
      "名次录",
      rows.length
        ? `<table class="ledger bars"><tbody>${list}</tbody></table>`
        : `<div class="empty"><b>榜上无名</b>尚无人在此留下痕迹。<br>发送「${options.tip}」走出第一个名字。</div>`,
      rows.length ? `前 ${rows.length} 位` : "",
    ),
    colophonRight: rows.length
      ? `榜首 ${esc(trimUsername(rows[0].username))} · ${rows[0].value} ${options.valueLabel}`
      : "虚位以待",
  });
}

/** 不带「命主」前缀的副标题：几段话用间隔点连起来。 */
function subtitleLine(...parts: string[]): string {
  return parts.join(`<span class="sep">·</span>`);
}

/** 各省降生次数，从多到少。图与文本兜底共用。 */
function provinceCounts(
  birthResultsInChina: BirthResultInChina[],
): [string, number][] {
  const counts: { [province: string]: number } = {};
  for (const result of birthResultsInChina) {
    counts[result.province] = (counts[result.province] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

/** 分布条形表的一行：序号、名称、比例条、次数、占比。 */
function distributionRow(
  index: number,
  name: string,
  count: number,
  top: number,
  total: number,
): string {
  return `<tr class="t-ink">
    <td class="no">${index}</td>
    <td class="name">${name}</td>
    <td class="bar">${track(top ? count / top : 0)}</td>
    <td class="val">${count}<small>次</small></td>
    <td class="pct">${percentText(count, total)}</td>
</tr>`;
}

/** 地区分布：省份条形榜。 */
function renderRegionDistribution(
  username: string,
  birthResultsInChina: BirthResultInChina[],
): string {
  const total = birthResultsInChina.length;
  const sorted = provinceCounts(birthResultsInChina);
  const top = sorted[0]?.[1] ?? 1;

  const bars = sorted
    .map(([province, count], index) =>
      distributionRow(index + 1, province, count, top, total),
    )
    .join("");

  return buildPage({
    docTitle: "中国投胎地区分布",
    title: "中国投胎 · 地区分布",
    subtitle: subtitleOf(username, `足迹遍及 ${sorted.length} 省`),
    seal: "山河",
    body: section(
      "省份之分",
      `<table class="ledger bars"><tbody>${bars}</tbody></table>`,
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
    <td>${chip(record.dictContinent, "cinnabar")}</td>
    <td class="l">${record.dictName}</td>
</tr>`,
    )
    .join("");

  return buildPage({
    docTitle: "世界投胎夭折历史",
    title: "世界投胎 · 夭折历史",
    subtitle: subtitleOf(username, "未及睁眼，已别人间"),
    seal: "长夜",
    body: section(
      "殁者名录",
      `<table class="ledger">
    <thead><tr><th width="22%">次第</th><th width="34%">大洲</th><th class="l" width="44%">国度</th></tr></thead>
    <tbody>${rows}</tbody>
</table>`,
      `近 ${unfortunateDemiseRecordsInWorld.length} 笔`,
    ),
    colophonLeft: "轮回簿 · 殁",
    colophonRight: "愿来世安稳",
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
    <td class="l">${record.dictName}</td>
</tr>`,
    )
    .join("");

  return buildPage({
    docTitle: "世界投胎成功历史",
    title: "世界投胎 · 降生纪年",
    subtitle: subtitleOf(username, "山南水北，皆曾为家"),
    seal: "寰宇",
    body: section(
      "降生名录",
      `<table class="ledger">
    <thead><tr><th width="22%">次第</th><th width="34%">大洲</th><th class="l" width="44%">国度</th></tr></thead>
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
    <td>${record.province}</td>
    <td>${record.category ? chip(record.category, "ink") : "—"}</td>
    <td>${record.order ? orderText(record.order) : "—"}</td>
</tr>`,
    )
    .join("");

  return buildPage({
    docTitle: "中国投胎成功历史",
    title: "中国投胎 · 降生纪年",
    subtitle: subtitleOf(username, "一纸命簿，半生浮沉"),
    seal: "降生",
    body: section(
      "降生名录",
      `<table class="ledger">
    <thead><tr><th width="14%">次第</th><th width="17%">性别</th><th width="25%">省份</th><th width="22%">城乡</th><th width="22%">胎次</th></tr></thead>
    <tbody>${rows}</tbody>
</table>`,
      `近 ${birthResultsInChina.length} 笔`,
    ),
    colophonRight: "自新至旧，依序而列",
  });
}

/** 生死之数：降生 / 夭折 / 存活率三张大卡，世界与中国总览共用。 */
function lifeAndDeathCards(
  totalCount: number,
  stillbirths: number,
  userRank: number,
  userStillbirthsRank: number,
): string {
  const attempts = totalCount + stillbirths;
  return `<div class="grid c3">
    ${statCard({
      label: "降生",
      value: totalCount,
      unit: "次",
      tone: "jade",
      note: rankText(userRank),
      hero: true,
    })}
    ${statCard({
      label: "夭折",
      value: stillbirths,
      unit: "次",
      tone: "cinnabar",
      note: rankText(userStillbirthsRank),
      hero: true,
    })}
    ${statCard({
      label: "存活率",
      value: percentText(totalCount, attempts),
      tone: "gold",
      note: `共叩门 ${attempts} 次`,
      hero: true,
    })}
</div>`;
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
  const visited = Object.values(counts).filter((value) => value > 0).length;

  const footprint = `<div class="grid c2">
    ${statCard({
      label: "履及之国",
      value: uniqueCountries,
      unit: "国",
      tone: "ink",
      note: `遍及 ${visited} 洲`,
    })}
    ${statCard({
      label: "最常降生",
      value: favourite.name || "—",
      tone: "ink",
      note: favourite.count
        ? `${favourite.count} 次 · 占 ${percentText(favourite.count, totalCount)}`
        : "",
    })}
</div>`;

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[1] ?? 0;
  const continents = sorted
    .map(([continent, count], index) =>
      distributionRow(index + 1, continent, count, top, totalCount),
    )
    .join("");

  return buildPage({
    docTitle: "世界投胎记录总览",
    title: "世界投胎 · 记录总览",
    subtitle: subtitleOf(username, `七洲之内，已履 ${visited} 洲`),
    seal: "寰宇",
    body: [
      section(
        "生死之数",
        lifeAndDeathCards(
          totalCount,
          numberOfStillbirths,
          userRank,
          userStillbirthsRank,
        ),
      ),
      section("行迹", footprint),
      section(
        "大洲分布",
        `<table class="ledger bars"><tbody>${continents}</tbody></table>`,
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
  totalProvinces: number,
): string {
  const {
    totalCount,
    orderCounts,
    genderCounts,
    categoryCounts,
    uniqueProvinces,
    favourite,
  } = analysisResult;

  const region = `<div class="grid c3">
    ${(["城市", "城镇", "乡村"] as const)
      .map((key) =>
        statCard({
          label: key,
          value: categoryCounts[key],
          unit: "次",
          tone: "ink",
          note: `占 ${percentText(categoryCounts[key], totalCount)}`,
          ratio: categoryCounts[key] / totalCount,
        }),
      )
      .join("")}
</div>
<div class="grid c2">
    ${statCard({
      label: "履及之省",
      value: uniqueProvinces,
      unit: "省",
      tone: "ink",
      note: totalProvinces ? `共 ${totalProvinces} 省 · 已踏足 ${percentText(uniqueProvinces, totalProvinces)}` : "",
      ratio: totalProvinces ? uniqueProvinces / totalProvinces : undefined,
    })}
    ${statCard({
      label: "最常降生",
      value: favourite.name || "—",
      tone: "ink",
      note: favourite.count
        ? `${favourite.count} 次 · 占 ${percentText(favourite.count, totalCount)}`
        : "",
      ratio: totalCount ? favourite.count / totalCount : 0,
    })}
</div>`;

  const gender = `<div class="grid c2">
    ${statCard({
      label: "男孩",
      value: genderCounts.male,
      unit: "次",
      tone: "azure",
      note: `占 ${percentText(genderCounts.male, totalCount)}`,
      ratio: genderCounts.male / totalCount,
    })}
    ${statCard({
      label: "女孩",
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
          label: key === "五及以上" ? "五及以上" : `第${key}胎`,
          value: orderCounts[key],
          unit: "次",
          tone: "ink",
          note: percentText(orderCounts[key], totalCount),
          ratio: orderCounts[key] / totalCount,
        }),
      )
      .join("")}
</div>`;

  return buildPage({
    docTitle: "中国投胎记录总览",
    title: "中国投胎 · 记录总览",
    subtitle: subtitleOf(username, "生死有数，去来有痕"),
    seal: "命簿",
    body: [
      section(
        "生死之数",
        lifeAndDeathCards(
          totalCount,
          numberOfStillbirthsInChina,
          userRank,
          userStillbirthsRank,
        ),
      ),
      section("城乡与山河", region),
      section("男女之数", gender),
      section("胎次", orders),
    ].join(""),
    colophonRight: `降生 ${totalCount} · 夭折 ${numberOfStillbirthsInChina}`,
  });
}

interface FirstAppearance {
  male: number | null;
  female: number | null;
}

const earliestAppearance = (entry: FirstAppearance) =>
  Math.min(entry.male ?? Infinity, entry.female ?? Infinity);

/** 各省男女各自的初见次序，按初见先后排列。图与文本兜底共用。 */
function provinceFirstAppearances(
  birthResultsInChina: BirthResultInChina[],
): [string, FirstAppearance][] {
  const first: { [province: string]: FirstAppearance } = {};

  for (const result of birthResultsInChina) {
    const entry = (first[result.province] ??= { male: null, female: null });
    if (result.gender === "male" && entry.male === null) {
      entry.male = result.index ?? null;
    } else if (result.gender === "female" && entry.female === null) {
      entry.female = result.index ?? null;
    }
  }

  return Object.entries(first).sort(
    (a, b) => earliestAppearance(a[1]) - earliestAppearance(b[1]),
  );
}

/** 中国投胎第一次出现：按初见先后排列的省份图鉴。 */
function renderFirstAppearance(
  username: string,
  birthResultsInChina: BirthResultInChina[],
  totalProvinceCount: number,
): string {
  const provinces = provinceFirstAppearances(birthResultsInChina);
  const earliest = earliestAppearance;

  // 列头已经写明男孩 / 女孩，格子里只写次序，颜色与列头一一对应
  const cell = (value: number | null, tone: Tone) =>
    value === null
      ? `<span class="chip ghost">未逢</span>`
      : chip(`第 ${value} 次`, tone, true);

  const rows = provinces
    .map(
      ([province, entry]) => `<tr>
    <td class="idx">${Number.isFinite(earliest(entry)) ? earliest(entry) : "—"}</td>
    <td>${province}</td>
    <td>${cell(entry.male, "azure")}</td>
    <td>${cell(entry.female, "rose")}</td>
</tr>`,
    )
    .join("");

  const unlocked = provinces.length;
  const remaining = Math.max(0, totalProvinceCount - unlocked);

  return buildPage({
    docTitle: "中国投胎第一次出现",
    title: "中国投胎 · 初见图鉴",
    subtitle: subtitleOf(username, `已踏足 ${unlocked} / ${totalProvinceCount} 省`),
    seal: "初见",
    body: section(
      "初见之序",
      `<div class="grid c1">${statCard({
        label: "图鉴进度",
        value: unlocked,
        unit: `/ ${totalProvinceCount} 省`,
        tone: "jade",
        note: remaining ? `尚余 ${remaining} 省未至` : "三十四省，尽数踏遍",
        ratio: totalProvinceCount ? unlocked / totalProvinceCount : 0,
      })}</div>
<table class="ledger dex">
    <thead><tr><th width="16%">初见</th><th width="24%">省份</th><th width="30%">男孩</th><th width="30%">女孩</th></tr></thead>
    <tbody>${rows}</tbody>
</table>`,
    ),
    colophonRight: `${unlocked} / ${totalProvinceCount}`,
    style: `
.grid.c1 { grid-template-columns: 1fr; margin-bottom: 20px; }
.grid.c1 .stat .v { font-size: 48px; }
`,
  });
}

/** 地图专用版式：题头 + 图版 + 图例带。 */
function buildMapPage(o: {
  docTitle: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  tags?: string;
  seal: string;
  chartHeight: number;
  legend: string;
  colophonRight: string;
  script: string;
}): string {
  return buildPage({
    docTitle: o.docTitle,
    eyebrow: o.eyebrow,
    title: o.title,
    subtitle: o.subtitle,
    tags: o.tags,
    seal: o.seal,
    body: `<div class="plate"><div id="map" role="img" aria-label="${esc(o.docTitle + ": " + o.title)}" style="width: 100%; height: ${o.chartHeight}px;"></div></div>
<div class="legend">${o.legend}</div>`,
    colophonRight: o.colophonRight,
    head: `<script src="${ECHARTS_CDN}"></script>`,
    script: `<script>${o.script}</script>`,
    style: `
.plate { border-radius: var(--md-sys-shape-corner-extra-large); overflow: hidden; background: ${MAP_COLORS.water}; }
.legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    margin-top: 20px;
    font-size: 16px;
    line-height: 24px;
    color: var(--md-sys-color-on-surface-variant);
}
.legend .key {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 16px 0 12px;
    border-radius: var(--md-sys-shape-corner-full);
    background: ${MAP_COLORS.selected};
    color: ${MAP_COLORS.onSelected};
    font-weight: ${EMPHASIZED_WEIGHT.label};
}
.legend .scale { display: inline-flex; align-items: center; gap: 10px; }
.legend .ramp { width: 96px; height: 12px; border-radius: var(--md-sys-shape-corner-full); background: linear-gradient(90deg, ${HEAT_RAMP}); box-shadow: inset 0 0 0 1px ${MAP_COLORS.boundary}; }
.legend .spacer { flex: 1; }
.legend b { font-weight: ${EMPHASIZED_WEIGHT.label}; color: var(--md-sys-color-on-surface); }
`,
  });
}

/**
 * 落点标记：定位针 + 靶心 + 一块朱砂底的名牌。
 * 针与靶心保证小省份、岛国在灰度下也找得到；名牌画在针脚下方，不压在省名上。
 */
const MAP_MARKER_JS = `
function marker(coord, text, chartHeight) {
    // 名牌默认在针脚下方；最南端的落点（海南）下方放不下，翻到针头上方
    var below = coord[1] + 16 + 36 <= chartHeight - 6;
    var children = [
        { type: 'circle', shape: { cx: 0, cy: 0, r: 7 }, style: { fill: '${MAP_COLORS.markerHalo}', stroke: '${MAP_COLORS.marker}', lineWidth: 2 } },
        { type: 'circle', shape: { cx: 0, cy: 0, r: 3 }, style: { fill: '${MAP_COLORS.marker}' } },
        {
            type: 'path',
            shape: {
                d: 'M16 0c-5.523 0-10 4.477-10 10 0 10 10 22 10 22s10-12 10-22c0-5.523-4.477-10-10-10zM16 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z',
                x: -9, y: -38, width: 18, height: 32
            },
            style: { fill: '${MAP_COLORS.marker}', stroke: '${MAP_COLORS.markerHalo}', lineWidth: 2 }
        }
    ];
    if (text) {
        children.push({
            type: 'text',
            style: {
                x: 0, y: below ? 16 : -46, text: text, textAlign: 'center', textVerticalAlign: below ? 'top' : 'bottom',
                fill: '${MAP_COLORS.onSelected}', backgroundColor: '${MAP_COLORS.selected}',
                padding: [5, 12], borderRadius: 10,
                fontSize: 16, fontWeight: 600, fontFamily: ${JSON.stringify(MAP_FONT)}
            }
        });
    }
    return { type: 'group', x: coord[0], y: coord[1], children: children };
}
`;

/** 经纬度读成人话：「南纬 9.2° · 西经 75.0°」。 */
function coordinateText([lng, lat]: [number, number]): string {
  return `${lat >= 0 ? "北纬" : "南纬"} ${Math.abs(lat).toFixed(1)}°<span class="sep">·</span>${lng >= 0 ? "东经" : "西经"} ${Math.abs(lng).toFixed(1)}°`;
}

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
        itemStyle: { areaColor: '${MAP_COLORS.land}', borderColor: '${MAP_COLORS.boundary}', borderWidth: 0.6 },
        regions: ${JSON.stringify(
          nameEn
            ? [
                {
                  name: nameEn,
                  itemStyle: {
                    areaColor: MAP_COLORS.selected,
                    borderColor: MAP_COLORS.selected,
                    borderWidth: 1.2,
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
            ]), ${JSON.stringify(birthResultInWorld.dictName)}, api.getHeight());
        }
    }]
});
`;

  return buildMapPage({
    docTitle: "世界投胎落点",
    eyebrow: "投胎模拟器 · 世界",
    title: birthResultInWorld.dictName,
    subtitle: subtitleOf(
      username,
      `第 ${birthResultInWorld.index} 次轮回 · 已落人间`,
    ),
    tags: chip(birthResultInWorld.dictContinent, "ink"),
    seal: "寰宇",
    chartHeight: 400,
    legend: `<span class="key"><i aria-hidden="true">◎</i>本次落点</span>
<span class="spacer"></span>
<span>${coordinateText(birthResultInWorld.coordinate)}</span>`,
    colophonRight: "天涯何处不为家",
    script,
  });
}

/** 港澳的省名标签错开的偏移量（像素）。 */
const SMALL_REGION_LABEL_OFFSET: Record<string, [number, number]> = {
  香港: [24, -4],
  澳门: [-24, 10],
};

function renderChinaMap(
  birthResults: BirthResultInChina[],
  birthResult: BirthResultInChina,
  username: string,
  chinaData: China,
  totalProvinceCount: number,
): string {
  // 足迹以赤金色阶呈现，本次落点用朱砂。
  const provinceWeights: { [province: string]: number } = {};
  for (const result of birthResults) {
    provinceWeights[result.province] =
      (provinceWeights[result.province] || 0) + result.probability;
  }

  const weights = Object.values(provinceWeights);
  const maxWeight = weights.length ? Math.max(...weights) : 0;

  const styles = new Map<string, any>();
  for (const [name, weight] of Object.entries(provinceWeights)) {
    if (name === birthResult.province) continue;
    styles.set(name, {
      name,
      itemStyle: { areaColor: heatColor(maxWeight ? weight / maxWeight : 0) },
      label: { color: MAP_COLORS.label },
    });
  }

  // 落点省自己的名字交给标记上的名牌（有朱砂底，小省份也读得清），区域标签关掉免得与针重叠。
  styles.set(birthResult.province, {
    name: birthResult.province,
    itemStyle: { areaColor: MAP_COLORS.selected, borderColor: MAP_COLORS.selected, borderWidth: 1.4 },
    label: { show: false },
    silent: true,
  });

  // 香港、澳门相距不到一个字宽，两个省名会叠成一团：一个往右上、一个往左下错开。
  for (const [name, offset] of Object.entries(SMALL_REGION_LABEL_OFFSET)) {
    if (name === birthResult.province) continue;
    const style = styles.get(name) ?? { name };
    style.label = { ...style.label, offset };
    styles.set(name, style);
  }
  const regions = [...styles.values()];

  const feature = chinaData.features.find(
    (item) => item.properties.name === birthResult.province,
  );

  const isSpecialRegion = ["香港", "澳门", "台湾"].includes(
    birthResult.province,
  );
  const tags = isSpecialRegion
    ? chip(translateGenderChild(birthResult.gender), birthResult.gender === "male" ? "azure" : "rose", true)
    : [
        chip(birthResult.category, "ink"),
        chip(translateGenderChild(birthResult.gender), birthResult.gender === "male" ? "azure" : "rose", true),
        chip(orderText(birthResult.order), "ink"),
      ].join("");

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
        label: { show: true, fontSize: 14, fontWeight: 500, color: '${MAP_COLORS.label}' },
        itemStyle: { areaColor: '${MAP_COLORS.land}', borderColor: '${MAP_COLORS.boundary}', borderWidth: 0.8 },
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
            ]), ${JSON.stringify(birthResult.province)}, api.getHeight());
        }
    }]`
        : ""
    }
});
`;

  return buildMapPage({
    docTitle: "中国投胎落点",
    eyebrow: "投胎模拟器 · 中国",
    title: birthResult.province,
    subtitle: subtitleOf(username, `第 ${birthResult.index} 次轮回 · 已落人间`),
    tags,
    seal: "降生",
    chartHeight: 560,
    legend: `<span class="key"><i aria-hidden="true">◎</i>本次落点</span>
<span class="scale"><span>旧迹深浅　浅</span><span class="ramp" aria-hidden="true"></span><span>深</span></span>
<span class="spacer"></span>
<span>已踏足 <b>${Object.keys(provinceWeights).length}</b> / ${totalProvinceCount} 省</span>`,
    colophonRight: "山河万里，此处是家",
    script,
  });
}


/* ------------------------------------------------------------------ *
 *  文本兜底
 *
 *  图是增强，不是前提：puppeteer 起不来、截图失败、落点图脚本没载入时，
 *  同一份数据改用一条纯文本送出。保留完整请求范围，并提供可执行的后续指令。
 * ------------------------------------------------------------------ */

/** 排行榜的文本兜底。 */
function rankingsText(
  toutaiRecords: ToutaiRecord[],
  count: number,
  options: RankingOptions,
): string {
  const scored = rankRows(toutaiRecords, options.pick);

  if (scored.length === 0) {
    return [
      `📋 ${textTitle(options.title)}`,
      `尚无人在此留下痕迹。`,
      `发送「${options.tip}」走出第一个名字。`,
    ].join("\n");
  }

  const rows = scored.slice(0, Math.max(1, count));
  const selfRank =
    scored.find((row) => row.userId === options.selfUserId)?.rank ?? 0;
  const standing = selfRank > 0 ? `你位居第 ${selfRank}` : `你尚未上榜`;

  return [
    `📋 ${textTitle(options.title)}`,
    ...rows.map(
      (row) =>
        `• ${row.rank} ${esc(trimUsername(row.username))} ${row.value} ${options.valueLabel}`,
    ),
    `${standing} · 发送「${options.tip}」刷新你的名次。`,
  ].join("\n");
}

/** 图内标题里的「榜」是画面用语，消息里的标题按术语表写「排行榜」。 */
function textTitle(title: string): string {
  return title.replace(/榜$/, "排行榜");
}

/** 中国投胎记录总览的文本兜底。 */
function chinaOverviewText(
  username: string,
  analysisResult,
  userRank: number,
  userStillbirthsRank: number,
  numberOfStillbirthsInChina: number,
): string {
  const { totalCount, uniqueProvinces, favourite } = analysisResult;
  const attempts = totalCount + numberOfStillbirthsInChina;

  return [
    `📋 中国投胎 · 记录总览`,
    `　命主 ${esc(username)} · 降生 ${totalCount} 次 · 夭折 ${numberOfStillbirthsInChina} 次`,
    `　存活率 ${percentText(totalCount, attempts)} · 履及 ${uniqueProvinces} 省 · 最常降生 ${favourite.name || "—"}`,
    userRank > 0 || userStillbirthsRank > 0
      ? `　降生 ${rankText(userRank)} · 夭折 ${rankText(userStillbirthsRank)}`
      : "",
    `发送「toutai.投胎中国」再走一遭。`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 世界投胎记录总览的文本兜底。 */
function worldOverviewText(
  username: string,
  analysisResult,
  userRank: number,
  userStillbirthsRank: number,
  numberOfStillbirths: number,
): string {
  const { totalCount, uniqueCountries, favourite } = analysisResult;
  const attempts = totalCount + numberOfStillbirths;

  return [
    `📋 世界投胎 · 记录总览`,
    `　命主 ${esc(username)} · 降生 ${totalCount} 次 · 夭折 ${numberOfStillbirths} 次`,
    `　存活率 ${percentText(totalCount, attempts)} · 履及 ${uniqueCountries} 国 · 最常降生 ${favourite.name || "—"}`,
    userRank > 0 || userStillbirthsRank > 0
      ? `　降生 ${rankText(userRank)} · 夭折 ${rankText(userStillbirthsRank)}`
      : "",
    `发送「toutai.投胎世界」再走一遭。`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 中国降生纪年的文本兜底。 */
function chinaBirthHistoryText(
  username: string,
  birthResultsInChina: BirthResultInChina[],
): string {
  const rows = [...birthResultsInChina]
    .sort((a, b) => (b.index || 0) - (a.index || 0))
    .slice(0, 2);

  return [
    `📋 中国投胎 · 降生纪年`,
    `　命主 ${esc(username)} · 共 ${birthResultsInChina.length} 次`,
    ...rows.map(
      (record) =>
        `• 第 ${record.index} 次 ${translateGender(record.gender)} · ${[record.province, record.category, orderText(record.order)].filter(Boolean).join(" · ")}`,
    ),
    `发送「toutai.中国投胎记录.总览」查看全貌。`,
  ].join("\n");
}

/** 世界降生纪年的文本兜底。 */
function worldBirthHistoryText(
  username: string,
  birthResultsInWorld: BirthResultInWorld[],
): string {
  const rows = [...birthResultsInWorld]
    .sort((a, b) => (b.index || 0) - (a.index || 0))
    .slice(0, 2);

  return [
    `📋 世界投胎 · 降生纪年`,
    `　命主 ${esc(username)} · 共 ${birthResultsInWorld.length} 次`,
    ...rows.map(
      (record) =>
        `• 第 ${record.index} 次 ${record.dictContinent} · ${record.dictName}`,
    ),
    `发送「toutai.世界投胎记录.总览」查看全貌。`,
  ].join("\n");
}

/** 世界夭折历史的文本兜底。 */
function worldDemiseHistoryText(
  username: string,
  unfortunateDemiseRecordsInWorld: UnfortunateDemiseRecordInWorld[],
): string {
  const rows = [...unfortunateDemiseRecordsInWorld]
    .sort((a, b) => (b.index || 0) - (a.index || 0))
    .slice(0, 2);

  return [
    `📋 世界投胎 · 夭折历史`,
    `　命主 ${esc(username)} · 共 ${unfortunateDemiseRecordsInWorld.length} 笔`,
    ...rows.map(
      (record) =>
        `• 第 ${record.index} 次 ${record.dictContinent} · ${record.dictName}`,
    ),
    `发送「toutai.世界投胎记录.总览」查看全貌。`,
  ].join("\n");
}

/** 地区分布的文本兜底。 */
function regionDistributionText(
  username: string,
  birthResultsInChina: BirthResultInChina[],
): string {
  const total = birthResultsInChina.length;
  const sorted = provinceCounts(birthResultsInChina);

  return [
    `📋 中国投胎 · 地区分布`,
    `　命主 ${esc(username)} · 共 ${total} 次 · ${sorted.length} 省`,
    ...sorted
      .slice(0, 2)
      .map(
        ([province, count]) =>
          `• ${province} ${count} 次 · 占 ${percentText(count, total)}`,
      ),
    `发送「toutai.中国投胎记录.总览」查看全貌。`,
  ].join("\n");
}

/** 性别分布的文本兜底。 */
function genderDistributionText(
  username: string,
  birthResultsInChina: BirthResultInChina[],
): string {
  const total = birthResultsInChina.length;
  const male = birthResultsInChina.filter((r) => r.gender === "male").length;
  const female = total - male;
  const ratio = female ? (male / female).toFixed(2) : "—";

  return [
    `📋 中国投胎 · 性别分布`,
    `　命主 ${esc(username)} · 共 ${total} 次 · 性别比 ${ratio}`,
    `• 男孩 ${male} 次 · 占 ${percentText(male, total)}`,
    `• 女孩 ${female} 次 · 占 ${percentText(female, total)}`,
    `发送「toutai.中国投胎记录.总览」查看全貌。`,
  ].join("\n");
}

/** 初见图鉴的文本兜底。 */
function firstAppearanceText(
  username: string,
  birthResultsInChina: BirthResultInChina[],
  totalProvinceCount: number,
): string {
  const provinces = provinceFirstAppearances(birthResultsInChina);
  const cell = (value: number | null, gender: "male" | "female") =>
    `${translateGender(gender)} ${
      value === null ? "未逢" : `第 ${value} 次`
    }`;

  return [
    `📋 中国投胎 · 初见图鉴`,
    `　命主 ${esc(username)} · 已踏足 ${provinces.length} / ${totalProvinceCount} 省`,
    ...provinces
      .slice(0, 2)
      .map(
        ([province, entry]) =>
          `• ${province} ${cell(entry.male, "male")} · ${cell(entry.female, "female")}`,
      ),
    `发送「toutai.中国投胎记录.总览」查看全貌。`,
  ].join("\n");
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

  // 入口指令自己列出子指令，不依赖 help 插件；带 -h 时仍由 help 插件接手。
  const sendHelp = async (session: any, name: string, tail: string) => {
    const { title, entries } = await helpOf(session, name);
    return sendMessage(
      session,
      [
        `📋 ${name === "toutai" ? title : `${name} · ${title}`}`,
        ...entries.map(({ name, description }) => `　${name}　${description}`),
        `　${tail}`,
      ].join("\n"),
    );
  };

  ctx
    .command("toutai", "投胎模拟器 · 一趟人间的随机开局")
    .userFields(["authority"])
    .action(({ session }) =>
      sendHelp(
        session,
        "toutai",
        "发送「toutai.投胎中国」或「toutai.投胎世界」开始；记录与排行榜下还有分项，发送其指令名展开。",
      ),
    );

  ctx.command("toutai.投胎中国", "投胎到中国").action(async ({ session }) => {
    const { userId } = session;
    // 「读记录 → 算 → 写记录」是一整段，中间还夹着一次落点图截图，同一用户并发时用一把锁串起来。
    if (mutatingUsers.has(userId)) {
      return await sendMessage(session, `⏳ 上一条还在落笔，稍候再试。`);
    }
    mutatingUsers.add(userId);
    try {
      let { username, timestamp } = session;
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
　黄泉路上尚在排队，再候 ${remainingWaitTime} 秒。
　发送「toutai.中国投胎记录」翻翻旧账。`,
          );
        }
      }
      const isRebirth = simulateRebirth(neonatalMortalityRateData["中国"]);
      if (!isRebirth) {
        const stillbirths = toutaiRecord[0].numberOfStillbirthsInChina + 1;
        const attempts =
          toutaiRecord[0].birthResultsInChina.length + stillbirths;
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
　累计夭折 ${stillbirths} 次，再候 ${config.nextReincarnationCooldownSeconds} 秒。
　发送「toutai.投胎中国」再叩一次门。`,
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
          lines.push(entry("胎次", `家中${orderText(birthResult.order)}`));
        }
        lines.push(`　${pickOne(BLESSINGS)}`);
        const mapImage = await mapImageOf(session, () =>
          generateChinaMap(
            toutaiRecord[0]?.birthResultsInChina ?? [birthResult],
            birthResult,
            username,
          ),
        );
        await sendMessage(session, `${mapImage}${lines.join("\n")}`);
      }
    } finally {
      mutatingUsers.delete(userId);
    }
  });

  ctx.command("toutai.投胎世界", "投胎到世界").action(async ({ session }) => {
    const { userId } = session;
    // 「读记录 → 算 → 写记录」是一整段，中间还夹着一次落点图截图，同一用户并发时用一把锁串起来。
    if (mutatingUsers.has(userId)) {
      return await sendMessage(session, `⏳ 上一条还在落笔，稍候再试。`);
    }
    mutatingUsers.add(userId);
    try {
      let { username, timestamp } = session;
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
　黄泉路上尚在排队，再候 ${remainingWaitTime} 秒。
　发送「toutai.世界投胎记录」翻翻旧账。`,
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
　累计夭折 ${stillbirths} 次，再候 ${config.nextReincarnationCooldownSeconds} 秒。
　发送「toutai.投胎世界」再叩一次门。`,
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
        birthResultInWorld.index =
          toutaiRecord[0].birthResultsInWorld.length + 1;
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
      const mapImage = await mapImageOf(session, () =>
        generateWorldMap(birthResultInWorld, username),
      );
      const message = [
        `🌍 第 ${birthResultInWorld.index} 次轮回 · 落地平安`,
        entry("大洲", dictContinent),
        entry("国度", dictName),
        `　${pickOne(BLESSINGS)}`,
      ].join("\n");
      await sendMessage(session, `${mapImage}${message}`);
    } finally {
      mutatingUsers.delete(userId);
    }
  });

  ctx
    .command("toutai.中国投胎记录", "列出各项投胎记录")
    .userFields(["authority"])
    .action(({ session }) => sendHelp(session, "toutai.中国投胎记录", "指令后可加 @某人，查看对方的记录。"));

  ctx
    .command("toutai.中国投胎记录.总览 [targetUser:text]", "查看降生与夭折的总账")
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
          `📋 命簿上尚无此人的中国投胎记录\n发送「toutai.投胎中国」走一遭，名字便落上去了。`,
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
        targetUserId,
      );

      const { birthResultsInChina, numberOfStillbirthsInChina } =
        targetUserRecord[0];
      const analysisResult = analyzeChinaBirthResults(birthResultsInChina);
      await sendImageOrText(
        session,
        () =>
          generateChinaBirthOverviewTableImage(
            trimUsername(targetUserRecord[0].username),
            analysisResult,
            userRank,
            userStillbirthsRank,
            numberOfStillbirthsInChina,
          ),
        () =>
          chinaOverviewText(
            targetUserRecord[0].username,
            analysisResult,
            userRank,
            userStillbirthsRank,
            numberOfStillbirthsInChina,
          ),
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.成功历史 [targetUser:text]",
      "查看历次降生",
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
          `📋 命簿上尚无此人的中国投胎记录\n发送「toutai.投胎中国」走一遭，名字便落上去了。`,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      const last20Records = birthResultsInChina.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      await sendImageOrText(
        session,
        () =>
          generateTableImageFromBirthResultsInChinaArray(
            trimUsername(targetUserRecord[0].username),
            last20Records,
          ),
        () =>
          chinaBirthHistoryText(
            targetUserRecord[0].username,
            birthResultsInChina,
          ),
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.地区分布 [targetUser:text]",
      "查看降生的省份分布",
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
          `📋 命簿上尚无此人的中国投胎记录\n发送「toutai.投胎中国」走一遭，名字便落上去了。`,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      await sendImageOrText(
        session,
        () =>
          generateBirthRegionHorizontalBarChartRankings(
            trimUsername(targetUserRecord[0].username),
            birthResultsInChina,
          ),
        () =>
          regionDistributionText(
            targetUserRecord[0].username,
            birthResultsInChina,
          ),
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.性别分布 [targetUser:text]",
      "查看男女比例",
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
          `📋 命簿上尚无此人的中国投胎记录\n发送「toutai.投胎中国」走一遭，名字便落上去了。`,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      await sendImageOrText(
        session,
        () =>
          generateChineseBirthGenderDistributionPieChart(
            trimUsername(targetUserRecord[0].username),
            birthResultsInChina,
          ),
        () =>
          genderDistributionText(
            targetUserRecord[0].username,
            birthResultsInChina,
          ),
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.第一次出现 [targetUser:text]",
      "查看各省的初见次序",
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
          `📋 命簿上尚无此人的中国投胎记录\n发送「toutai.投胎中国」走一遭，名字便落上去了。`,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      await sendImageOrText(
        session,
        () =>
          generateFirstChineseReincarnationRecordTableImage(
            trimUsername(targetUserRecord[0].username),
            birthResultsInChina,
          ),
        () =>
          firstAppearanceText(
            targetUserRecord[0].username,
            birthResultsInChina,
            totalProvinceCount,
          ),
      );
    });

  ctx
    .command("toutai.世界投胎记录", "列出各项投胎记录")
    .userFields(["authority"])
    .action(({ session }) => sendHelp(session, "toutai.世界投胎记录", "指令后可加 @某人，查看对方的记录。"));

  ctx
    .command("toutai.世界投胎记录.总览 [targetUser:text]", "查看降生与夭折的总账")
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
          `📋 命簿上尚无此人的世界投胎记录\n发送「toutai.投胎世界」走一遭，名字便落上去了。`,
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
      await sendImageOrText(
        session,
        () =>
          generateWorldBirthOverviewTableImage(
            trimUsername(targetUserRecord[0].username),
            analysisResult,
            userRank,
            userStillbirthsRank,
            numberOfStillbirthsInWorld,
          ),
        () =>
          worldOverviewText(
            targetUserRecord[0].username,
            analysisResult,
            userRank,
            userStillbirthsRank,
            numberOfStillbirthsInWorld,
          ),
      );
    });

  ctx
    .command(
      "toutai.世界投胎记录.成功历史 [targetUser:text]",
      "查看历次降生",
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
          `📋 命簿上尚无此人的世界投胎记录\n发送「toutai.投胎世界」走一遭，名字便落上去了。`,
        );
      }
      const { birthResultsInWorld } = targetUserRecord[0];
      const last20Records = birthResultsInWorld.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      await sendImageOrText(
        session,
        () =>
          generateTableImageFromBirthResultsInWorldArray(
            trimUsername(targetUserRecord[0].username),
            last20Records,
          ),
        () =>
          worldBirthHistoryText(
            targetUserRecord[0].username,
            birthResultsInWorld,
          ),
      );
    });

  ctx
    .command(
      "toutai.世界投胎记录.夭折历史 [targetUser:text]",
      "查看夭折的国度",
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
          `📋 命簿上尚无此人的世界夭折记录\n愿它一直空着。\n发送「toutai.投胎世界」走一遭，名字才会落到这里。`,
        );
      }
      const { unfortunateDemiseRecordsInWorld } = targetUserRecord[0];
      const last20Records = unfortunateDemiseRecordsInWorld.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      await sendImageOrText(
        session,
        () =>
          generateTableImageFromBirthResultsInWorldArrayForUnfortunateDemiseRecords(
            trimUsername(targetUserRecord[0].username),
            last20Records,
          ),
        () =>
          worldDemiseHistoryText(
            targetUserRecord[0].username,
            unfortunateDemiseRecordsInWorld,
          ),
      );
    });

  ctx
    .command("toutai.中国投胎排行榜", "列出各类投胎排行榜")
    .userFields(["authority"])
    .action(({ session }) => sendHelp(session, "toutai.中国投胎排行榜", "指令后可加人数，如「toutai.中国投胎排行榜.成功次数 10」。"));

  ctx
    .command(
      "toutai.中国投胎排行榜.成功次数 [count:posint]",
      "查看降生次数排行榜",
    )
    .action(
      async (
        { session },
        requested?: number,
      ) => {
        const count = displayLimit(requested, config.defaultMaxDisplayCount, config.maxDisplayCount);
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const ranking: RankingOptions = {
          title: "中国投胎 · 降生次数榜",
          seal: "降生",
          valueLabel: "次",
          tone: "jade",
          pick: (record) => record.birthResultsInChina.length,
          selfUserId: userId,
          tip: "toutai.投胎中国",
        };
        await sendImageOrText(
          session,
          () => generateRankingsImage(toutaiRecords, count, ranking),
          () => rankingsText(toutaiRecords, count, ranking),
        );
      },
    );

  ctx
    .command(
      "toutai.中国投胎排行榜.夭折次数 [count:posint]",
      "查看夭折次数排行榜",
    )
    .action(
      async (
        { session },
        requested?: number,
      ) => {
        const count = displayLimit(requested, config.defaultMaxDisplayCount, config.maxDisplayCount);
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const ranking: RankingOptions = {
          title: "中国投胎 · 夭折次数榜",
          seal: "长夜",
          valueLabel: "次",
          tone: "cinnabar",
          pick: (record) => record.numberOfStillbirthsInChina,
          selfUserId: userId,
          tip: "toutai.投胎中国",
        };
        await sendImageOrText(
          session,
          () => generateRankingsImage(toutaiRecords, count, ranking),
          () => rankingsText(toutaiRecords, count, ranking),
        );
      },
    );

  const genders = ["male", "female"];
  genders.forEach((gender) => {
    ctx
      .command(
        `toutai.中国投胎排行榜.${translateGenderChild(gender)}次数 [count:posint]`,
        `查看${translateGenderChild(gender)}降生次数排行榜`,
      )
      .action(
        async (
          { session },
          requested?: number,
        ) => {
          const count = displayLimit(requested, config.defaultMaxDisplayCount, config.maxDisplayCount);
          let { userId, username } = session;
          username = await getSessionUserName(session);
          await updateNameInPlayerRecord(session, userId, username);
          const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
            "toutai_records",
            {},
          );
          const ranking: RankingOptions = {
            title: `中国投胎 · ${translateGenderChild(gender)}次数榜`,
            seal: gender === "male" ? "青阳" : "绛雪",
            valueLabel: "次",
            tone: gender === "male" ? "azure" : "rose",
            pick: (record) =>
              record.birthResultsInChina.filter(
                (result) => result.gender === gender,
              ).length,
            selfUserId: userId,
            tip: "toutai.投胎中国",
          };
          await sendImageOrText(
            session,
            () => generateRankingsImage(toutaiRecords, count, ranking),
            () => rankingsText(toutaiRecords, count, ranking),
          );
        },
      );
  });

  ctx
    .command("toutai.世界投胎排行榜", "列出各类投胎排行榜")
    .userFields(["authority"])
    .action(({ session }) => sendHelp(session, "toutai.世界投胎排行榜", "指令后可加人数，如「toutai.世界投胎排行榜.成功次数 10」。"));

  ctx
    .command(
      "toutai.世界投胎排行榜.成功次数 [count:posint]",
      "查看降生次数排行榜",
    )
    .action(
      async (
        { session },
        requested?: number,
      ) => {
        const count = displayLimit(requested, config.defaultMaxDisplayCount, config.maxDisplayCount);
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const ranking: RankingOptions = {
          title: "世界投胎 · 降生次数榜",
          seal: "寰宇",
          valueLabel: "次",
          tone: "jade",
          pick: (record) => record.birthResultsInWorld.length,
          selfUserId: userId,
          tip: "toutai.投胎世界",
        };
        await sendImageOrText(
          session,
          () => generateRankingsImage(toutaiRecords, count, ranking),
          () => rankingsText(toutaiRecords, count, ranking),
        );
      },
    );

  ctx
    .command(
      "toutai.世界投胎排行榜.夭折次数 [count:posint]",
      "查看夭折次数排行榜",
    )
    .action(
      async (
        { session },
        requested?: number,
      ) => {
        const count = displayLimit(requested, config.defaultMaxDisplayCount, config.maxDisplayCount);
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const ranking: RankingOptions = {
          title: "世界投胎 · 夭折次数榜",
          seal: "长夜",
          valueLabel: "次",
          tone: "cinnabar",
          pick: (record) => record.numberOfStillbirthsInWorld,
          selfUserId: userId,
          tip: "toutai.投胎世界",
        };
        await sendImageOrText(
          session,
          () => generateRankingsImage(toutaiRecords, count, ranking),
          () => rankingsText(toutaiRecords, count, ranking),
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
        `toutai.世界投胎排行榜.${continent} [count:posint]`,
        `查看${continent}降生次数排行榜`,
      )
      .action(
        async (
          { session },
          requested?: number,
        ) => {
          const count = displayLimit(requested, config.defaultMaxDisplayCount, config.maxDisplayCount);
          let { userId, username } = session;
          username = await getSessionUserName(session);
          await updateNameInPlayerRecord(session, userId, username);
          const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
            "toutai_records",
            {},
          );
          const ranking: RankingOptions = {
            title: `世界投胎 · ${continent}次数榜`,
            seal: "寰宇",
            valueLabel: "次",
            tone: "azure",
            pick: (record) =>
              record.birthResultsInWorld.filter(
                (result) => result.dictContinent === continent,
              ).length,
            selfUserId: userId,
            tip: "toutai.投胎世界",
          };
          await sendImageOrText(
            session,
            () => generateRankingsImage(toutaiRecords, count, ranking),
            () => rankingsText(toutaiRecords, count, ranking),
          );
        },
      );
  });

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

  /**
   * 统一的截图流程：走 Koishi 的 `page()`，等宽画布、二倍图、截 body。
   *
   * 落点图的页面从公网 CDN 取 ECharts，取不到时脚本报错但页面照样 load、
   * body 照样截得出来，截出来的是一张空图：故 requireEcharts 为真时先验一次脚本到位。
   */
  async function capture(
    htmlContent: string,
    requireEcharts = false,
  ): Promise<Buffer> {
    const page = await ctx.puppeteer.page();
    try {
      await page.setViewport({
        width: CARD_WIDTH,
        height: 800,
        deviceScaleFactor: 2,
      });
      await page.setContent(h.unescape(htmlContent), {
        waitUntil: "load",
        timeout: 30000,
      });
      if (requireEcharts) {
        const loaded = await page.evaluate(
          () => typeof (window as any).echarts !== "undefined",
        );
        if (!loaded) throw new Error("落点图脚本未能载入");
      }
      await page.evaluate(async () => {
        await (document as any).fonts?.ready;
      });
      const body = await page.$("body");
      if (!body) throw new Error("截图失败：页面 body 不存在");
      return await body.screenshot({ type: config.imageType });
    } finally {
      await page.close();
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
    count: number,
    options: RankingOptions,
  ) {
    return capture(
      renderRankings(toutaiRecords, count, options),
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
        totalProvinceCount,
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
      true,
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
      true,
    );
  }

  /**
   * 落点图：部署者关掉图、或渲染失败，都只发文本，不打断这一趟投胎。
   * 返回已经拼好的图片元素（失败或关闭时为空串）。
   */
  async function mapImageOf(session: any, render: () => Promise<Buffer>): Promise<string> {
    if (!config.isMapImageIncludedAfterRebirth) return "";
    try {
      const mapBuffer = await render();
      return `${h.image(mapBuffer, `image/${config.imageType}`)}\n`;
    } catch (error) {
      logger.warn("落点图渲染失败，本次只发文本：%s", (error as Error).message);
      return "";
    }
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

    if (username !== existingRecord.username) {
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
    return session.username;
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

  /**
   * 图片是增强，不是前提：渲染不出来就改发等价的一条纯文本，
   * 不让用户什么都收不到，也不把异常抛回框架。
   */
  async function sendImageOrText(
    session: any,
    render: () => Promise<Buffer>,
    text: () => string,
  ): Promise<void> {
    let buffer: Buffer;
    try {
      buffer = await render();
    } catch (error) {
      logger.warn("图片渲染失败，改为纯文本：%s", (error as Error).message);
      await sendMessage(session, text(), false);
      return;
    }
    await sendMessage(
      session,
      present(h.image(buffer, `image/${config.imageType}`), h.text(text())),
      false,
    );
  }

  /** 同一用户的「读-算-写」串行化令牌，见投胎指令。 */
  const mutatingUsers = new Set<string>();

  /** 自动撤回：每个频道只记最新一条消息，新消息发出后把上一条延时撤回。 */
  const sentMessages = new Map<string, string>();

  async function sendMessage(
    session: any,
    message: any,
    isAt: boolean = true,
  ): Promise<void> {
    const { bot, channelId, userId } = session;

    let messageId;
    if (config.shouldPrefixUsernameInMessageSending && isAt) {
      message = `${h.at(userId)} ~\n${message}`;
    }
    [messageId] = await session.send(message);

    if (config.retractDelay === 0) return;

    const previousMessageId = sentMessages.get(channelId);
    sentMessages.set(channelId, messageId);

    if (!previousMessageId) return;
    ctx.setTimeout(() => {
      bot.deleteMessage(channelId, previousMessageId).catch((error) => {
        logger.debug("撤回消息失败：%s", error.message);
      });
    }, config.retractDelay * 1000);
  }
}
