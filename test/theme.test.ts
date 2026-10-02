import assert from "node:assert/strict";
import test from "node:test";
import { contrast, lchOf, onColor } from "../src/m3";
import { MAP_COLORS, heatColor } from "../src/map-theme";
import { SCHEME, SEAL, TONE_HUES, toneRoles, type Tone } from "../src/theme";
import { rankRows, type ToutaiRecord } from "../src";

const TONES = ["azure", "rose", "jade", "cinnabar", "gold", "ink"] as const;

// 图里出现过的「文字 / 底色」组合：AA 正文 4.5，大字与非文字图形 3。
// 色块上的数字与标签统一按 7（AAA）要，色块里字最多、也最常在手机上缩小着看。
test("语义色块：深字压浅容器，条与点压得住容器和白纸", () => {
  for (const tone of TONES) {
    const { solid, container, on } = toneRoles(tone as Tone);
    assert.ok(contrast(on, container) >= 7, `${tone}: 字 / 容器 ${contrast(on, container)}`);
    assert.ok(contrast(solid, container) >= 3, `${tone}: 条 / 容器 ${contrast(solid, container)}`);
    assert.ok(contrast(solid, SCHEME.surfaceContainerLowest) >= 3, `${tone}: 条 / 白纸`);
    // 条的轨道是半透明白，最亮不过白纸：实色对白纸够，对轨道也就够
  }
});

test("纸面上的文字", () => {
  const papers = [
    SCHEME.surfaceContainerLowest, // 纸
    SCHEME.surfaceContainerLow, // 行、中性卡
    SCHEME.surfaceContainerHighest, // 中性标签、条的轨道
  ];
  for (const paper of papers) {
    assert.ok(contrast(SCHEME.onSurface, paper) >= 7, `正文 / ${paper}`);
    assert.ok(contrast(SCHEME.onSurfaceVariant, paper) >= 4.5, `次要文字 / ${paper}`);
  }
  // 题头小标题用主色写字
  assert.ok(contrast(SCHEME.primary, SCHEME.surfaceContainerLowest) >= 4.5, "eyebrow");
  // 「我」那一行与「你」标
  assert.ok(contrast(SCHEME.onSecondaryContainer, SCHEME.secondaryContainer) >= 4.5, "自己那一行");
  assert.ok(contrast(SCHEME.onPrimary, SCHEME.primary) >= 4.5, "「你」标");
  // 条在自己那一行（半透明白轨道）上也要看得见
  assert.ok(contrast(toneRoles("jade").solid, SCHEME.secondaryContainer) >= 3);
  assert.ok(contrast(toneRoles("ink").solid, SCHEME.secondaryContainer) >= 3);
});

test("朱印与名次章", () => {
  assert.ok(contrast(SEAL.foreground, SEAL.background) >= 4.5);
  assert.ok(contrast(SEAL.background, SCHEME.surfaceContainerLowest) >= 3);
  for (const medal of [MAP_COLORS.selected]) assert.ok(contrast(onColor(medal), medal) >= 4.5);
});

test("夭折（朱砂）与女孩（玫红）不能是同一支粉", () => {
  const a = lchOf(toneRoles("rose").solid).hue;
  const b = lchOf(toneRoles("cinnabar").solid).hue;
  const gap = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  assert.ok(gap >= 20, `色相差 ${gap}`);
  assert.ok(TONE_HUES.rose !== TONE_HUES.cinnabar);
});

test("地图：任何一档旧迹色阶上，地名与朱砂落点都读得清", () => {
  let previous = Infinity;
  for (let i = 0; i <= 100; i++) {
    const color = heatColor(i / 100);
    assert.ok(contrast(MAP_COLORS.label, color) >= 4.5, `地名 / 色阶 ${i}%`);
    assert.ok(contrast(MAP_COLORS.selected, color) >= 3, `落点 / 色阶 ${i}%：${contrast(MAP_COLORS.selected, color)}`);
    const tone = lchOf(color).tone;
    assert.ok(tone <= previous + 0.05, `色阶要单调变深：${i}%`);
    previous = tone;
  }
  assert.ok(contrast(MAP_COLORS.onSelected, MAP_COLORS.selected) >= 4.5, "落点名牌");
  assert.ok(contrast(MAP_COLORS.label, MAP_COLORS.land) >= 7, "地名 / 陆地");
  for (const ground of [MAP_COLORS.land, MAP_COLORS.water]) {
    assert.ok(contrast(MAP_COLORS.selected, ground) >= 3, `落点 / ${ground}`);
  }
  assert.ok(contrast(MAP_COLORS.marker, MAP_COLORS.markerHalo) >= 3, "定位针");
});

test("纸面不带粉：中性面的色相落在琥珀赭，不是红橙", () => {
  const { hue } = lchOf(SCHEME.surfaceContainerLow);
  assert.ok(hue > 55 && hue < 110, `纸面色相 ${hue}`);
});

function record(userId: string, count: number): ToutaiRecord {
  return {
    id: 0,
    userId,
    username: userId,
    timestamp: "",
    numberOfStillbirthsInChina: 0,
    numberOfStillbirthsInWorld: 0,
    birthResultsInChina: Array.from({ length: count }, (_, i) => ({ index: i + 1 })) as any,
    birthResultsInWorld: [],
    unfortunateDemiseRecordsInWorld: [],
  };
}

test("排行榜并列同名次（1、1、3、3、5），零分不上榜", () => {
  const rows = rankRows(
    [record("a", 50), record("b", 50), record("c", 45), record("d", 45), record("e", 42), record("z", 0)],
    (r) => r.birthResultsInChina.length,
  );
  assert.deepEqual(
    rows.map((r) => [r.userId, r.rank]),
    [["a", 1], ["b", 1], ["c", 3], ["d", 3], ["e", 5]],
  );
});
