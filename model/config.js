import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.join(__dirname, "..")

export const configDir = path.join(pluginRoot, "config")
export const configFile = path.join(configDir, "config.yaml")
export const defaultConfigFile = path.join(configDir, "default.yaml")

export const defaultConfig = {
  server: {
    enable: false,
    bot: "",
    baseUrl: "",
    path: "/push",
    token: "",
    cors: true,
    messageFormat: "array",
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
  if ("enable" in config || "path" in config || "token" in config) {
    config.server = {
      ...config.server,
      enable: config.enable ?? config.server?.enable,
      baseUrl: config.baseUrl ?? config.server?.baseUrl,
      path: config.path ?? config.server?.path,
      token: config.token ?? config.server?.token,
    }
    delete config.enable
    delete config.baseUrl
    delete config.path
    delete config.token
  }
  delete config.preferGroup

  config.server = mergeConfig(structuredClone(defaultConfig.server), config.server)
  config.server.enable = normalizeBoolean(config.server.enable)
  config.server.cors = normalizeBoolean(config.server.cors)
  delete config.server.preferGroup
  config.server.bot = String(config.server.bot ?? "").trim()
  config.server.baseUrl = normalizeBaseUrl(config.server.baseUrl)
  config.server.path = String(config.server.path ?? "").trim()
  config.server.messageFormat = normalizeMessageFormat(config.server.messageFormat)
  config.client = mergeConfig(structuredClone(defaultConfig.client), config.client)
  config.client.enable = normalizeBoolean(config.client.enable)
  config.client.private = normalizeBoolean(config.client.private)
  config.client.group = normalizeBoolean(config.client.group)
  config.client.self = normalizeBoolean(config.client.self)
  config.client.includePrefix = normalizeBoolean(config.client.includePrefix)
  config.client.bot = String(config.client.bot ?? "").trim()
  config.client.messageFormat = normalizeMessageFormat(config.client.messageFormat)
  if (!config.server.replace?.length && config.client.replace) config.server.replace = config.client.replace
  delete config.client.replace
  config.server.replace = normalizeReplace(config.server.replace)
  config.server.at = normalizeAt(config.server.at)
  if (!config.client.prefix && config.client.prefixes) config.client.prefix = normalizeList(config.client.prefixes)[0] || ""
  delete config.client.prefixes
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

function stringifyList(list) {
  if (!list?.length) return "[]"
  return `\n${list.map(item => `    - ${quote(item)}`).join("\n")}`
}

function normalizeReplace(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => ({
      from: String(item?.from ?? "").trim(),
      to: String(item?.to ?? ""),
    }))
    .filter(item => item.from)
}

function stringifyReplace(list) {
  if (!list?.length) return "[]"
  return `\n${list.map(item => `    - from: ${quote(item.from)}\n      to: ${quote(item.to)}`).join("\n")}`
}

function normalizeAt(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => ({
      keyword: String(item?.keyword ?? "").trim(),
      qq: String(item?.qq ?? "").trim(),
    }))
    .filter(item => item.keyword && item.qq)
}

function stringifyAt(list) {
  if (!list?.length) return "[]"
  return `\n${list.map(item => `    - keyword: ${quote(item.keyword)}\n      qq: ${quote(item.qq)}`).join("\n")}`
}

function stringifyConfig() {
  return `# HTTP推送：外部程序调用云崽接口发送消息
server:
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
  # 推送消息格式，array 为消息段，string 为 CQ 码
  messageFormat: ${quote(config.server.messageFormat)}
  # 推送消息关键词替换，to 为空表示删除
  replace: ${stringifyReplace(config.server.replace)}
  # 群聊推送命中关键词时，在消息开头艾特指定QQ
  at: ${stringifyAt(config.server.at)}

# HTTP上报：把云崽收到的消息上报给外部程序
client:
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
  await fs.writeFile(configFile, stringifyConfig(), "utf8")
}

export async function loadConfig() {
  try {
    const data = YAML.parse(await fs.readFile(configFile, "utf8"))
    mergeConfig(config, data)
  } catch (err) {
    if (err.code === "ENOENT") {
      try {
        const data = YAML.parse(await fs.readFile(defaultConfigFile, "utf8"))
        mergeConfig(config, data)
      } catch (defaultErr) {
        if (defaultErr.code !== "ENOENT") logger.error("[OneBotHttp] 默认配置读取失败", defaultErr)
      }
    } else {
      logger.error("[OneBotHttp] 用户配置读取失败", err)
    }
  }

  normalizeConfig()
  await configSave()
  return config
}

export async function saveConfig(data = {}) {
  mergeConfig(config, data)
  await configSave()
}

await loadConfig()






