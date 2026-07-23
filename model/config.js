import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.join(__dirname, "..")

export const configDir = path.join(pluginRoot, "config")
const serverConfigFile = path.join(configDir, "server.yaml")
const clientConfigFile = path.join(configDir, "client.yaml")
const serverDefaultConfigFile = path.join(configDir, "server_default.yaml")
const clientDefaultConfigFile = path.join(configDir, "client_default.yaml")

export const defaultConfig = {
  server: {
    enable: false,
    bot: "",
    baseUrl: "",
    path: "/push",
    token: "",
    cors: true,
    addReceiveTime: false,
    messageFormat: "array",
    block: [],
    replace: [],
    at: [],
  },
  client: {
    enable: false,
    bot: "",
    endpoint: "",
    token: "",
    messageFormat: "array",
    private: true,
    group: true,
    self: false,
    userMode: "black",
    userList: [],
    groupMode: "black",
    groupList: [],
    prefix: "@bot",
    includePrefix: false,
  },
}

export const config = structuredClone(defaultConfig)

function mergeConfig(target, source) {
  if (!source || typeof source !== "object") return target
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {}
      mergeConfig(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

export function normalizePath(routePath) {
  routePath = String(routePath ?? "").trim()
  if (!routePath) return "/"
  if (!routePath.startsWith("/")) routePath = `/${routePath}`
  return routePath.replace(/\/+$/, "") || "/"
}

function normalizeBaseUrl(url) {
  url = String(url ?? "").trim()
  if (!url) return ""
  url = url.replace(/^https?:\/\//i, "")
  return url.replace(/\/+$/, "")
}

function normalizeConfig() {
  config.server = mergeConfig(structuredClone(defaultConfig.server), config.server)
  config.server.enable = normalizeBoolean(config.server.enable)
  config.server.cors = normalizeBoolean(config.server.cors)
  config.server.addReceiveTime = normalizeBoolean(config.server.addReceiveTime)
  config.server.bot = String(config.server.bot ?? "").trim()
  config.server.baseUrl = normalizeBaseUrl(config.server.baseUrl)
  config.server.path = String(config.server.path ?? "").trim()
  config.server.messageFormat = normalizeMessageFormat(config.server.messageFormat)
  config.server.block = normalizeBlock(config.server.block)
  config.client = mergeConfig(structuredClone(defaultConfig.client), config.client)
  config.client.enable = normalizeBoolean(config.client.enable)
  config.client.private = normalizeBoolean(config.client.private)
  config.client.group = normalizeBoolean(config.client.group)
  config.client.self = normalizeBoolean(config.client.self)
  config.client.includePrefix = normalizeBoolean(config.client.includePrefix)
  config.client.bot = String(config.client.bot ?? "").trim()
  config.client.messageFormat = normalizeMessageFormat(config.client.messageFormat)
  config.server.replace = normalizeReplace(config.server.replace)
  config.server.at = normalizeAt(config.server.at)
  config.client.userMode = normalizeMode(config.client.userMode)
  config.client.groupMode = normalizeMode(config.client.groupMode)
  config.client.userList = normalizeList(config.client.userList)
  config.client.groupList = normalizeList(config.client.groupList)
  config.client.prefix = String(config.client.prefix ?? "")
}

function quote(value) {
  return JSON.stringify(String(value ?? ""))
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return !["false", "0", "off", "no", "关闭"].includes(value.trim().toLowerCase())
  return Boolean(value)
}

function normalizeMode(mode) {
  return ["white", "black"].includes(mode) ? mode : "black"
}

function normalizeMessageFormat(format) {
  return ["array", "string"].includes(format) ? format : "array"
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
  return String(value || "")
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean)
}

function stringifyList(list, indent = 2) {
  if (!list?.length) return "[]"
  const space = " ".repeat(indent)
  return `\n${list.map(item => `${space}- ${quote(item)}`).join("\n")}`
}

function stringifyFieldList(key, list, indent = 6) {
  if (!list?.length) return `${key}: []`
  return `${key}:${stringifyList(list, indent)}`
}

function normalizeReplace(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => ({
      keywords: normalizeReplaceList(item?.keywords),
      keywordMode: ["all", "any"].includes(item?.keywordMode) ? item.keywordMode : "all",
      excludes: normalizeReplaceList(item?.excludes),
      from: normalizeReplaceList(item?.from),
      to: String(item?.to ?? ""),
    }))
    .filter(item => item.from.length)
}

function normalizeReplaceList(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
  return []
}

function normalizeBlock(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => ({
      keywords: normalizeReplaceList(item?.keywords),
      mode: item?.mode === "any" ? "any" : "all",
    }))
    .filter(item => item.keywords.length)
}

function stringifyBlock(list) {
  if (!list?.length) return "[]"
  return `\n${list.map(item => `  - ${stringifyFieldList("keywords", item.keywords, 6)}\n    mode: ${quote(item.mode)}`).join("\n")}`
}

function stringifyReplace(list) {
  if (!list?.length) return "[]"
  return `\n${list.map(item => `  - ${stringifyFieldList("keywords", item.keywords, 6)}\n    keywordMode: ${quote(item.keywordMode)}\n    ${stringifyFieldList("excludes", item.excludes, 6)}\n    ${stringifyFieldList("from", item.from, 6)}\n    to: ${quote(item.to)}`).join("\n")}`
}

function normalizeAtPosition(position) {
  return ["prefix", "prefixLine", "suffixLine", "suffix"].includes(position) ? position : "prefixLine"
}

function normalizeAt(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => ({
      keyword: String(item?.keyword ?? "").trim(),
      qq: String(item?.qq ?? "").trim(),
      position: normalizeAtPosition(item?.position),
    }))
    .filter(item => item.keyword && item.qq)
}

function stringifyAt(list) {
  if (!list?.length) return "[]"
  return `\n${list.map(item => `    - keyword: ${quote(item.keyword)}\n      qq: ${quote(item.qq)}\n      position: ${quote(item.position)}`).join("\n")}`
}

function stringifyServerConfig() {
  return `# HTTP推送：外部程序调用云崽接口发送消息
# 是否启用推送
enable: ${config.server.enable}
# 用哪个协议端发送，留空自动选择
bot: ${quote(config.server.bot)}
# 推送地址，示例：localhost:3000，留空使用云崽服务器地址，修改后需要重启云崽
baseUrl: ${quote(config.server.baseUrl)}
# 推送地址后缀，留空表示直接挂载到推送地址路径，修改后需要重启云崽
path: ${quote(config.server.path)}
# 访问 Token 留空表示不校验
token: ${quote(config.server.token)}
# 是否允许浏览器跨域调用
cors: ${config.server.cors}
# 是否在推送消息开头添加收到请求的时间
addReceiveTime: ${config.server.addReceiveTime}
# 推送消息格式，array 为消息段，string 为 CQ 码
messageFormat: ${quote(config.server.messageFormat)}
# 推送消息关键词拦截，命中后返回成功但不发送，支持 \\n 换行、{at:*} 任意艾特和 {at:all} 全体艾特
block: ${stringifyBlock(config.server.block)}
# 推送消息关键词替换，触发条件、排除条件和被替换内容可多选，to 为空表示删除，支持 \\n 换行和 {at:目标ID} 艾特，{at:*} 可匹配任意真实艾特，{at:all} 可匹配全体艾特
replace: ${stringifyReplace(config.server.replace)}
# 群聊推送命中关键词时，按位置艾特指定QQ
at: ${stringifyAt(config.server.at)}
`
}

function stringifyClientConfig() {
  return `# HTTP上报：把云崽收到的消息上报给外部程序
# 是否启用上报
enable: ${config.client.enable}
# 上报哪个协议端收到的消息，留空表示全部协议端
bot: ${quote(config.client.bot)}
# 外部事件接收地址
endpoint: ${quote(config.client.endpoint)}
# 访问 Token 留空表示不校验
token: ${quote(config.client.token)}
# 上报消息格式，array 为消息段，string 为 CQ 码
messageFormat: ${quote(config.client.messageFormat)}
# 是否上报私聊
private: ${config.client.private}
# 是否上报群聊
group: ${config.client.group}
# 是否上报自身消息
self: ${config.client.self}
# QQ过滤模式，white 只上报名单内 QQ，black 排除名单内 QQ
userMode: ${quote(config.client.userMode)}
# QQ名单
userList: ${stringifyList(config.client.userList)}
# 群过滤模式，white 只上报名单内群，black 排除名单内群
groupMode: ${quote(config.client.groupMode)}
# 群名单
groupList: ${stringifyList(config.client.groupList)}
# 上报前缀，@bot 表示艾特机器人触发，留空表示不限制前缀
prefix: ${quote(config.client.prefix)}
# 是否保留文本前缀，机器人艾特始终会自动去掉
includePrefix: ${config.client.includePrefix}
`
}
export async function configSave() {
  normalizeConfig()
  await fs.mkdir(configDir, { recursive: true })
  await fs.writeFile(serverConfigFile, stringifyServerConfig(), "utf8")
  await fs.writeFile(clientConfigFile, stringifyClientConfig(), "utf8")
}

async function readConfigFile(file, label) {
  try {
    return YAML.parse(await fs.readFile(file, "utf8")) || {}
  } catch (err) {
    if (err.code !== "ENOENT") logger.error(`[OneBotHttp] ${label}读取失败`, err)
    return {}
  }
}

export async function loadConfig() {
  const serverDefault = await readConfigFile(serverDefaultConfigFile, "推送默认配置")
  const clientDefault = await readConfigFile(clientDefaultConfigFile, "上报默认配置")
  const serverConfig = await readConfigFile(serverConfigFile, "推送配置")
  const clientConfig = await readConfigFile(clientConfigFile, "上报配置")

  config.server = mergeConfig(config.server, serverDefault)
  config.server = mergeConfig(config.server, serverConfig)
  config.client = mergeConfig(config.client, clientDefault)
  config.client = mergeConfig(config.client, clientConfig)

  normalizeConfig()
  await configSave()
  return config
}

await loadConfig()






