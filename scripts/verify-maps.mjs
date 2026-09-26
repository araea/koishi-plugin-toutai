import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import puppeteer from 'puppeteer-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const work = await mkdtemp(path.join(root, '.map-check-'))
const out = await mkdtemp(path.join(tmpdir(), 'toutai-maps-'))
let browser
try {
  const source = await readFile(path.join(root, 'src/index.ts'), 'utf8')
  const entry = path.join(work, 'maps.cjs')
  await build({ stdin: { contents: source + '\nexport { renderChinaMap, renderWorldMap, MAP_COLORS, MAP_SCHEME, heatColor }; export { contrast, lchOf } from "./m3";', resolveDir: path.join(root, 'src'), loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', packages: 'external' })
  const { renderChinaMap, renderWorldMap, MAP_COLORS: c, MAP_SCHEME: scheme, heatColor, contrast, lchOf } = createRequire(import.meta.url)(entry)
  let minText = Infinity, minSelected = Infinity, previous = Infinity
  for (let i = 0; i <= 100; i++) {
    const color = heatColor(i / 100)
    minText = Math.min(minText, contrast(c.label, color))
    minSelected = Math.min(minSelected, contrast(c.selected, color))
    const tone = lchOf(color).tone
    assert.ok(tone <= previous + .05, `history ramp must be monotonic at ${i}`)
    previous = tone
  }
  assert.ok(minText >= 4.5, `history labels: ${minText}`)
  assert.ok(minSelected >= 3, `selected region: ${minSelected}`)
  for (const [fg, bg] of [[c.onSelected, c.selected], [c.label, c.land], [scheme.onPrimaryContainer, scheme.primaryContainer]]) assert.ok(contrast(fg, bg) >= 4.5)
  for (const bg of [c.land, c.water]) assert.ok(contrast(c.selected, bg) >= 3)
  assert.ok(contrast(c.marker, c.markerHalo) >= 3)
  const json = async name => JSON.parse(await readFile(path.join(root, 'src/assets', name), 'utf8'))
  const china = await json('China.json'), world = await json('world.json'), countries = await json('worldData.json')
  const result = { id: 1, order: '1', index: 8, gender: '男', category: '城镇', province: '四川', probability: .2 }
  const history = ['新疆', '西藏', '青海', '甘肃', '内蒙古', '河南', '广东', '四川'].map((province, i) => ({ ...result, province, probability: (i + 1) / 8 }))
  const fixtures = [
    ['china-history', renderChinaMap(history, result, 'n 宝', china, 34)],
    ['china-first', renderChinaMap([], result, '神尊大人', china, 34)],
    ...['香港', '澳门', '台湾'].map(province => [province, renderChinaMap(history, { ...result, province }, 'n 宝', china, 34)]),
    ['world', renderWorldMap({ dictName: '法国', dictContinent: '欧洲', coordinate: [2.35, 48.86], center: [2.35, 48.86], index: 8 }, 'n 宝', world, countries)],
    ['world-island', renderWorldMap({ dictName: '新加坡', dictContinent: '亚洲', coordinate: [103.8, 1.35], center: [103.8, 1.35], index: 9 }, 'n 宝', world, countries)],
  ]
  const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js')
  assert.ok(response.ok)
  const echarts = await response.text()
  browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  for (const [name, html] of fixtures) {
    const page = await browser.newPage(), errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.setRequestInterception(true)
    page.on('request', request => request.url().includes('/echarts/') ? request.respond({ status: 200, contentType: 'application/javascript', body: echarts }) : request.continue())
    await page.setViewport({ width: 820, height: 1100, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const state = await page.evaluate(() => {
      const node = document.getElementById('map'), chart = window.echarts.getInstanceByDom(node)
      const option = chart.getOption()
      return { canvas: !!node.querySelector('canvas'), aria: node.getAttribute('aria-label'), animation: option.animation, regions: option.geo[0].regions, overflow: document.documentElement.scrollWidth > innerWidth }
    })
    assert.deepEqual(errors, [], name)
    assert.ok(state.canvas && state.aria && !state.overflow, name)
    assert.equal(state.animation, false)
    const selected = state.regions.find(r => r.itemStyle.areaColor === c.selected)
    assert.ok(selected, `${name}: selected region`)
    if (!name.startsWith('world')) assert.equal(new Set(state.regions.map(r => r.name)).size, state.regions.length, 'one style per province')
    if (selected.label?.formatter) assert.equal(selected.label.formatter, `${selected.name}\n本次落点`)
    await (await page.$('.sheet')).screenshot({ path: path.join(out, `${name}.png`) })
    await writeFile(path.join(out, `${name}.html`), html)
    await page.close()
  }
  console.log(JSON.stringify({ out, fixtures: fixtures.length, minHistoryTextContrast: minText, minSelectedContrast: minSelected, selectedTextContrast: contrast(c.selected, c.onSelected) }, null, 2))
} finally {
  await browser?.close()
  await rm(work, { recursive: true, force: true })
}
