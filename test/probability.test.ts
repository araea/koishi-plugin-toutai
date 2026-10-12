import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { simulateRebirthInWorld } from "../src";

interface WorldBirthrateData {
  country: string;
  name: string;
  population: number;
  birthRate: number;
  birthRatePercentage: number;
}

interface Country {
  nameCn: string;
  continent: string;
}

const readJson = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "../src/assets", file), "utf-8"));

const worldBirthrateData: WorldBirthrateData[] = readJson("worldBirthrate.json");
const worldData: { [code: string]: Country } = readJson("worldData.json");

/** 中文国名 → 大洲代码。 */
const continentOf: { [name: string]: string } = {};
for (const code in worldData) continentOf[worldData[code].nameCn] = worldData[code].continent;

const CONTINENT_NAME: { [code: string]: string } = {
  AF: "非洲",
  EU: "欧洲",
  AS: "亚洲",
  OA: "大洋洲",
  NA: "北美洲",
  SA: "南美洲",
  AN: "南极洲",
};

/** 临时把 Math.random 换成给定序列（循环取用），跑完恢复。 */
function withRandom<T>(values: number[], run: () => T): T {
  const original = Math.random;
  let cursor = 0;
  Math.random = () => values[cursor++ % values.length];
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

const country = (name: string, birthRatePercentage: number): WorldBirthrateData => ({
  country: name,
  name,
  population: 1,
  birthRate: 1,
  birthRatePercentage,
});

test("落点边界就是权重累加线（0.25 / 0.75 两国）", () => {
  const list = [country("甲", 0.25), country("乙", 0.75)];
  const pick = (randomValue: number) =>
    withRandom([randomValue], () => simulateRebirthInWorld(list));

  assert.equal(pick(0), "甲");
  assert.equal(pick(0.249), "甲");
  // 累加线右开：正好落在 0.25 上属于第二个国家
  assert.equal(pick(0.25), "乙");
  assert.equal(pick(0.999), "乙");
});

test("权重为 0 的国家抽不到；全零退化成等概率；空表返回 null", () => {
  const onlySecond = [country("甲", 0), country("乙", 1)];
  for (let i = 0; i < 200; i++) {
    assert.equal(simulateRebirthInWorld(onlySecond), "乙");
  }

  const flat = [country("甲", 0), country("乙", 0)];
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(simulateRebirthInWorld(flat));
  assert.deepEqual([...seen].sort(), ["乙", "甲"]);

  assert.equal(simulateRebirthInWorld([]), null);
});

test("世界投胎的分布等于权重占比（回归：旧实现把非洲顶到约 61%）", () => {
  const samples = 100_000;
  const counts: { [name: string]: number } = {};
  for (let i = 0; i < samples; i++) {
    const name = simulateRebirthInWorld(worldBirthrateData);
    counts[name] = (counts[name] || 0) + 1;
  }

  const weightOf: { [continent: string]: number } = {};
  const chanceOf: { [continent: string]: number } = {};
  for (const row of worldBirthrateData) {
    const continent = CONTINENT_NAME[continentOf[row.name]];
    weightOf[continent] = (weightOf[continent] || 0) + row.birthRatePercentage;
    chanceOf[continent] = (chanceOf[continent] || 0) + (counts[row.name] || 0) / samples;
  }

  for (const continent in weightOf) {
    const diff = Math.abs(chanceOf[continent] - weightOf[continent]);
    assert.ok(
      diff < 0.02,
      `${continent}：实测 ${(chanceOf[continent] * 100).toFixed(2)}% 应贴近权重 ${(
        weightOf[continent] * 100
      ).toFixed(2)}%`,
    );
  }

  // 旧实现的拒绝采样把「国家数量」当成了权重：非洲 54/214 国且出生率最高，实测 61.0%。
  assert.ok(
    chanceOf["非洲"] < 0.45,
    `非洲实测 ${(chanceOf["非洲"] * 100).toFixed(2)}%，应贴近 42.4% 而不是 61%`,
  );
  assert.ok(
    chanceOf["亚洲"] > 0.19,
    `亚洲实测 ${(chanceOf["亚洲"] * 100).toFixed(2)}%，应贴近 21.8%`,
  );
});
