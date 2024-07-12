import {Context, h, RuntimeError, Schema, sleep} from 'koishi'
import {} from 'koishi-plugin-markdown-to-image-service'
import {} from 'koishi-plugin-puppeteer'
import * as path from 'path';
import * as fs from 'fs';

export let name = 'toutai'
export const inject = {
  required: ['database', 'puppeteer'],
  optional: ['markdownToImage'],
}
export const usage = `## 🌈 使用

1. 启动 \`Puppeteer\` 服务，以便生成图片。
2. 建议在 \`指令管理\` 中为该插件添加自定义别名。

## 🌼 指令

- \`toutai\`: 显示投胎模拟器帮助。
- \`toutai.投胎中国\`: 模拟投胎到中国。
- \`toutai.投胎世界\`: 模拟投胎到世界各地。
- \`toutai.中国投胎记录.总览/成功历史/地区分布/性别分布/第一次出现\`: 查看中国投胎记录。
- \`toutai.世界投胎记录.总览/成功历史/夭折历史\`: 查看世界投胎记录。
- \`toutai.中国投胎排行榜.成功次数/夭折次数/男孩次数/女孩次数\`: 查看中国投胎排行榜。
- \`toutai.世界投胎排行榜.成功次数/夭折次数/亚洲/欧洲/非洲/北美洲/南美洲/南极洲/大洋洲\`: 查看世界投胎排行榜。
- \`toutai.改名\`: 更改玩家名字。

## 🐱 QQ 群

- 956758505`

export interface Config {
  defaultMaxDisplayCount: number
  nextReincarnationCooldownSeconds: number

  shouldPrefixUsernameInMessageSending: boolean
  retractDelay: number
  isMapImageIncludedAfterRebirth: boolean
  imageType: 'png' | 'jpeg' | 'webp'
  isTextToImageConversionEnabled: boolean
  isEnableQQOfficialRobotMarkdownTemplate: boolean

  customTemplateId: string
  key: string
  numberOfMessageButtonsPerRow: number
  isUsingUnifiedKoishiBuiltInUsername: boolean
}

// pz* pzx*
export const Config: Schema<Config> = Schema.intersect([
  Schema.intersect([
    Schema.object({
      defaultMaxDisplayCount: Schema.number().min(0).default(20).description('排行榜默认显示的人数。'),
      nextReincarnationCooldownSeconds: Schema.number().min(0).default(60).description(`投胎的冷却时间，单位是秒。`),
      shouldPrefixUsernameInMessageSending: Schema.boolean().default(true).description(`是否在发送消息时加上 @用户名。`),
      retractDelay: Schema.number().min(0).default(0).description(`自动撤回等待的时间，单位是秒。值为 0 时不启用自动撤回功能。`),
      isMapImageIncludedAfterRebirth: Schema.boolean().default(true).description(`是否在投胎后包含地图图片。`),
      imageType: Schema.union(['png', 'jpeg', 'webp']).default('png').description(`发送的图片类型。`),
      isTextToImageConversionEnabled: Schema.boolean().default(false).description(`是否开启将文本转为图片的功能（可选），如需启用，需要启用 \`markdownToImage\` 服务。`),
      isEnableQQOfficialRobotMarkdownTemplate: Schema.boolean().default(false).description(`是否启用 QQ 官方机器人的 Markdown 模板，带消息按钮。`),
    }),
    Schema.union([
      Schema.object({
        isEnableQQOfficialRobotMarkdownTemplate: Schema.const(true).required(),
        customTemplateId: Schema.string().default('').description(`自定义模板 ID。`),
        key: Schema.string().default('').description(`文本内容中特定插值的 key，用于存放文本。如果你的插值为 {{.info}}，那么请在这里填 info。`),
        numberOfMessageButtonsPerRow: Schema.number().min(2).max(5).default(2).description(`每行消息按钮的数量。`),
        isUsingUnifiedKoishiBuiltInUsername: Schema.boolean().default(true).description(`是否使用统一的 Koishi 内置用户名。`),
      }),
      Schema.object({}),
    ]),

  ])
]) as any;

// smb*
declare module 'koishi' {
  interface Tables {
    toutai_records: ToutaiRecord
  }
}

// jk*
export interface ToutaiRecord {
  id: number
  userId: string
  username: string
  timestamp: string
  numberOfStillbirthsInChina: number
  numberOfStillbirthsInWorld: number
  birthResultsInChina: BirthResultInChina[]
  birthResultsInWorld: BirthResultInWorld[]
  unfortunateDemiseRecordsInWorld: UnfortunateDemiseRecordInWorld[]
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
  town: {
    one: {
      male: number;
      female: number;
    };
    two: {
      male: number;
      female: number;
    };
    three: {
      male: number;
      female: number;
    };
    four: {
      male: number;
      female: number;
    };
    fivePlus: {
      male: number;
      female: number;
    };
  };
  city: {
    one: {
      male: number;
      female: number;
    };
    two: {
      male: number;
      female: number;
    };
    three: {
      male: number;
      female: number;
    };
    four: {
      male: number;
      female: number;
    };
    fivePlus: {
      male: number;
      female: number;
    };
  };
  countryside: {
    one: {
      male: number;
      female: number;
    };
    two: {
      male: number;
      female: number;
    };
    three: {
      male: number;
      female: number;
    };
    four: {
      male: number;
      female: number;
    };
    fivePlus: {
      male: number;
      female: number;
    };
  };
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

export function apply(ctx: Context, config: Config) {
  // tzb*
  ctx.database.extend('toutai_records', {
    id: 'unsigned',
    userId: 'string',
    username: 'string',
    timestamp: {type: 'string', initial: ''},
    birthResultsInChina: {type: 'json', initial: []},
    birthResultsInWorld: {type: 'json', initial: []},
    numberOfStillbirthsInChina: {type: 'unsigned', initial: 0},
    numberOfStillbirthsInWorld: {type: 'unsigned', initial: 0},
    unfortunateDemiseRecordsInWorld: {type: 'json', initial: []},
  }, {
    primary: 'id',
    autoInc: true,
  })
  // wj*
  const filePath = path.join(__dirname, 'emptyHtml.html').replace(/\\/g, '/');
  const pageGotoFilePath = 'file://' + filePath
  const ChinaJsonFilePath = path.join(__dirname, 'assets', 'China.json');
  const worldJsonFilePath = path.join(__dirname, 'assets', 'world.json');
  const worldDataJsonFilePath = path.join(__dirname, 'assets', 'worldData.json');
  // const birthrateJsonFilePath = path.join(__dirname, 'assets', 'birthrate.json');
  const worldBirthrateJsonFilePath = path.join(__dirname, 'assets', 'worldBirthrate.json');
  const birthrateDetailedJsonFilePath = path.join(__dirname, 'assets', 'birthrateDetailed.json');
  const neonatalMortalityRateJsonFilePath = path.join(__dirname, 'assets', 'neonatalMortalityRate.json');
  const ChinaData: China = JSON.parse(fs.readFileSync(ChinaJsonFilePath, 'utf-8'));
  const world: CountryData = JSON.parse(fs.readFileSync(worldJsonFilePath, 'utf-8'));
  const worldData: CountryData = JSON.parse(fs.readFileSync(worldDataJsonFilePath, 'utf-8'));
  // const birthrateData: { region: Region[] } = JSON.parse(fs.readFileSync(birthrateJsonFilePath, 'utf-8'));
  const worldBirthrateData: WorldBirthrateData[] = JSON.parse(fs.readFileSync(worldBirthrateJsonFilePath, 'utf-8'));
  const birthrateDetailedData: BirthrateDetailedData[] = JSON.parse(fs.readFileSync(birthrateDetailedJsonFilePath, 'utf-8'));
  const neonatalMortalityRateData: NeonatalMortalityRateData = JSON.parse(fs.readFileSync(neonatalMortalityRateJsonFilePath, 'utf-8'));
  // cl*
  const logger = ctx.logger('toutai')
  const isQQOfficialRobotMarkdownTemplateEnabled = config.isEnableQQOfficialRobotMarkdownTemplate && config.key !== '' && config.customTemplateId !== ''
  const macauBirthPopulation = 3712;
  const taiwanBirthPopulation = 137413;
  const hongKongBirthPopulation = 33200;
  const chinaBirthPopulation = 12123210;
  const totalPopulation = chinaBirthPopulation + hongKongBirthPopulation + macauBirthPopulation + taiwanBirthPopulation;
  const continentDict = {
    'AF': '非洲',
    'EU': '欧洲',
    'AS': '亚洲',
    'OA': '大洋洲',
    'NA': '北美洲',
    'SA': '南美洲',
    'AN': '南极洲'
  }
  // zl*
  // bz* h*
  ctx.command('toutai', '投胎模拟器帮助')
    .action(async ({session}) => {
      if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        return await sendMessage(session, `👨♂- 《投胎模拟器》 -♀👩
😆 欢迎游玩~ 祝您玩得开心！`, `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await session.execute(`toutai -h`)
    })
  // tt* zg* ttzg*
  ctx.command('toutai.投胎中国', '投胎到中国')
    .action(async ({session}) => {
      let {userId, username, timestamp} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const toutaiRecord = await ctx.database.get('toutai_records', {userId})
      if (toutaiRecord.length !== 0) {
        const lastTimestamp = Number(toutaiRecord[0].timestamp)
        const timeDifference = calculateTimeDifference(lastTimestamp, timestamp)
        const remainingWaitTime = Math.floor(config.nextReincarnationCooldownSeconds - timeDifference);
        if (timeDifference < config.nextReincarnationCooldownSeconds) {
          return await sendMessage(session, `请等待 ${remainingWaitTime} 秒后再投胎。`, `投胎中国 投胎世界 改名`, 2)
        }
      }
      const isRebirth = simulateRebirth(neonatalMortalityRateData['中国']);
      if (!isRebirth) {
        await ctx.database.set('toutai_records', {userId}, {
          numberOfStillbirthsInChina: toutaiRecord[0].numberOfStillbirthsInChina + 1,
          timestamp: String(timestamp)
        })
        await sendMessage(session, `抱歉，您在这次投胎中不幸夭折，再试一次吧！`, `投胎中国 投胎世界 改名`, 2)
      } else {
        const birthResult = simulateBirthInChina();
        if (toutaiRecord.length !== 0) {
          birthResult.index = toutaiRecord[0].birthResultsInChina.length + 1;
          toutaiRecord[0].birthResultsInChina.push(birthResult)
          await ctx.database.set('toutai_records', {userId}, {
            birthResultsInChina: toutaiRecord[0].birthResultsInChina,
            timestamp: String(timestamp)
          })
        } else {
          birthResult.index = 1;
          await ctx.database.create('toutai_records', {
            userId: userId,
            username: username,
            birthResultsInChina: [birthResult],
            timestamp: String(timestamp)
          })
        }
        let message = ''
        if (['香港', '澳门', '台湾'].includes(birthResult.province)) {
          message = `第 ${toutaiRecord[0].birthResultsInChina.length} 次投胎，您出生在${birthResult.province}，是一个${translateGenderChild(birthResult.gender)}。`
        } else {
          message = `第 ${toutaiRecord[0].birthResultsInChina.length} 次投胎，您出生在${birthResult.province}的${birthResult.category}，是一个${translateGenderChild(birthResult.gender)}，您是这个家庭的第${birthResult.order}个孩子。`
        }
        const mapBuffer = await generateChinaMap(toutaiRecord[0].birthResultsInChina, birthResult)
        const hImg = config.isMapImageIncludedAfterRebirth ? `${h.image(mapBuffer, `image/${config.imageType}`)}\n` : ``
        if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
          return await sendMessage(session, message, `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2)
        } else {
          await sendMessage(session, `${hImg}${message}`, `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2)
        }
      }
    })
  // tt* sj* ttsj*
  ctx.command('toutai.投胎世界', '投胎到世界')
    .action(async ({session}) => {
      let {userId, username, timestamp} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const toutaiRecord = await ctx.database.get('toutai_records', {userId})
      if (toutaiRecord.length !== 0) {
        const lastTimestamp = Number(toutaiRecord[0].timestamp)
        const timeDifference = calculateTimeDifference(lastTimestamp, timestamp)
        const remainingWaitTime = Math.floor(config.nextReincarnationCooldownSeconds - timeDifference);
        if (timeDifference < config.nextReincarnationCooldownSeconds) {
          return await sendMessage(session, `请等待 ${remainingWaitTime} 秒后再投胎。`, `投胎中国 投胎世界 改名`)
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
      const coordinate = foundElement['position']
      const center = foundElement['position']
      const dictName = foundElement['nameCn']
      const dictContinent = continentDict[foundElement['continent']]
      const neonatalMortalityRate = neonatalMortalityRateData[dictName] || 0
      if (neonatalMortalityRate !== 0 && !simulateRebirth(neonatalMortalityRate)) {
        toutaiRecord[0].unfortunateDemiseRecordsInWorld.push({
          index: toutaiRecord[0].unfortunateDemiseRecordsInWorld.length + 1,
          dictName,
          dictContinent
        })
        await ctx.database.set('toutai_records', {userId}, {
          numberOfStillbirthsInWorld: toutaiRecord[0].numberOfStillbirthsInWorld + 1,
          timestamp: String(timestamp),
          unfortunateDemiseRecordsInWorld: toutaiRecord[0].unfortunateDemiseRecordsInWorld
        })
        return await sendMessage(session, `抱歉，您投胎到${dictContinent}的${dictName}后不幸夭折，再试一次吧！`, `投胎中国 投胎世界 改名`)
      }
      const birthResultInWorld = {
        index: 0,
        dictName,
        dictContinent,
        coordinate,
        center
      }
      if (toutaiRecord.length !== 0) {
        birthResultInWorld.index = toutaiRecord[0].birthResultsInWorld.length + 1;
        toutaiRecord[0].birthResultsInWorld.push(birthResultInWorld)
        await ctx.database.set('toutai_records', {userId}, {
          birthResultsInWorld: toutaiRecord[0].birthResultsInWorld,
          timestamp: String(timestamp)
        })
      } else {
        birthResultInWorld.index = 1;
        await ctx.database.create('toutai_records', {
          userId: userId,
          username: username,
          birthResultsInWorld: [birthResultInWorld],
          timestamp: String(timestamp)
        })
      }
      const mapBuffer = await generateWorldMap(birthResultInWorld)
      const hImg = config.isMapImageIncludedAfterRebirth ? `${h.image(mapBuffer, `image/${config.imageType}`)}\n` : ``
      const message = `第 ${toutaiRecord[0].birthResultsInWorld.length} 次投胎，您出生在${dictContinent}的${dictName}。`
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, message, `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2)
      } else {
        await sendMessage(session, `${hImg}${message}`, `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2)
      }
    })
  // jl* ttzgjl*
  ctx.command('toutai.中国投胎记录', '中国投胎记录帮助')
    .action(async ({session}, startIndex) => {
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        return await sendMessage(session, `可查询的中国投胎记录如下：
请输入要查询的【类型】：`, `中国投胎记录总览 中国投胎成功历史 中国投胎地区分布 中国投胎性别分布 中国投胎第一次出现记录`, 2)
      }
      await session.execute(`toutai.中国投胎记录 -h`)
    })
  // jl* ttzgjl* zl*
  ctx.command('toutai.中国投胎记录.总览 [targetUser:text]', '中国投胎记录总览')
    .action(async ({session}, targetUser) => {
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)

      const result = await processTargetUser(session, userId, username, targetUser)
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;

      if (targetUserRecord.length === 0 || targetUserRecord[0].birthResultsInChina.length === 0) {
        return sendMessage(session, `被查询对象暂无投胎中国的记录。`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2);
      }

      const toutaiRecords: ToutaiRecord[] = await ctx.database.get('toutai_records', {});
      const userRank = getUserRankInChinaBirthResults(toutaiRecords, targetUserId);
      const userStillbirthsRank = getChinaStillbirthsRanking(toutaiRecords, userId);

      const {birthResultsInChina, numberOfStillbirthsInChina} = targetUserRecord[0]
      const analysisResult = analyzeChinaBirthResults(birthResultsInChina);
      const buffer = await generateChinaBirthOverviewTableImage(trimUsername(targetUserRecord[0].username), analysisResult, userRank, userStillbirthsRank, numberOfStillbirthsInChina)
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // jl* ttzgjl* cgls* lsxq*
  ctx.command('toutai.中国投胎记录.成功历史 [targetUser:text]', '中国投胎成功历史')
    .action(async ({session}, targetUser) => {
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const result = await processTargetUser(session, userId, username, targetUser)
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (targetUserRecord.length === 0 || targetUserRecord[0].birthResultsInChina.length === 0) {
        return sendMessage(session, `被查询对象暂无投胎中国的记录。`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2);
      }
      const {birthResultsInChina} = targetUserRecord[0]
      const last20Records = birthResultsInChina.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      const buffer = await generateTableImageFromBirthResultsInChinaArray(trimUsername(targetUserRecord[0].username), last20Records)
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // jl* ttzgjl* dqfb* dq*
  ctx.command('toutai.中国投胎记录.地区分布 [targetUser:text]', '中国投胎地区分布')
    .action(async ({session}, targetUser) => {
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const result = await processTargetUser(session, userId, username, targetUser)
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (targetUserRecord.length === 0 || targetUserRecord[0].birthResultsInChina.length === 0) {
        return sendMessage(session, `被查询对象暂无投胎中国的记录。`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2);
      }
      const {birthResultsInChina} = targetUserRecord[0]
      const buffer = await generateBirthRegionHorizontalBarChartRankings(trimUsername(targetUserRecord[0].username), birthResultsInChina)
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // jl* ttzgjl* xbfb* xb*
  ctx.command('toutai.中国投胎记录.性别分布 [targetUser:text]', '中国投胎性别分布')
    .action(async ({session}, targetUser) => {
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const result = await processTargetUser(session, userId, username, targetUser)
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (targetUserRecord.length === 0 || targetUserRecord[0].birthResultsInChina.length === 0) {
        return sendMessage(session, `被查询对象暂无投胎中国的记录。`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2);
      }
      const {birthResultsInChina} = targetUserRecord[0]
      const buffer = await generateChineseBirthGenderDistributionPieChart(trimUsername(targetUserRecord[0].username), birthResultsInChina)
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // jl* ttzgjl* dyccx*
  ctx.command('toutai.中国投胎记录.第一次出现 [targetUser:text]', '中国投胎第一次出现')
    .action(async ({session}, targetUser) => {
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const result = await processTargetUser(session, userId, username, targetUser)
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (targetUserRecord.length === 0 || targetUserRecord[0].birthResultsInChina.length === 0) {
        return sendMessage(session, `被查询对象暂无投胎中国的记录。`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2);
      }
      const {birthResultsInChina} = targetUserRecord[0]
      const buffer = await generateFirstChineseReincarnationRecordTableImage(trimUsername(targetUserRecord[0].username), birthResultsInChina)
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // jl* ttsjjl*
  ctx.command('toutai.世界投胎记录', '世界投胎记录帮助')
    .action(async ({session}, startIndex) => {
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        return await sendMessage(session, `可查询的世界投胎记录如下：
请输入要查询的【类型】：`, `世界投胎成功历史 世界投胎夭折历史 世界投胎记录总览`, 2)
      }
      await session.execute(`toutai.世界投胎记录 -h`)
    })
  // jl* ttsjjl* zl*
  ctx.command('toutai.世界投胎记录.总览 [targetUser:text]', '世界投胎记录总览')
    .action(async ({session}, targetUser) => { // db*
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)

      const result = await processTargetUser(session, userId, username, targetUser)
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;

      if (targetUserRecord.length === 0 || targetUserRecord[0].birthResultsInWorld.length === 0) {
        return sendMessage(session, `被查询对象暂无投胎世界的记录。`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2);
      }

      const toutaiRecords: ToutaiRecord[] = await ctx.database.get('toutai_records', {});
      const rankResult = getWorldRanking(toutaiRecords, targetUserId);
      const userRank = rankResult.birthResultsRank;
      const userStillbirthsRank = rankResult.numberOfStillbirthsRank;

      const {birthResultsInWorld, numberOfStillbirthsInWorld} = targetUserRecord[0]
      const analysisResult = analyzeWorldBirthResults(birthResultsInWorld);
      const buffer = await generateWorldBirthOverviewTableImage(trimUsername(targetUserRecord[0].username), analysisResult, userRank, userStillbirthsRank, numberOfStillbirthsInWorld)
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // jl* ttsjjl* cgls*
  ctx.command('toutai.世界投胎记录.成功历史 [targetUser:text]', '世界投胎成功历史')
    .action(async ({session}, targetUser) => {
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const result = await processTargetUser(session, userId, username, targetUser)
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (targetUserRecord.length === 0 || targetUserRecord[0].birthResultsInWorld.length === 0) {
        return sendMessage(session, `被查询对象暂无投胎世界的记录。`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2);
      }
      const {birthResultsInWorld} = targetUserRecord[0]
      const last20Records = birthResultsInWorld.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      const buffer = await generateTableImageFromBirthResultsInWorldArray(trimUsername(targetUserRecord[0].username), last20Records)
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // jl* ttsjjl* yzls*
  ctx.command('toutai.世界投胎记录.夭折历史 [targetUser:text]', '世界投胎夭折历史')
    .action(async ({session}, targetUser) => {
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const result = await processTargetUser(session, userId, username, targetUser)
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (targetUserRecord.length === 0 || targetUserRecord[0].unfortunateDemiseRecordsInWorld.length === 0) {
        return sendMessage(session, `被查询对象暂无投胎世界的记录。`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2);
      }
      const {unfortunateDemiseRecordsInWorld} = targetUserRecord[0]
      const last20Records = unfortunateDemiseRecordsInWorld.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      const buffer = await generateTableImageFromBirthResultsInWorldArrayForUnfortunateDemiseRecords(trimUsername(targetUserRecord[0].username), last20Records)
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // zgphb*
  ctx.command('toutai.中国投胎排行榜', '中国投胎排行榜帮助')
    .action(async ({session}, startIndex) => {
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        return await sendMessage(session, `可查看的中国投胎排行榜如下：
请输入要查看的【类型】：`, `中国投胎成功次数 中国投胎夭折次数 中国投胎男孩次数 中国投胎女孩次数`, 2)
      }
      await session.execute(`toutai.中国投胎排行榜 -h`)
    })
  // zgphb* ttcs*
  ctx.command('toutai.中国投胎排行榜.成功次数 [maxLeaderboardDisplayCount:number]', '中国投胎次数排行榜')
    .action(async ({session}, maxLeaderboardDisplayCount = config.defaultMaxDisplayCount) => {
      if (typeof maxLeaderboardDisplayCount !== 'number' || isNaN(maxLeaderboardDisplayCount) || maxLeaderboardDisplayCount < 0) {
        return '请输入大于等于 0 的数字作为排行榜的最大显示数量。';
      }
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const toutaiRecords: ToutaiRecord[] = await ctx.database.get('toutai_records', {});
      const buffer = await generateChineseBirthRankingsTableImage(toutaiRecords, maxLeaderboardDisplayCount, '中国投胎成功次数排行榜 排名 用户名 成功次数', 'birthResultsInChina.length')
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // zgphb* tzcs*
  ctx.command('toutai.中国投胎排行榜.夭折次数 [maxLeaderboardDisplayCount:number]', '中国夭折次数排行榜')
    .action(async ({session}, maxLeaderboardDisplayCount = config.defaultMaxDisplayCount) => {
      if (typeof maxLeaderboardDisplayCount !== 'number' || isNaN(maxLeaderboardDisplayCount) || maxLeaderboardDisplayCount < 0) {
        return '请输入大于等于 0 的数字作为排行榜的最大显示数量。';
      }
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const toutaiRecords: ToutaiRecord[] = await ctx.database.get('toutai_records', {});
      const buffer = await generateChineseBirthRankingsTableImage(toutaiRecords, maxLeaderboardDisplayCount, '中国投胎夭折次数排行榜 排名 用户名 夭折次数', 'numberOfStillbirthsInChina')
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // zgphb* nhcs*
  const genders = ['male', 'female']
  genders.forEach(gender => {
    ctx.command(`toutai.中国投胎排行榜.${translateGenderChild(gender)}次数 [maxLeaderboardDisplayCount:number]`, `中国投胎${translateGenderChild(gender)}次数排行榜`)
      .action(async ({session}, maxLeaderboardDisplayCount = config.defaultMaxDisplayCount) => {
        if (typeof maxLeaderboardDisplayCount !== 'number' || isNaN(maxLeaderboardDisplayCount) || maxLeaderboardDisplayCount < 0) {
          return '请输入大于等于 0 的数字作为排行榜的最大显示数量。';
        }
        let {userId, username} = session
        username = await getSessionUserName(session)
        await updateNameInPlayerRecord(session, userId, username)
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get('toutai_records', {});
        const buffer = await generateChineseBirthRankingsTableImage2(toutaiRecords, maxLeaderboardDisplayCount, `中国投胎${translateGenderChild(gender)}次数排行榜 排名 用户名 次数 birthResultsInChina gender ${gender}`)
        const hImg = h.image(buffer, `image/${config.imageType}`)
        if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
          return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
        }
        await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      });
  });
  // sjphb*
  ctx.command('toutai.世界投胎排行榜', '世界投胎排行榜帮助')
    .action(async ({session}, startIndex) => {
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        return await sendMessage(session, `可查看的世界投胎排行榜如下：
请输入要查看的【类型】：`, `世界投胎成功次数 世界投胎夭折次数 世界投胎亚洲次数 世界投胎欧洲次数 世界投胎南美洲次数 世界投胎南极洲次数 世界投胎大洋洲次数 世界投胎北美洲次数 世界投胎非洲次数`, 2)
      }
      await session.execute(`toutai.世界投胎排行榜 -h`)
    })
  // sjphb* ttcs*
  ctx.command('toutai.世界投胎排行榜.成功次数 [maxLeaderboardDisplayCount:number]', '世界投胎成功次数排行榜')
    .action(async ({session}, maxLeaderboardDisplayCount = config.defaultMaxDisplayCount) => {
      if (typeof maxLeaderboardDisplayCount !== 'number' || isNaN(maxLeaderboardDisplayCount) || maxLeaderboardDisplayCount < 0) {
        return '请输入大于等于 0 的数字作为排行榜的最大显示数量。';
      }
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const toutaiRecords: ToutaiRecord[] = await ctx.database.get('toutai_records', {});
      const buffer = await generateChineseBirthRankingsTableImage(toutaiRecords, maxLeaderboardDisplayCount, '世界投胎成功次数排行榜 排名 用户名 成功次数', 'birthResultsInWorld.length')
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // sjphb* yzcs* yz*
  ctx.command('toutai.世界投胎排行榜.夭折次数 [maxLeaderboardDisplayCount:number]', '世界投胎夭折次数排行榜')
    .action(async ({session}, maxLeaderboardDisplayCount = config.defaultMaxDisplayCount) => {
      if (typeof maxLeaderboardDisplayCount !== 'number' || isNaN(maxLeaderboardDisplayCount) || maxLeaderboardDisplayCount < 0) {
        return '请输入大于等于 0 的数字作为排行榜的最大显示数量。';
      }
      let {userId, username} = session
      username = await getSessionUserName(session)
      await updateNameInPlayerRecord(session, userId, username)
      const toutaiRecords: ToutaiRecord[] = await ctx.database.get('toutai_records', {});
      const buffer = await generateChineseBirthRankingsTableImage(toutaiRecords, maxLeaderboardDisplayCount, '世界投胎夭折次数排行榜 排名 用户名 夭折次数', 'numberOfStillbirthsInWorld')
      const hImg = h.image(buffer, `image/${config.imageType}`)
      if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
        return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      }
      await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
    })
  // sjphb*
  const continents = ['非洲', '欧洲', '亚洲', '北美洲', '南美洲', '大洋洲', '南极洲']
  continents.forEach(continent => {
    ctx.command(`toutai.世界投胎排行榜.${continent} [maxLeaderboardDisplayCount:number]`, `世界投胎${continent}次数排行榜`)
      .action(async ({session}, maxLeaderboardDisplayCount = config.defaultMaxDisplayCount) => {
        if (typeof maxLeaderboardDisplayCount !== 'number' || isNaN(maxLeaderboardDisplayCount) || maxLeaderboardDisplayCount < 0) {
          return '请输入大于等于 0 的数字作为排行榜的最大显示数量。';
        }
        let {userId, username} = session
        username = await getSessionUserName(session)
        await updateNameInPlayerRecord(session, userId, username)
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get('toutai_records', {});
        const buffer = await generateChineseBirthRankingsTableImage2(toutaiRecords, maxLeaderboardDisplayCount, `世界投胎${continent}次数排行榜 排名 用户名 次数 birthResultsInWorld dictContinent ${continent}`)
        const hImg = h.image(buffer, `image/${config.imageType}`)
        if (!config.isTextToImageConversionEnabled && isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false)
          return await sendMessage(session, `<@${userId}>`, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
        }
        await sendMessage(session, hImg, `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`, 2, false)
      });
  });
  // gm*
  ctx.command('toutai.改名 [newPlayerName:text]', '更改玩家名字')
    .action(async ({session}, newPlayerName) => {
      const {userId, user} = session;
      const username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);

      newPlayerName = newPlayerName?.trim();
      if (!newPlayerName) {
        return sendMessage(session, `请输入新的玩家名字。`, `投胎中国 投胎世界 改名`);
      }

      if (!(config.isEnableQQOfficialRobotMarkdownTemplate && session.platform === 'qq' && config.key && config.customTemplateId)) {
        return sendMessage(session, `不是 QQ 官方机器人的话，不用改名哦~`, `改名`);
      }

      if (newPlayerName.length > 20) {
        return sendMessage(session, `新的玩家名字过长，请重新输入。`, `投胎中国 投胎世界 改名`);
      }

      if (newPlayerName.includes("@everyone")) {
        return sendMessage(session, `新的玩家名字不合法，请重新输入。`, `投胎中国 投胎世界 改名`);
      }

      if (config.isUsingUnifiedKoishiBuiltInUsername) {
        return handleUnifiedKoishiUsername(session, newPlayerName);
      } else {
        return handleCustomUsername(ctx, session, userId, newPlayerName);
      }
    });


  // hs*

  async function handleUnifiedKoishiUsername(session, newPlayerName) {
    newPlayerName = h.transform(newPlayerName, {text: true, default: false}).trim();

    const users = await ctx.database.get('user', {});
    if (users.some(user => user.name === newPlayerName)) {
      return sendMessage(session, `新的玩家名字已经存在，请重新输入。`, `改名`);
    }

    try {
      session.user.name = newPlayerName;
      await session.user.$update();
      return sendMessage(session, `玩家名字已更改为：【${newPlayerName}】`, `查询玩家记录 开始游戏 改名`, 2);
    } catch (error) {
      if (RuntimeError.check(error, 'duplicate-entry')) {
        return sendMessage(session, `新的玩家名字已经存在，请重新输入。`, `改名`);
      } else {
        logger.warn(error);
        return sendMessage(session, `玩家名字更改失败。`, `改名`);
      }
    }
  }

  async function handleCustomUsername(ctx, session, userId, newPlayerName) {
    const players = await ctx.database.get('toutai_records', {});
    if (players.some(player => player.username === newPlayerName)) {
      return sendMessage(session, `新的玩家名字已经存在，请重新输入。`, `投胎中国 投胎世界 改名`);
    }

    const userRecord = await ctx.database.get('toutai_records', {userId});
    if (userRecord.length === 0) {
      await ctx.database.create('toutai_records', {
        userId,
        username: newPlayerName,
      });
    } else {
      await ctx.database.set('toutai_records', {userId}, {username: newPlayerName});
    }
    return await sendMessage(session, `玩家名字已更改为：【${newPlayerName}】`, `投胎中国 投胎世界 改名`, 2);
  }

  function simulateRebirthInWorld(worldData: WorldBirthrateData[]): string | null {
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

  function getWorldRanking(toutaiRecords: ToutaiRecord[], userId: string): {
    numberOfStillbirthsRank: number,
    birthResultsRank: number
  } {
    const userRecords = toutaiRecords.filter(record => record.userId === userId);

    if (userRecords.length === 0) {
      return {numberOfStillbirthsRank: -1, birthResultsRank: -1}; // 如果找不到对应 userId 的记录，返回 -1
    }

    const sortedByStillbirths = userRecords.slice().sort((a, b) => b.numberOfStillbirthsInWorld - a.numberOfStillbirthsInWorld);
    const numberOfStillbirthsRank = sortedByStillbirths.findIndex(record => record.userId === userId) + 1;

    const sortedByBirthResults = userRecords.slice().sort((a, b) => (b.birthResultsInWorld.length - a.birthResultsInWorld.length));
    const birthResultsRank = sortedByBirthResults.findIndex(record => record.userId === userId) + 1;

    return {numberOfStillbirthsRank, birthResultsRank};
  }

  function trimUsername(username: string): string {
    const maxLength = 10;

    if (username.length <= maxLength) {
      return username;
    } else {
      return username.slice(0, maxLength) + '...';
    }
  }

  async function generateChineseBirthGenderDistributionPieChart(username: string, birthResultsInChina: BirthResultInChina[]) {
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
<html>
<head>
    <title>中国投胎性别分布</title>
    <style>
        body {
            background-color: #F5F3EF;
        }

    </style>
    <!-- 引入 ECharts 库 -->
    <script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
</head>
<body>
<div id="genderChart" style="width: 800px; height: 600px;"></div>
<div id="legend" style="padding-left: 650px;"></div>

<script>
    const birthResultsInChina = ${JSON.stringify(birthResultsInChina)};

    // 统计男女数量
    let maleCount = 0;
    let femaleCount = 0;
    birthResultsInChina.forEach(result => {
        if (result.gender === 'male') {
            maleCount++;
        } else if (result.gender === 'female') {
            femaleCount++;
        }
    });

    // 计算百分比
    const totalCount = birthResultsInChina.length;
    const malePercentage = (maleCount / totalCount) * 100;
    const femalePercentage = (femaleCount / totalCount) * 100;

    // 初始化echarts实例
    var myChart = echarts.init(document.getElementById('genderChart'));

    // 配置饼图数据
    var option = {
        title: {
            text: \`${username}：投胎中国性别分布\`,
            subtext: \`总数：\${totalCount}\`,
            left: 'center',
            textStyle: {
                fontSize: 32 // 设置标题字体大小
            },
            subtextStyle: {
                fontSize: 24 // 设置标题字体大小
           }
        },
        series: [{
            type: 'pie',
            radius: '75%',
            center: ['50%', '60%'],
            data: [
                { value: maleCount, name: 'Male', itemStyle: { color: '#FF4F04' } },
                { value: femaleCount, name: 'Female', itemStyle: { color: '#00CA78' } }
            ],
            label: {
                show: true,
                position: 'inside',
                formatter: '{d}%',
                fontSize: 38,
                // 不透明度
                opacity: 0.8
            },
            animation: false, // 禁用动画
        }]
    };

    // 使用配置项显示图表
    myChart.setOption(option);

    // 显示图例
    const legend = document.getElementById('legend');
    legend.innerHTML = \`
    <div style="font-size: 24px">
    <span style="display: inline-block; width: 13px; height: 13px; background-color: #FF4F04; border-radius: 50%;"></span>
    男孩：\${maleCount}
    </div>
    <div style="font-size: 24px">
    <span style="display: inline-block; width: 13px; height: 13px; background-color: #00CA78; border-radius: 50%;"></span>
    女孩：\${femaleCount}
    </div>
      \`;
</script>
</body>
</html>

`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateChineseBirthRankingsTableImage2(toutaiRecords: ToutaiRecord[], maxLeaderboardDisplayCount: number, strings: string) {
    const stringsArray = strings.split(' ') // 世界投胎非洲次数排行榜 排名 用户名 次数 birthResultsInWorld dictContinent 非洲
    const title = stringsArray[0]
    const th1 = stringsArray[1]
    const th2 = stringsArray[2]
    const th3 = stringsArray[3]
    const type = stringsArray[4]
    const type2 = stringsArray[5]
    const type3 = stringsArray[6]
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            background-color: #F5F3EF;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px;
        }

        th, td {
            border: 1px solid #dddddd;
            padding: 8px;
            text-align: center;
        }

        th {
            background-color: #f2f2f2;
        }

        h1 {
            text-align: center;
            font-size: 32px;
        }
    </style>
</head>
<body>
<h1>${title}</h1>
<table>
    <thead>
    <tr>
        <th>${th1}</th>
        <th>${th2}</th>
        <th>${th3}</th>
    </tr>
    </thead>
    <tbody id="rankingsTableBody">
    </tbody>
</table>

<script>
    const toutaiRecords = ${JSON.stringify(toutaiRecords)};

        toutaiRecords.sort((a, b) => {
        const countA = a.${type}.filter(result => result.${type2} === '${type3}').length;
        const countB = b.${type}.filter(result => result.${type2} === '${type3}').length;

        return countB - countA;
    });

    const table = document.getElementById('rankingsTableBody');

    toutaiRecords.slice(0, ${maxLeaderboardDisplayCount}).forEach((record, index) => {
        const count = record.${type}.filter(result => result.${type2} === '${type3}').length;

        const row = table.insertRow(-1);
        const rankCell = row.insertCell(0);
        const usernameCell = row.insertCell(1);
        const countCell = row.insertCell(2);

        rankCell.textContent = index + 1;
        usernameCell.textContent = record.username;
        countCell.textContent = count + ' 次';
    });


</script>

</body>
</html>

`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateChineseBirthRankingsTableImage(toutaiRecords: ToutaiRecord[], maxLeaderboardDisplayCount: number, titleAndThString: string, typeString: string) {
    const titleAndTh = titleAndThString.split(' ')
    const title = titleAndTh[0]
    const th1 = titleAndTh[1]
    const th2 = titleAndTh[2]
    const th3 = titleAndTh[3]
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            background-color: #F5F3EF;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px;
        }

        th, td {
            border: 1px solid #dddddd;
            padding: 8px;
            text-align: center;
        }

        th {
            background-color: #f2f2f2;
        }

        h1 {
            text-align: center;
            font-size: 32px;
        }
    </style>
</head>
<body>
<h1>${title}</h1>
<table>
    <thead>
    <tr>
        <th>${th1}</th>
        <th>${th2}</th>
        <th>${th3}</th>
    </tr>
    </thead>
    <tbody id="rankingsTableBody">
    </tbody>
</table>

<script>
    const toutaiRecords = ${JSON.stringify(toutaiRecords)};

    toutaiRecords.sort((a, b) => b.${typeString} - a.${typeString});

    const rankingsTableBody = document.getElementById('rankingsTableBody');

    toutaiRecords.slice(0, ${maxLeaderboardDisplayCount}).forEach((record, index) => {
        const row = document.createElement('tr');
        row.innerHTML = \`
      <td>\${index + 1}</td>
      <td>\${record.username}</td>
      <td>\${record.${typeString}} 次</td>
        \`;
        rankingsTableBody.appendChild(row);
    });
</script>

</body>
</html>

`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateBirthRegionHorizontalBarChartRankings(username: string, birthResultsInChina: BirthResultInChina[]) {
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
<html lang="en">
<head>
    <title>中国投胎地区分布</title>
    <meta charSet="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            background-color: #F5F3EF;
        }

        .bar {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }

        .bar-name {
            width: 50px;
            text-align: right;
            padding-right: 20px;
        }

        .bar-fill {
            background-color: #EBE8E7;
            height: 30px;
            border-radius: 15px;
            margin-right: 10px;
            flex: 1;
        }

        .bar-count {
            display: flex;
            align-items: center;
        }

        .count {
            margin-right: 40px;
        }

        .percentage {
            margin-left: 40px;
        }

        h1 {
            text-align: center;
            font-size: 32px;
        }
    </style>
</head>
<body>
<h1>${username}：中国投胎地区分布</h1>
<div id="bars"></div>

<script>
    const birthResultsInChina = ${JSON.stringify(birthResultsInChina)};

    const provinceCounts = {};
    birthResultsInChina.forEach(result => {
        const {province} = result;
        provinceCounts[province] = (provinceCounts[province] || 0) + 1;
    });

    const totalResults = birthResultsInChina.length;

    // Sort provinces by count in descending order
    const sortedProvinces = Object.entries(provinceCounts)
            .sort((a, b) => b[1] - a[1]);

    const barsContainer = document.getElementById('bars');

    sortedProvinces.forEach(([province, count]) => {
        const percentage = (count / totalResults) * 100;

        const bar = document.createElement('div');
        bar.className = 'bar';

        const barName = document.createElement('div');
        barName.className = 'bar-name';
        barName.textContent = province;

        const barFill = document.createElement('div');
        barFill.className = 'bar-fill';
        barFill.style.width = \`\${percentage}%\`;

        const barCount = document.createElement('div');
        barCount.className = 'bar-count';

        const countElement = document.createElement('div');
        countElement.className = 'count';
        countElement.textContent = \`\${count}\`;

        const percentageElement = document.createElement('div');
        percentageElement.className = 'percentage';
        percentageElement.textContent = \`\${percentage.toFixed(2)}%\`;

        barCount.appendChild(countElement);
        barCount.appendChild(percentageElement);

        bar.appendChild(barName);
        bar.appendChild(barFill);
        bar.appendChild(barCount);

        barsContainer.appendChild(bar);
    });
</script>
</body>
</html>
`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateTableImageFromBirthResultsInWorldArrayForUnfortunateDemiseRecords(username: string, unfortunateDemiseRecordsInWorld: UnfortunateDemiseRecordInWorld[]): Promise<Buffer> {
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
   <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Birth Results Table</title>
    <style>
        body {
            background-color: #F5F3EF;
        }

        table {
            font-family: Arial, sans-serif;
            border-collapse: collapse;
            width: 100%;
        }

        th, td {
            border: 1px solid #dddddd;
            padding: 8px;
            text-align: center;
        }

        th {
            background-color: #EBE8E7;
        }

        h1 {
            text-align: center;
            font-size: 32px;
        }
    </style>
</head>
<body>

<h1>${username}：世界投胎夭折历史</h1>
<table id="unfortunateDemiseRecordsInWorldTable">
    <tr>
        <th>夭折次数</th>
        <th>地区</th>
        <th>国家</th>
    </tr>
</table>

<script>
    const unfortunateDemiseRecordsInWorld = ${JSON.stringify(unfortunateDemiseRecordsInWorld)};
    const table = document.getElementById("unfortunateDemiseRecordsInWorldTable");

    unfortunateDemiseRecordsInWorld.forEach(result => {
        const row = table.insertRow();
        const indexCell = row.insertCell(0);
        const continentCell = row.insertCell(1);
        const nameCell = row.insertCell(2);

        indexCell.textContent = result.index;
        nameCell.textContent = result.dictName;
        continentCell.textContent = result.dictContinent;
    });
</script>

</body>
</html>

`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateTableImageFromBirthResultsInWorldArray(username: string, birthResultsInWorld: BirthResultInWorld[]): Promise<Buffer> {
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
   <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Birth Results Table</title>
    <style>
        body {
            background-color: #F5F3EF;
        }

        table {
            font-family: Arial, sans-serif;
            border-collapse: collapse;
            width: 100%;
        }

        th, td {
            border: 1px solid #dddddd;
            padding: 8px;
            text-align: center;
        }

        th {
            background-color: #EBE8E7;
        }

        h1 {
            text-align: center;
            font-size: 32px;
        }
    </style>
</head>
<body>

<h1>${username}：世界投胎成功历史</h1>
<table id="birthResultsTable">
    <tr>
        <th>投胎次数</th>
        <th>地区</th>
        <th>国家</th>
    </tr>
</table>

<script>
    const birthResultsInWorld = ${JSON.stringify(birthResultsInWorld)};
    const table = document.getElementById("birthResultsTable");

    birthResultsInWorld.forEach(result => {
        const row = table.insertRow();
        const indexCell = row.insertCell(0);
        const continentCell = row.insertCell(1);
        const nameCell = row.insertCell(2);

        indexCell.textContent = result.index;
        nameCell.textContent = result.dictName;
        continentCell.textContent = result.dictContinent;
    });
</script>

</body>
</html>

`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateTableImageFromBirthResultsInChinaArray(username: string, birthResultsInChina: BirthResultInChina[]): Promise<Buffer> {
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
    <html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>投胎中国成功历史</title>
    <style>
     body {
          background-color: #F5F3EF;
      }

        table {
            border-collapse: collapse;
            width: 100%;
        }

        th, td {
            border: 1px solid #dddddd;
            padding: 8px;
            text-align: center;
        }

        th {
            background-color: #EBE8E7;
        }

        h1 {
            text-align: center;
            font-size: 32px;
        }
    </style>
</head>
<body>
<h1>${username}：中国投胎成功历史</h1>
<table>
    <tr>
        <th>投胎次数</th>
        <th>性别</th>
        <th>省份/地区</th>
        <th>区域</th>
        <th>第几孩</th>
    </tr>
</table>

<script>
    const birthResultsInChina = ${JSON.stringify(birthResultsInChina)}
    const table = document.querySelector('table');

    birthResultsInChina.forEach((result) => {
        const {index, province, gender, category, order} = result;

        const row = table.insertRow();
        row.insertCell().textContent = index;
        row.insertCell().textContent = translateGender(gender);
        row.insertCell().textContent = province;
        row.insertCell().textContent = category;
        row.insertCell().textContent = order;
    });

    function translateGender(gender) {
        switch (gender) {
            case 'male':
                return '男';
            case 'female':
                return '女';
            default:
                return gender;
        }
    }
</script>
</body>
</html>

`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateWorldBirthOverviewTableImage(username: string, analysisResult, userRank: number, userStillbirthsRank: number, numberOfStillbirthsInChina: number): Promise<Buffer> {
    const {totalCount, dictContinentCounts} = analysisResult;

    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>世界投胎记录总览</title>
    <style>
        body {
            background-color: #F5F3EF;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px auto;
        }
        th, td {
            border: 1px solid #dddddd;
            text-align: center;
            padding: 8px;
        }
        th {
            background-color: #EBE8E7;
        }
        h1 {
            text-align: center;
            font-size: 32px;
        }
    </style>
</head>
<body>

<h1>世界投胎记录总览</h1>

<table>
    <tr>
        <th colspan="2">被查询对象：${username}</th>
    </tr>
    <tr>
        <td>成功次数 [排名]</td>
        <td>${totalCount} 次 [${userRank}]</td>
    </tr>
    <tr>
        <td>夭折次数 [排名]</td>
        <td>${numberOfStillbirthsInChina} 次 [${userStillbirthsRank}]</td>
    </tr>
    <tr>
        <td>非洲次数</td>
        <td>${dictContinentCounts['非洲']} 次 ${Math.floor(Math.floor(dictContinentCounts['非洲']) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>欧洲次数</td>
        <td>${dictContinentCounts['欧洲']} 次 ${Math.floor(Math.floor(dictContinentCounts['欧洲']) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>亚洲次数</td>
        <td>${dictContinentCounts['亚洲']} 次 ${Math.floor(Math.floor(dictContinentCounts['亚洲']) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>北美洲次数</td>
        <td>${dictContinentCounts['北美洲']} 次 ${Math.floor(Math.floor(dictContinentCounts['北美洲']) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>南美洲次数</td>
        <td>${dictContinentCounts['南美洲']} 次 ${Math.floor(Math.floor(dictContinentCounts['南美洲']) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>大洋洲次数</td>
        <td>${dictContinentCounts['大洋洲']} 次 ${Math.floor(Math.floor(dictContinentCounts['大洋洲']) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>南极洲次数</td>
        <td>${dictContinentCounts['南极洲']} 次 ${Math.floor(Math.floor(dictContinentCounts['南极洲']) / totalCount * 100)}%</td>
    </tr>
</table>

</body>
</html>


`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateChinaBirthOverviewTableImage(username: string, analysisResult, userRank: number, userStillbirthsRank: number, numberOfStillbirthsInChina: number): Promise<Buffer> {
    const {totalCount, orderCounts, genderCounts, categoryCounts} = analysisResult;

    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>中国投胎记录总览</title>
    <style>
        body {
            background-color: #F5F3EF;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px auto;
        }
        th, td {
            border: 1px solid #dddddd;
            text-align: center;
            padding: 8px;
        }
        th {
            background-color: #EBE8E7;
        }
        h1 {
            text-align: center;
            font-size: 32px;
        }
    </style>
</head>
<body>

<h1>中国投胎记录总览</h1>

<table>
    <tr>
        <th colspan="2">被查询对象：${username}</th>
    </tr>
    <tr>
        <td>成功次数 [排名]</td>
        <td>${totalCount} 次 [${userRank}]</td>
    </tr>
    <tr>
        <td>夭折次数 [排名]</td>
        <td>${numberOfStillbirthsInChina} 次 [${userStillbirthsRank}]</td>
    </tr>
    <tr>
        <td>城镇次数</td>
        <td>${categoryCounts.城镇} 次 ${Math.floor(Math.floor(categoryCounts.城镇) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>城市次数</td>
        <td>${categoryCounts.城市} 次 ${Math.floor(Math.floor(categoryCounts.城市) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>乡村次数</td>
        <td>${categoryCounts.乡村} 次 ${Math.floor(Math.floor(categoryCounts.乡村) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>男孩次数</td>
        <td>${genderCounts.male} 次 ${Math.floor(Math.floor(genderCounts.male) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>女孩次数</td>
        <td>${genderCounts.female} 次 ${Math.floor(Math.floor(genderCounts.female) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>第一胎次数</td>
        <td>${orderCounts.一} 次 ${Math.floor(Math.floor(orderCounts.一) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>第二胎次数</td>
        <td>${orderCounts.二} 次 ${Math.floor(Math.floor(orderCounts.二) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>第三胎次数</td>
        <td>${orderCounts.三} 次 ${Math.floor(Math.floor(orderCounts.三) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>第四胎次数</td>
        <td>${orderCounts.四} 次 ${Math.floor(Math.floor(orderCounts.四) / totalCount * 100)}%</td>
    </tr>
    <tr>
        <td>第五胎及以上次数</td>
        <td>${orderCounts['五及以上']} 次 ${Math.floor(Math.floor(orderCounts['五及以上']) / totalCount) * 100}%</td>
    </tr>
</table>

</body>
</html>


`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateFirstChineseReincarnationRecordTableImage(username: string, birthResultsInChina: BirthResultInChina[]): Promise<Buffer> {
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>中国投胎第一次出现表</title>
    <style>
        body {
            background-color: #F5F3EF;
        }
        th, td {
            border: 1px solid #dddddd;
            padding: 8px;
            text-align: center;
        }

        th {
            background-color: #EBE8E7;
        }

        table {
            border-collapse: collapse;
            width: 100%;
        }

        .icon {
            margin-left: 20px;
        }

        h1 {
            text-align: center;
            font-size: 32px;
        }
    </style>
</head>

<body>
<h1>${username}：中国投胎第一次出现</h1>
<table id="birthResultsTable">
    <thead>
    <tr>
        <th>省份/地区</th>
        <th>第一次出现</th>
    </tr>
    </thead>
    <tbody>
    <!-- Table body content will be generated dynamically using JavaScript -->
    </tbody>
</table>

<script>
    const birthResultsInChina = ${JSON.stringify(birthResultsInChina)};

    const provinceData = {};

    birthResultsInChina.forEach(result => {
        const { province, index, gender } = result;
        if (!provinceData[province]) {
            provinceData[province] = { maleIndex: null, femaleIndex: null };
        }

        if (gender === 'male' && provinceData[province].maleIndex === null) {
            provinceData[province].maleIndex = index;
        } else if (gender === 'female' && provinceData[province].femaleIndex === null) {
            provinceData[province].femaleIndex = index;
        }
    });

    const tableBody = document.querySelector('#birthResultsTable tbody');

    for (const province in provinceData) {
        const row = document.createElement('tr');
        const provinceCell = document.createElement('td');
        provinceCell.textContent = province;
        row.appendChild(provinceCell);

        const indexCell = document.createElement('td');
        const maleIndex = provinceData[province].maleIndex !== null ? provinceData[province].maleIndex : '-';
        const femaleIndex = provinceData[province].femaleIndex !== null ? provinceData[province].femaleIndex : '-';
        indexCell.innerHTML = \`<svg width="12" height="12" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M435.6 130.4C434.1 131.6 433.2 132.2 432.5 133C399.8 165.7 367.1 198.3 334.4 231C330.9 234.5 330.9 236.7 333.3 240.9C359.6 285.6 366.1 333.4 351.3 382.8C334.3 439.6 297.4 479.3 241.7 500.1C191.9 518.8 142.5 515.4 95.7 490.5C47.7 465 17.2 424.7 5.10003 371.5C-5.19997 326 1.60003 282.6 25.1 242.3C51.8 196.5 91.7 167.9 143.3 156.9C187.9 147.5 230.5 154.6 270 177.9C275.3 181 278 180.5 282.2 176.3C313.6 144.5 345.2 113 376.8 81.5C378.3 80 379.7 78.5 381.9 76.1C379.3 75.9 377.8 75.8 376.4 75.8C358.2 75.7 339.9 76.1 321.8 75.4C300.9 74.6 285.8 57.9 286.1 37.2C286.4 16.8 302.9 0.299974 323.3 0.199974C345.8 -0.100026 368.3 0.0999741 390.9 0.0999741H469.6C496.5 0.0999741 511.9 15.5 511.9 42.4V185.8C511.9 210 495.2 226.6 471.8 226C453.8 225.6 437.2 210.1 436.6 192.1C435.9 173.5 436.3 154.9 436.2 136.3C435.9 134.6 435.7 132.9 435.6 130.4ZM178.6 435.8C235.1 436.5 281.6 390.7 282.7 333.4C283.8 277 237.2 229.7 179.9 229.1C123.2 228.5 76.6 274.9 76.1 332.4C75.7 388.4 121.9 435 178.6 435.8Z" fill="#43BCFF"></path></svg> \${maleIndex}
    <svg class="icon" height="14" viewBox="0 0 297 512" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M226.24 355.44H182.32V292C247.44 276.48 296.08 217.92 296.08 148.08C296.16 66.4 229.68 0 148.08 0C66.48 0 0 66.4 0 148.08C0 217.92 48.64 276.48 113.76 292V355.44H69.84C50.96 355.44 35.6 370.8 35.6 389.68C35.6 408.56 50.96 423.92 69.84 423.92H113.76V477.68C113.76 496.56 129.12 511.92 148 511.92C166.88 511.92 182.24 496.56 182.24 477.68V423.92H226.16C245.04 423.92 260.4 408.56 260.4 389.68C260.411 385.187 259.535 380.737 257.823 376.583C256.111 372.429 253.596 368.654 250.423 365.474C247.25 362.293 243.481 359.77 239.331 358.048C235.181 356.326 230.733 355.44 226.24 355.44ZM68.56 148.08C68.56 104.24 104.24 68.56 148.08 68.56C191.92 68.56 227.6 104.24 227.6 148.08C227.6 191.92 191.92 227.6 148.08 227.6C104.24 227.6 68.56 191.92 68.56 148.08Z" fill="#FC7CB4"></path></svg> \${femaleIndex}\`;
        row.appendChild(indexCell);

        tableBody.appendChild(row);
    }
</script>
</body>

</html>


`
    await page.setViewport({width: 800, height: 600, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function processTargetUser(session: any, userId: string, username: string, targetUser: string): Promise<{
    targetUserRecord: ToutaiRecord[],
    targetUserId: string
  }> {
    let targetUserRecord: ToutaiRecord[] = [];
    let targetUserId: string = userId;
    let targetUsername = username;

    if (!targetUser) {
      targetUserRecord = await ctx.database.get('toutai_records', {userId});
    } else {
      targetUser = await replaceAtTags(session, targetUser);

      if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
        targetUserRecord = await ctx.database.get('toutai_records', {username: targetUser});

        if (targetUserRecord.length === 0) {
          targetUserRecord = await ctx.database.get('toutai_records', {userId: targetUser});

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
          targetUserRecord = await ctx.database.get('toutai_records', {userId: targetUser});

          if (targetUserRecord.length !== 0) {
            targetUserId = targetUser;
          }
        } else {
          targetUserRecord = await ctx.database.get('toutai_records', {userId: targetUserId});
        }
      }
    }

    return {targetUserRecord, targetUserId};
  }

  function getChinaStillbirthsRanking(toutaiRecords: ToutaiRecord[], userId: string): number {
    const userRecords = toutaiRecords.filter(record => record.userId === userId);

    userRecords.sort((a, b) => b.numberOfStillbirthsInChina - a.numberOfStillbirthsInChina);

    return userRecords.findIndex(record => record.userId === userId) + 1;
  }

  function getUserRankInChinaBirthResults(toutaiRecords: ToutaiRecord[], userId: string): number {
    const sortedRecords = toutaiRecords.slice().sort((a, b) => b.birthResultsInChina.length - a.birthResultsInChina.length);
    return sortedRecords.findIndex(record => record.userId === userId) + 1;
  }

  function analyzeWorldBirthResults(birthResultsInWorld: BirthResultInWorld[]) {
    const totalCount = birthResultsInWorld.length;
    const dictContinentCounts: { [key: string]: number } = {
      '非洲': 0,
      '亚洲': 0,
      '欧洲': 0,
      '北美洲': 0,
      '南美洲': 0,
      '大洋洲': 0,
      '南极洲': 0
    };

    for (const result of birthResultsInWorld) {
      if (dictContinentCounts.hasOwnProperty(result.dictContinent)) {
        dictContinentCounts[result.dictContinent]++;
      }
    }

    return {totalCount, dictContinentCounts};
  }

  function analyzeChinaBirthResults(birthResultsInChina: BirthResultInChina[]) {
    const totalCount = birthResultsInChina.length;

    const orderCounts = {
      一: 0,
      二: 0,
      三: 0,
      四: 0,
      '五及以上': 0
    };

    const genderCounts = {
      male: 0,
      female: 0
    };

    const categoryCounts = {
      城镇: 0,
      城市: 0,
      乡村: 0
    };

    for (const result of birthResultsInChina) {
      // 统计 order
      switch (result.order) {
        case '一':
          orderCounts.一++;
          break;
        case '二':
          orderCounts.二++;
          break;
        case '三':
          orderCounts.三++;
          break;
        case '四':
          orderCounts.四++;
          break;
        default:
          orderCounts['五及以上']++;
          break;
      }

      // 统计 gender
      if (result.gender === 'male') {
        genderCounts.male++;
      } else {
        genderCounts.female++;
      }

      // 统计 category
      switch (result.category) {
        case '城镇':
          categoryCounts.城镇++;
          break;
        case '城市':
          categoryCounts.城市++;
          break;
        case '乡村':
          categoryCounts.乡村++;
          break;
      }
    }

    return {
      totalCount,
      orderCounts,
      genderCounts,
      categoryCounts
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
        const guildMember = await session.bot.getGuildMember(session.guildId, userId);

        // 替换原始的 at 标签
        const newAtTag = `<at id="${userId}" name="${guildMember.user.name}"/>`;
        content = content.replace(match[0], newAtTag);
      }
    }

    return content;
  }

  function translateGender(gender: string): string {
    switch (gender) {
      case 'male':
        return '男';
      case 'female':
        return '女';
      default:
        return gender;
    }
  }

  function calculateTimeDifference(previousTimestamp: number, currentTimestamp: number): number {
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

  async function generateWorldMap(birthResultInWorld: BirthResultInWorld): Promise<Buffer> {
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
<html lang="zh">
<head>
    <title>绘制世界地图</title>
    <meta charSet="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- 引入 ECharts 文件 -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js" integrity="sha512-k37wQcV4v2h6jgYf5IUz1MoSKPpDs630XGSmCaCCOXxy2awgAWKHGZWr9nMyGgk3IOxA1NxdkN8r1JHgkUtMoQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
</head>
<body>
<div id="main" style="width: 800px;height:400px;"></div>

<script>
    const myChart = echarts.init(document.getElementById('main'));
    const world = ${JSON.stringify(world)};
    echarts.registerMap('world', world);

            const option = {
                backgroundColor: '#E8E8E8',
                geo: {
                    map: 'world',
                    roam: true,
                    // zoom: 1.2,
                    zoom: 2.0,
                    label: {
                        emphasis: {
                            show: false,
                        }
                    },
                    center: ${JSON.stringify(birthResultInWorld.center)},
                    tooltip: {
                        show: true
                    },
                    // silent: true,
                    itemStyle: {
                        normal: {
                            areaColor: '#CFCFCF',
                            borderColor: '#111'
                        },
                        emphasis: {
                            areaColor: '#2a333d'
                        }
                    }
                },
                series: {
                    type: 'custom',
                    coordinateSystem: 'geo',
                    geoIndex: 0,
                    zlevel: 1,
                    data: [
                       ${JSON.stringify(birthResultInWorld.coordinate)}
                    ],
                    renderItem(params, api) {
                        const coord = api.coord([
                            api.value(0, params.dataIndex),
                            api.value(1, params.dataIndex)
                        ]);
                        const circles = [];
                        for (let i = 0; i < 5; i++) {
                            circles.push({
                                type: 'circle',
                                shape: {
                                    cx: 0,
                                    cy: 0,
                                    r: 30
                                },
                                style: {
                                    stroke: 'red',
                                    fill: 'none',
                                    lineWidth: 2
                                },
                                // Ripple animation
                                keyframeAnimation: {
                                    duration: 4000,
                                    loop: true,
                                    delay: (-i / 4) * 4000,
                                    keyframes: [
                                        {
                                            percent: 0,
                                            scaleX: 0,
                                            scaleY: 0,
                                            style: {
                                                opacity: 1
                                            }
                                        },
                                        {
                                            percent: 1,
                                            scaleX: 1,
                                            scaleY: 0.4,
                                            style: {
                                                opacity: 0
                                            }
                                        }
                                    ]
                                }
                            });
                        }
                        return {
                            type: 'group',
                            x: coord[0],
                            y: coord[1],
                            children: [
                                ...circles,
                                {
                                    type: 'path',
                                    shape: {
                                        d: 'M16 0c-5.523 0-10 4.477-10 10 0 10 10 22 10 22s10-12 10-22c0-5.523-4.477-10-10-10zM16 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z',
                                        x: -10,
                                        y: -35,
                                        width: 20,
                                        height: 40
                                    },
                                    style: {
                                        fill: 'red'
                                    },
                                    // Jump animation.
                                    keyframeAnimation: {
                                        duration: 1000,
                                        loop: true,
                                        delay: Math.random() * 1000,
                                        keyframes: [
                                            {
                                                y: -10,
                                                percent: 0.5,
                                                easing: 'cubicOut'
                                            },
                                            {
                                                y: 0,
                                                percent: 1,
                                                easing: 'bounceOut'
                                            }
                                        ]
                                    }
                                }
                            ]
                        };
                    }
                }
            };
            myChart.setOption(option);
</script>
</body>
</html>
`
    await page.setViewport({width: 800, height: 400, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function generateChinaMap(birthResults: BirthResultInChina[], birthResult: BirthResultInChina): Promise<Buffer> {
    const browser = ctx.puppeteer.browser
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const htmlContent = `
<html lang="zh">
<head>
    <title>绘制中国地图</title>
    <meta charSet="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
         body {
          background-color: #F5F3EF;
      }
    </style>
    <!-- 引入 ECharts 文件 -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js" integrity="sha512-k37wQcV4v2h6jgYf5IUz1MoSKPpDs630XGSmCaCCOXxy2awgAWKHGZWr9nMyGgk3IOxA1NxdkN8r1JHgkUtMoQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
</head>
<body>
<div id="main" style="width: 800px;height:674px;"></div>

<script>
    const mapName = 'china';
    const provinceMap = {};

    const totalPopulation = ${totalPopulation}
    const birthResults = ${JSON.stringify(birthResults)};

    birthResults.forEach(result => {
        if (provinceMap[result.province]) {
            provinceMap[result.province] += result.probability;
        } else {
            provinceMap[result.province] = result.probability;
        }
    });

    const dataList = Object.entries(provinceMap).map(([name, value]) => ({
        name,
        value
    }));

    const topNumber = dataList.length > 0 ? Math.max(...dataList.map(item => item.value)) : 0;
    const bottomNumber = dataList.length > 0 ? Math.min(...dataList.map(item => item.value)) : 0;

    const data = ${JSON.stringify(ChinaData)};
    const myChart = echarts.init(document.getElementById('main'));
    echarts.registerMap(mapName, data);
    const currentProvince = '${birthResult.province}';
    const markPointData = currentProvince
        ? data.features.find(
            feature => feature.properties.name === currentProvince
        )
        : null;
    const option = {
        visualMap: {
            min: 0,
            max: 5,
            left: 'left',
            top: 'bottom',
            text: [topNumber.toFixed(2) + '%', bottomNumber.toFixed(2) + '%'],
            inRange: {
                color: ['#f5e1d6', '#ff4f04']
            },
            show: false
        },
        geo: {
            map: 'china',
            roam: false,
            zoom: 1.23,
            label: {
                normal: {
                    show: true,
                    fontSize: '10',
                    color: '#181716',
                    fontWeight: 'medium'
                },
                emphasis: {
                    show: true,
                    color: '#181716'
                }
            },
            itemStyle: {
                normal: {
                    borderColor: '#bebfc0',
                    areaColor: '#fcfcfd'
                },
                emphasis: {
                    areaColor: '#afd8af'
                }
            }
        },
        series: [
            {
                name: '人口',
                type: 'map',
                geoIndex: 0,
                data: dataList,
                select: {
                    disabled: true
                },
                markPoint: {
                    symbol: 'pin',
                    symbolSize: 30,
                    animationDuration: 0,
                    itemStyle: {
                        color: '#01ca78'
                    },
                    data: markPointData
                        ? [
                            {
                                name: currentProvince,
                                coord: markPointData.properties.cp
                            }
                        ]
                        : []
                }
            }
        ]
    };
    myChart.setOption(option);
      const echartsMapClick = () => {};
        myChart.getZr().on('click', params => {
      if (params.target) {
        myChart.on('click', echartsMapClick);
      }
    });
</script>
</body>
</html>
`
    await page.setViewport({width: 800, height: 674, deviceScaleFactor: 2})
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), {waitUntil: 'load'});
    const buffer = await page.screenshot({type: config.imageType, fullPage: true});

    await page.close();
    await context.close()

    return buffer;
  }

  async function updateNameInPlayerRecord(session: any, userId: string, username: string): Promise<void> {
    const userRecord = await ctx.database.get('toutai_records', {userId});

    if (userRecord.length === 0) {
      await ctx.database.create('toutai_records', {
        userId,
        username,
      });
      return;
    }

    const existingRecord = userRecord[0];
    let isChange = false

    if (username !== existingRecord.username && !(isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq')) {
      existingRecord.username = username;
      isChange = true
    }

    if (isChange) {
      await ctx.database.set('toutai_records', {userId}, {
        username: existingRecord.username,
      });
    }

  }

  async function getSessionUserName(session: any): Promise<string> {
    let sessionUserName = session.username;

    if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
      const [user] = await ctx.database.get('user', {id: session.user.id})
      if (config.isUsingUnifiedKoishiBuiltInUsername && user.name) {
        sessionUserName = user.name
      } else {
        let userRecord = await ctx.database.get('', {userId: session.userId});

        if (userRecord.length === 0) {
          await ctx.database.create('wordle_player_records', {
            userId: session.userId,
            username: sessionUserName,
          });

          userRecord = await ctx.database.get('wordle_player_records', {userId: session.userId});
        }
        sessionUserName = userRecord[0].username;
      }

    }

    return sessionUserName;
  }

  function translateGenderChild(gender: string): string {
    switch (gender) {
      case 'male':
        return '男孩';
      case 'female':
        return '女孩';
      default:
        return gender;
    }
  }

  function isSpecialProvince(province: string): boolean {
    return ['xiang_gang', 'ao_men', 'tai_wan'].includes(province);
  }

  function simulateBirthInChina(): BirthResultInChina {
    const randomNumber = Math.random() * totalPopulation;

    let cumulativePopulation = 0;
    for (const region of birthrateDetailedData) {
      if (region.name === 'national') continue;
      for (const category of ['town', 'city', 'countryside'] as const) {
        for (const order of [
          'one',
          'two',
          'three',
          'four',
          'fivePlus'
        ] as const) {
          for (const gender of ['male', 'female'] as const) {
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
                  category === 'town'
                    ? '城镇'
                    : category === 'city'
                      ? '城市'
                      : '乡村',
                order:
                  order === 'one'
                    ? '一'
                    : order === 'two'
                      ? '二'
                      : order === 'three'
                        ? '三'
                        : order === 'four'
                          ? '四'
                          : '五及以上',
                probability: probability
              };
            }
          }
        }
      }
    }

    return {
      id: 0,
      province: '',
      gender: '',
      category: '',
      order: '',
      probability: 0
    };
  }

  function parseMarkdownCommands(markdownCommands: string): string[] {
    return markdownCommands.split(' ').filter(command => command.trim() !== '');
  }

  async function createButtons(session: any, markdownCommands: string) {
    const commands = parseMarkdownCommands(markdownCommands);

    const mapCommandToDataValue = (command: string) => {
      const commandMappings: Record<string, string> = {
        '投胎中国': 'toutai.投胎中国',
        '投胎世界': 'toutai.投胎世界',
        '改名': 'toutai.改名',
        '中国投胎记录': 'toutai.中国投胎记录',
        '中国投胎成功历史': 'toutai.中国投胎记录.成功历史',
        '中国投胎地区分布': 'toutai.中国投胎记录.地区分布',
        '中国投胎性别分布': 'toutai.中国投胎记录.性别分布',
        '中国投胎第一次出现记录': 'toutai.中国投胎记录.第一次出现',
        '中国投胎记录总览': 'toutai.中国投胎记录.总览',
        '世界投胎记录': 'toutai.世界投胎记录',
        '世界投胎成功历史': 'toutai.世界投胎记录.成功历史',
        '世界投胎夭折历史': 'toutai.世界投胎记录.夭折历史',
        '世界投胎记录总览': 'toutai.世界投胎记录.总览',
        '投胎中国排行榜': 'toutai.中国投胎排行榜',
        '中国投胎成功次数': 'toutai.中国投胎排行榜.成功次数',
        '中国投胎夭折次数': 'toutai.中国投胎排行榜.夭折次数',
        '中国投胎男孩次数': 'toutai.中国投胎排行榜.男孩次数',
        '中国投胎女孩次数': 'toutai.中国投胎排行榜.女孩次数',
        '投胎世界排行榜': 'toutai.世界投胎排行榜',
        '世界投胎成功次数': 'toutai.世界投胎排行榜.成功次数',
        '世界投胎夭折次数': 'toutai.世界投胎排行榜.夭折次数',
        '世界投胎亚洲次数': 'toutai.世界投胎排行榜.亚洲',
        '世界投胎欧洲次数': 'toutai.世界投胎排行榜.欧洲',
        '世界投胎非洲次数': 'toutai.世界投胎排行榜.非洲',
        '世界投胎北美洲次数': 'toutai.世界投胎排行榜.北美洲',
        '世界投胎南极洲次数': 'toutai.世界投胎排行榜.南极洲',
        '世界投胎大洋洲次数': 'toutai.世界投胎排行榜.大洋洲',
        '世界投胎南美洲次数': 'toutai.世界投胎排行榜.南美洲',
      };

      return commandMappings[command];
    };

    const createButton = async (command: string) => {
      let dataValue = mapCommandToDataValue(command);
      if (dataValue === undefined) {
        dataValue = command
      }

      return {
        render_data: {
          label: command,
          visited_label: command,
          style: 1,
        },
        action: {
          type: 2,
          permission: {type: 2},
          data: `${dataValue}`,
          enter: !['改名'].includes(command),
        },
      };
    };

    const buttonPromises = commands.map(createButton);
    return Promise.all(buttonPromises);
  }

  let sentMessages = [];
  const msgSeqMap: { [msgId: string]: number } = {};

  async function sendMessage(session: any, message: any, markdownCommands: string, numberOfMessageButtonsPerRow?: number, isAt: boolean = true, isButton: boolean = false): Promise<void> {
    numberOfMessageButtonsPerRow = numberOfMessageButtonsPerRow || config.numberOfMessageButtonsPerRow;
    const {bot, channelId, userId} = session;
    const username = await getSessionUserName(session)

    let messageId;
    let isPushMessageId = false;
    if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === 'qq') {
      const msgSeq = msgSeqMap[session.messageId] || 10;
      msgSeqMap[session.messageId] = msgSeq + 100;
      const buttons = await createButtons(session, markdownCommands);

      const rows = [];
      let row = {buttons: []};
      buttons.forEach((button, index) => {
        row.buttons.push(button);
        if (row.buttons.length === 5 || index === buttons.length - 1 || row.buttons.length === numberOfMessageButtonsPerRow) {
          rows.push(row);
          row = {buttons: []};
        }
      });

      if (!isButton && config.isTextToImageConversionEnabled) {
        let lines = message.toString().split('\n');
        const isOnlyImgTag = lines.length === 1 && lines[0].trim().startsWith('<img');
        if (isOnlyImgTag) {
          [messageId] = await session.send(message);
        } else {
          if (config.shouldPrefixUsernameInMessageSending && isAt) {
            lines = [`@${username}`, ...lines];
          }
          const modifiedMessage = lines
            .map((line) => {
              if (line.trim() !== '' && !line.includes('<img')) {
                return `# ${line}`;
              } else {
                return line + '\n';
              }
            })
            .join('\n');
          ctx.inject(['markdownToImage'], async (ctx) => {
            const imageBuffer = await ctx.markdownToImage.convertToImage(modifiedMessage);
            [messageId] = await session.send(h.image(imageBuffer, `image/${config.imageType}`));
          })
        }
        if (config.retractDelay !== 0) {
          isPushMessageId = true;
          sentMessages.push(messageId);
        }

        if (config.isTextToImageConversionEnabled && markdownCommands !== '') {
          await sendMessage(session, '', markdownCommands, numberOfMessageButtonsPerRow, false, true)
        }
      } else if (isButton && config.isTextToImageConversionEnabled) {
        const result = await session.qq.sendMessage(session.channelId, {
          msg_type: 2,
          msg_id: session.messageId,
          msg_seq: msgSeq,
          content: '',
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
        if (message.attrs?.src || message.includes('<img')) {
          [messageId] = await session.send(message);
        } else {
          message = message.replace(/\n/g, '\r');
          if (config.shouldPrefixUsernameInMessageSending && isAt) {
            message = `<@${userId}>\r${message}`;
          }
          const result = await session.qq.sendMessage(session.channelId, {
            msg_type: 2,
            msg_id: session.messageId,
            msg_seq: msgSeq,
            content: '111',
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
        let lines = message.toString().split('\n');
        const isOnlyImgTag = lines.length === 1 && lines[0].trim().startsWith('<img');
        if (isOnlyImgTag) {
          [messageId] = await session.send(message);
        } else {
          if (config.shouldPrefixUsernameInMessageSending && isAt) {
            lines = [`@${username}`, ...lines];
          }
          const modifiedMessage = lines
            .map((line) => {
              if (line.trim() !== '' && !line.includes('<img')) {
                return `# ${line}`;
              } else {
                return line + '\n';
              }
            })
            .join('\n');
          ctx.inject(['markdownToImage'], async (ctx) => {
            const imageBuffer = await ctx.markdownToImage.convertToImage(modifiedMessage);
            [messageId] = await session.send(h.image(imageBuffer, `image/${config.imageType}`));
          })
        }
      } else {
        if (config.shouldPrefixUsernameInMessageSending && isAt) {
          message = `@${username}\n${message}`;
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
