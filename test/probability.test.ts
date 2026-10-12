import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { birthsOf, simulateRebirthInWorld, type WorldBirthrateData } from "../src";

interface Country {
  nameCn: string;
  continent: string;
  position: [number, number];
}

const readJson = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "../src/assets", file), "utf-8"));

const birthrates: WorldBirthrateData[] = readJson("worldBirthrate.json");
const worldData: { [code: string]: Country } = readJson("worldData.json");

const continentOf: { [name: string]: string } = {};
for (const code in worldData) continentOf[worldData[code].nameCn] = worldData[code].continent;

const country = (
  name: string,
  population: number,
  birthRate: number | null,
): WorldBirthrateData => ({ country: name, name, population, birthRate });

/** random 取 [0, 1) 内等距的 count 个点，一个国家被命中的次数就等于它的概率区间长度。 */
function sweep(list: WorldBirthrateData[], count: number): { [name: string]: number } {
  const hits: { [name: string]: number } = {};
  for (let i = 0; i < count; i++) {
    const name = simulateRebirthInWorld(list, () => (i + 0.5) / count);
    hits[name] = (hits[name] || 0) + 1;
  }
  return hits;
}

test("落点边界就是出生人数的累加线（1 : 3 两国）", () => {
  const list = [country("甲", 1, 1), country("乙", 1, 3)];
  const pick = (random: number) => simulateRebirthInWorld(list, () => random);

  assert.equal(pick(0), "甲");
  assert.equal(pick(0.249), "甲");
  // 累加线右开：正好落在 0.25 上属于第二个国家
  assert.equal(pick(0.25), "乙");
  assert.equal(pick(0.999), "乙");
});

test("人口乘出生率：人口多的大国不会被出生率高的小国压下去", () => {
  const list = [country("大国", 100, 10), country("小国", 1, 40)];
  assert.equal(birthsOf(list[0]), 1000);
  assert.equal(birthsOf(list[1]), 40);

  const hits = sweep(list, 10_000);
  assert.ok(Math.abs(hits["大国"] / 10_000 - 1000 / 1040) < 1e-3);
});

test("缺数据的国家抽不到；全缺或空表返回 null", () => {
  const list = [country("缺率", 5, null), country("零人", 0, 10), country("有", 1, 1), country("尾", 3, 0)];
  assert.deepEqual(Object.keys(sweep(list, 1000)), ["有"]);

  assert.equal(simulateRebirthInWorld(list.filter((item) => birthsOf(item) === 0)), null);
  assert.equal(simulateRebirthInWorld([]), null);
});

test("浮点误差让累加线略短于总和时，落在最后一个有权重的国家", () => {
  // 0.1 + 0.2 + 0.3 的逐项相减在随机数顶格时剩下 +ε，走不进任何一个区间
  const list = [country("甲", 0.1, 1), country("乙", 0.2, 1), country("丙", 0.3, 1), country("丁", 9, 0)];
  assert.equal(simulateRebirthInWorld(list, () => 1 - 2 ** -53), "丙");
});

test("世界投胎的分布逐国等于出生人数占比", () => {
  const count = 200_000;
  const hits = sweep(birthrates, count);
  const total = birthrates.reduce((sum, item) => sum + birthsOf(item), 0);

  for (const item of birthrates) {
    const share = birthsOf(item) / total;
    const chance = (hits[item.name] || 0) / count;
    assert.ok(
      Math.abs(chance - share) <= 2 / count,
      `${item.name}：实测 ${(chance * 100).toFixed(3)}%，应为 ${(share * 100).toFixed(3)}%`,
    );
  }
});

test("回归：非洲不再被顶到 61%，也不是出生率归一的 42%（#3）", () => {
  const count = 100_000;
  const hits = sweep(birthrates, count);
  const byContinent: { [continent: string]: number } = {};
  for (const name in hits) {
    const continent = continentOf[name];
    byContinent[continent] = (byContinent[continent] || 0) + hits[name] / count;
  }

  // 现实的新生儿分布：亚洲约一半、非洲约三分之一，印度一国占六分之一。
  assert.ok(Math.abs(byContinent["AS"] - 0.498) < 0.01, `亚洲 ${byContinent["AS"]}`);
  assert.ok(Math.abs(byContinent["AF"] - 0.343) < 0.01, `非洲 ${byContinent["AF"]}`);
  assert.ok(Math.abs(hits["印度"] / count - 0.167) < 0.005, `印度 ${hits["印度"] / count}`);
});

test("数据：每个国家都能在地图数据里找到落点，单位对得上现实的全球出生人数", () => {
  const names = birthrates.map((item) => item.name);
  assert.equal(new Set(names).size, names.length, "国名重复");

  for (const name of names) {
    assert.ok(continentOf[name], `${name}：worldData.json 里没有这个国家`);
  }
  const weighted = birthrates.filter((item) => birthsOf(item) > 0);
  assert.ok(weighted.length > 190, `有权重的国家只有 ${weighted.length} 个`);

  // 人口（百万）× 出生率（‰）÷ 1000 = 年出生人数（百万），现实约 1.3 亿。
  const millions = weighted.reduce((sum, item) => sum + birthsOf(item), 0) / 1000;
  assert.ok(millions > 120 && millions < 150, `全球年出生 ${millions.toFixed(1)} 百万`);
});
