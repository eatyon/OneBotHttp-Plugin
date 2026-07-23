import { config, normalizePath } from "../model/config.js"
import crypto from "node:crypto"
import http from "node:http"

const service = new (class OneBotHttpServerService {
  constructor() {
    this.name = "OneBotHttp"
    this.path = normalizePath(config.server.path)
    this.listenPath = this.path
  }

  ok(data = null) {
    return {
      status: "ok",
      retcode: 0,
      data,
      message: "",
      wording: "",
    }
  }

  fail(message, retcode = 1400) {
    return {
      status: "failed",
      retcode,
      data: null,
      message,
      wording: message,
    }
  }

  action(req) {
    return String(req.path || req.url || "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
  }

  params(req) {
    return {
      ...(req.query || {}),
      ...(req.body || {}),
    }
  }

  applyCors(req, res) {
    if (!config.server.cors) return

    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*")
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Signature,X-Self-ID,X-Requested-With")
    res.setHeader("Access-Control-Allow-Credentials", "true")
  }

  checkToken(req) {
    if (!config.server.token) return true

    const authorization = req.headers.authorization || ""
    const token = this.params(req).access_token
    return (
      authorization === `Bearer ${config.server.token}` ||
      authorization === `Token ${config.server.token}` ||
      token === config.server.token ||
      this.checkSignature(req)
    )
  }

  checkSignature(req) {
    const signature = req.headers["x-signature"]
    if (!signature || Array.isArray(signature)) return false

    const body = this.signatureBody(req.body)
    const sha1 = crypto.createHmac("sha1", config.server.token).update(body).digest("hex")
    return signature === `sha1=${sha1}` || signature === sha1
  }

  signatureBody(body) {
    if (body === undefined || body === null) return ""
    if (Buffer.isBuffer(body)) return body
    if (typeof body === "string") return body
    if (typeof body === "object") return Object.keys(body).length ? JSON.stringify(body) : ""
    return String(body)
  }

  baseUrl() {
    const baseUrl = String(config.server.baseUrl || "").trim()
    if (baseUrl) return `http://${baseUrl}`.replace(/\/+$/, "")
    return String(globalThis.Bot?.url || "").replace(/\/+$/, "")
  }

  listenUrl() {
    const baseUrl = String(config.server.baseUrl || "").trim()
    if (!baseUrl) return false
    try {
      const url = new URL(`http://${baseUrl}`)
      if (url.protocol !== "http:") return false
      return url
    } catch {
      return false
    }
  }

  joinUrl(base, routePath) {
    base = String(base || "").replace(/\/+$/, "")
    routePath = String(routePath || "").replace(/^\/+/, "")
    return routePath ? `${base}/${routePath}` : base
  }

  joinPath(basePath, routePath) {
    const paths = [basePath, routePath]
      .map(item => String(item || "").replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
    return paths.length ? `/${paths.join("/")}` : "/"
  }

  async readBody(req) {
    const chunks = []
    let size = 0
    const limit = 50 * 1024 * 1024

    for await (const chunk of req) {
      size += chunk.length
      if (size > limit) {
        const err = new Error("请求体过大")
        err.statusCode = 413
        throw err
      }
      chunks.push(chunk)
    }

    if (!chunks.length) return {}
    const text = Buffer.concat(chunks).toString("utf8")
    const contentType = String(req.headers["content-type"] || "")
    if (contentType.includes("application/json")) return JSON.parse(text)
    if (contentType.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text))
    return text
  }

  response(res) {
    return {
      setHeader: (...args) => res.setHeader(...args),
      status(code) {
        res.statusCode = code
        return this
      },
      send(data) {
        if (res.writableEnded) return
        if (Buffer.isBuffer(data) || typeof data === "string") return res.end(data)
        res.setHeader("content-type", "application/json; charset=utf-8")
        return res.end(JSON.stringify(data))
      },
      end: (...args) => res.end(...args),
    }
  }

  async standaloneHandle(req, res) {
    try {
      const url = new URL(req.url, "http://127.0.0.1")
      const mount = this.listenPath === "/" ? "" : this.listenPath
      if (mount && url.pathname !== mount && !url.pathname.startsWith(`${mount}/`)) {
        res.statusCode = 404
        return res.end("Not Found")
      }

      const routePath = mount ? url.pathname.slice(mount.length) || "/" : url.pathname
      await this.handle(
        {
          method: req.method,
          headers: req.headers,
          url: routePath,
          path: routePath,
          query: Object.fromEntries(url.searchParams),
          body: await this.readBody(req),
        },
        this.response(res),
      )
    } catch (err) {
      res.statusCode = err.statusCode || 500
      res.setHeader("content-type", "application/json; charset=utf-8")
      res.end(JSON.stringify(this.fail(err.message || String(err), res.statusCode)))
    }
  }

  logStarted() {
    if (!config.server.enable) return
    Bot.makeLog("info", "[OneBotHttp] HTTP Server 已启动")
    const base = this.baseUrl()
    Bot.makeLog("info", `[OneBotHttp] 推送地址：${base ? this.joinUrl(base, this.path) : "未设置"}`)
  }

  getTargetParts(target) {
    const text = String(target || "")
    const index = text.indexOf(":")
    if (index < 0) return { selfId: "", targetId: text, scoped: false }
    return {
      selfId: text.slice(0, index),
      targetId: text.slice(index + 1),
      scoped: true,
    }
  }

  isQQBot(bot) {
    return bot?.version?.id === "QQBot" || bot?.adapter?.id === "QQBot"
  }

  atToken(text) {
    return `{at:${String(text ?? "")}}`
  }

  isAnyAtToken(text) {
    return String(text ?? "") === "{at:*}"
  }

  isAllAtToken(text) {
    return String(text ?? "").toLowerCase() === "{at:all}"
  }

  isAtRule(text) {
    return /^\{at:[^}]*\}$/.test(String(text ?? ""))
  }

  isAllAtId(id) {
    return ["all", "everyone"].includes(String(id ?? "").toLowerCase())
  }

  atIdToken(id) {
    return this.isAllAtId(id) ? "{at:all}" : this.atToken(id)
  }

  decodeReplaceValue(text) {
    return String(text ?? "").replace(/\\n/g, "\n")
  }

  replaceListValues(list) {
    if (!Array.isArray(list)) return []
    return list
      .map(item => this.decodeReplaceValue(item).trim())
      .filter(Boolean)
  }

  messageAtIds(message) {
    return message
      .filter(item => item.type === "at" && item.qq)
      .map(item => String(item.qq))
  }

  hasReplaceKeyword(keyword, text, atIds) {
    if (this.isAnyAtToken(keyword)) return atIds.length > 0
    if (this.isAllAtToken(keyword)) return atIds.some(id => this.isAllAtId(id))
    if (this.isAtRule(keyword)) return atIds.includes(keyword.slice(4, -1))
    return text.includes(keyword)
  }

  shouldApplyReplace(item, text, atIds) {
    const excludes = this.replaceListValues(item.excludes)
    if (excludes.some(keyword => this.hasReplaceKeyword(keyword, text, atIds))) return false

    const keywords = this.replaceListValues(item.keywords)
    if (!keywords.length) return true
    if (item.keywordMode === "any") return keywords.some(keyword => this.hasReplaceKeyword(keyword, text, atIds))
    return keywords.every(keyword => this.hasReplaceKeyword(keyword, text, atIds))
  }

  isBlocked(message) {
    const rules = config.server.block || []
    if (!rules.length) return false
    const text = this.messageText(message)
    const atIds = this.messageAtIds(message)

    return rules.some(rule => {
      const keywords = this.replaceListValues(rule.keywords)
      if (!keywords.length) return false
      if (rule.mode === "all") return keywords.every(keyword => this.hasReplaceKeyword(keyword, text, atIds))
      return keywords.some(keyword => this.hasReplaceKeyword(keyword, text, atIds))
    })
  }

  replaceTextValue(text, conditionText, atIds) {
    text = String(text ?? "")
    const replace = config.server.replace || []
    if (!replace.length) return text
    for (const item of replace) {
      if (!this.shouldApplyReplace(item, conditionText, atIds)) continue
      for (const from of this.replaceListValues(item.from)) {
        if (this.isAtRule(from)) continue
        text = text.split(from).join(this.decodeReplaceValue(item.to))
      }
    }
    return text
  }

  splitAtText(text, baseType = "text") {
    text = String(text ?? "")
    const regexp = /\{at:([^}]*)\}/g
    const msgs = []
    let lastIndex = 0
    let match

    while ((match = regexp.exec(text))) {
      if (match.index > lastIndex) msgs.push({ type: baseType, [baseType === "markdown" ? "data" : "text"]: text.slice(lastIndex, match.index) })
      if (match[1] && match[1] !== "*") {
        msgs.push({ type: "at", qq: match[1] })
      } else {
        msgs.push({ type: baseType, [baseType === "markdown" ? "data" : "text"]: match[0] })
      }
      lastIndex = regexp.lastIndex
    }

    if (lastIndex < text.length) msgs.push({ type: baseType, [baseType === "markdown" ? "data" : "text"]: text.slice(lastIndex) })
    return msgs.filter(item => item.type !== baseType || item.text || item.data)
  }

  applyMixedAtReplace(message, conditionText, atIds) {
    const replace = config.server.replace || []
    if (!replace.length) return message

    const msgs = []
    let changed = false
    let source = ""

    const flush = () => {
      if (!source) return
      let text = source
      for (const item of replace) {
        if (!this.shouldApplyReplace(item, conditionText, atIds)) continue
        for (const from of this.replaceListValues(item.from)) {
          if (!from.includes("{at:") || this.isAnyAtToken(from)) continue
          text = text.split(from).join(this.decodeReplaceValue(item.to))
        }
      }
      if (text !== source) changed = true
      msgs.push(...this.splitAtText(text, "text"))
      source = ""
    }

    for (const item of message) {
      if (item.type === "text") {
        source += item.text || ""
        continue
      }
      if (item.type === "at") {
        source += this.atIdToken(item.qq)
        continue
      }
      flush()
      msgs.push(item)
    }
    flush()

    return changed ? this.mergeTextSegments(msgs) : message
  }

  mergeTextSegments(message) {
    const msgs = []
    for (const item of message) {
      const last = msgs[msgs.length - 1]
      if (item.type === "text" && last?.type === "text") {
        last.text = `${last.text || ""}${item.text || ""}`
        continue
      }
      if (item.type === "markdown" && last?.type === "markdown") {
        last.data = `${last.data || ""}${item.data || ""}`
        continue
      }
      msgs.push(item)
    }
    return msgs
  }

  replaceAtSegment(item, conditionText, atIds) {
    const replace = config.server.replace || []
    if (!replace.length || item.type !== "at") return [item]

    const token = this.atIdToken(item.qq)
    const rule = replace.find(i => {
      if (!this.shouldApplyReplace(i, conditionText, atIds)) return false
      return this.replaceListValues(i?.from).some(from => from === token || this.isAnyAtToken(from))
    })
    if (!rule) return [item]

    const text = this.decodeReplaceValue(rule.to)
    if (!text) return []
    return this.splitAtText(text, "text")
  }

  replaceTextSegment(item, conditionText, atIds) {
    const replace = config.server.replace || []
    if (!replace.length || (item.type !== "text" && item.type !== "markdown")) return [item]

    const key = item.type === "markdown" ? "data" : "text"
    const source = String(item[key] ?? "")
    const text = this.replaceTextValue(source, conditionText, atIds)
    if (text === source) return [item]
    return this.splitAtText(text, item.type)
  }

  applyReplace(message) {
    const replace = config.server.replace || []
    if (!replace.length) return message

    const conditionText = this.messageText(message)
    const atIds = this.messageAtIds(message)
    message = this.applyMixedAtReplace(message, conditionText, atIds)

    const msgs = []
    for (const item of message) {
      if (item.type === "at") {
        msgs.push(...this.replaceAtSegment(item, conditionText, atIds))
        continue
      }
      msgs.push(...this.replaceTextSegment(item, conditionText, atIds))
    }
    return this.mergeTextSegments(msgs)
  }

  messageText(message) {
    return message
      .map(item => {
        if (item.type === "text") return item.text || ""
        if (item.type === "markdown") return item.data || ""
        return ""
      })
      .join("")
  }

  addKeywordAt(message) {
    const rules = config.server.at || []
    if (!rules.length) return message

    const text = this.messageText(message)
    const ats = {
      prefix: [],
      prefixLine: [],
      suffixLine: [],
      suffix: [],
    }
    const seen = new Set()

    for (const rule of rules) {
      if (!rule.keyword || !rule.qq || !text.includes(rule.keyword)) continue
      const position = ats[rule.position] ? rule.position : "prefixLine"
      const key = `${position}:${rule.qq}`
      if (seen.has(key)) continue
      seen.add(key)
      ats[position].push({ type: "at", qq: rule.qq })
    }

    if (!seen.size) return message

    const msgs = []
    if (ats.prefix.length) msgs.push(...ats.prefix, { type: "text", text: " " })
    if (ats.prefixLine.length) msgs.push(...ats.prefixLine, { type: "text", text: "\n" })
    msgs.push(...message)
    if (ats.suffixLine.length) msgs.push({ type: "text", text: "\n" }, ...ats.suffixLine)
    if (ats.suffix.length) msgs.push({ type: "text", text: " " }, ...ats.suffix)
    return msgs
  }

  cqDecode(text) {
    return String(text ?? "")
      .replace(/&#91;/g, "[")
      .replace(/&#93;/g, "]")
      .replace(/&#44;/g, ",")
      .replace(/&amp;/g, "&")
  }

  parseCqData(text = "") {
    const data = {}
    for (const part of String(text).split(",")) {
      if (!part) continue
      const index = part.indexOf("=")
      if (index < 0) continue
      data[part.slice(0, index)] = this.cqDecode(part.slice(index + 1))
    }
    return data
  }

  parseCqMessage(text) {
    const source = String(text ?? "")
    const regexp = /\[CQ:([a-zA-Z0-9_-]+)((?:,[^\]]*)?)\]/g
    const msgs = []
    let lastIndex = 0
    let match

    while ((match = regexp.exec(source))) {
      if (match.index > lastIndex) msgs.push({ type: "text", text: this.cqDecode(source.slice(lastIndex, match.index)) })

      const type = match[1]
      const data = this.parseCqData(match[2]?.slice(1))
      switch (type) {
        case "image":
          msgs.push({ type: "image", file: data.file || data.url, summary: data.summary })
          break
        case "at":
          msgs.push({ type: "at", qq: data.qq || data.user_id })
          break
        case "reply":
          msgs.push({ type: "reply", id: String(data.id || data.message_id || "") })
          break
        case "record":
        case "video":
        case "file":
          msgs.push({ type, file: data.file || data.url, name: data.name })
          break
        default:
          msgs.push({ type: "text", text: this.cqDecode(match[0]) })
      }
      lastIndex = regexp.lastIndex
    }

    if (lastIndex < source.length) msgs.push({ type: "text", text: this.cqDecode(source.slice(lastIndex)) })
    return msgs.filter(item => item.type !== "text" || item.text)
  }

  normalizeMessage(message, applyReplace = true) {
    if (message === undefined || message === null) return []
    if (typeof message === "string" || typeof message === "number" || typeof message === "boolean") {
      const msgs = config.server.messageFormat === "string" ? this.parseCqMessage(message) : [{ type: "text", text: String(message) }]
      return applyReplace ? this.applyReplace(msgs) : msgs
    }
    if (!Array.isArray(message)) message = [message]

    const msgs = []
    for (const item of message) {
      if (item === undefined || item === null) continue
      if (typeof item !== "object") {
        if (config.server.messageFormat === "string") {
          msgs.push(...this.parseCqMessage(item))
          continue
        }
        msgs.push({ type: "text", text: String(item) })
        continue
      }

      const type = item.type || "text"
      const data = item.data && typeof item.data === "object" ? item.data : item

      switch (type) {
        case "text":
          if (data.text !== undefined) msgs.push({ type: "text", text: String(data.text) })
          break
        case "image":
          msgs.push({ type: "image", file: data.file || data.url, summary: data.summary })
          break
        case "at":
          msgs.push({ type: "at", qq: data.qq || data.user_id })
          break
        case "reply":
          msgs.push({ type: "reply", id: String(data.id || data.message_id || "") })
          break
        case "record":
        case "video":
        case "file":
          msgs.push({ type, file: data.file || data.url, name: data.name })
          break
        case "markdown":
          msgs.push({ type: "markdown", data: String(data.content || data.text || data.data || "") })
          break
        case "raw":
          msgs.push({ type: "raw", data: data.data ?? data })
          break
        default:
          msgs.push({ type: "text", text: String(data.text ?? Bot.String(item)) })
      }
    }

    return applyReplace ? this.applyReplace(msgs) : msgs
  }

  formatReceiveTime(date) {
    const pad = value => String(value).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }

  addReceiveTime(message, receiveTime) {
    if (!receiveTime) return message
    return [
      { type: "text", text: `[${this.formatReceiveTime(receiveTime)}]\n` },
      ...message,
    ]
  }

  messageId(ret) {
    if (!ret) return String(Date.now())
    if (Array.isArray(ret.message_id) && ret.message_id.length) return ret.message_id.join(",")
    if (ret.message_id) return ret.message_id
    if (ret.id) return ret.id
    if (Array.isArray(ret.data)) {
      const ids = ret.data.map(i => i?.id || i?.message_id).filter(Boolean)
      if (ids.length) return ids.join(",")
    }
    return String(Date.now())
  }

  sendResult(ret) {
    if (ret?.error?.length) {
      const message = ret.error.map(err => err?.message || String(err)).join("; ")
      return this.fail(message || "消息发送失败", 1500)
    }

    return this.ok({ message_id: this.messageId(ret) })
  }

  blockResult() {
    return {
      ...this.ok({ message_id: "" }),
      message: "消息已拦截",
      wording: "消息已拦截",
    }
  }

  async sendWithNoQWildRoute(target, message) {
    const picker = target?.picker
    if (!picker?.sendMsg) return { error: [{ message: "接收目标无效" }] }

    const send = () => picker.sendMsg(message)
    if (globalThis.QWild?.withNoRoute) return globalThis.QWild.withNoRoute(send)
    return send()
  }

  getPrivateTarget(userId) {
    const parts = this.getTargetParts(userId)
    if (!parts.scoped && !config.server.bot) return { picker: Bot.pickFriend(String(userId)) }

    const selfId = parts.scoped ? parts.selfId : config.server.bot
    const bot = Bot[selfId]
    if (!bot) return { error: this.fail(`协议端 ${selfId} 未连接`, 1500) }

    const sendId = parts.scoped && this.isQQBot(bot) ? String(userId) : parts.targetId
    return { picker: bot.pickFriend(sendId) }
  }

  getGroupTarget(groupId) {
    const parts = this.getTargetParts(groupId)
    if (!parts.scoped && !config.server.bot) return { picker: Bot.pickGroup(String(groupId)) }

    const selfId = parts.scoped ? parts.selfId : config.server.bot
    const bot = Bot[selfId]
    if (!bot) return { error: this.fail(`协议端 ${selfId} 未连接`, 1500) }

    const sendId = parts.scoped && this.isQQBot(bot) ? String(groupId) : parts.targetId
    return { picker: bot.pickGroup(sendId) }
  }

  async sendPrivate(params, receiveTime) {
    const userId = params.user_id || params.qq
    if (!userId) return this.fail("缺少 user_id")

    const target = this.getPrivateTarget(userId)
    if (target.error) return target.error

    const rawMessage = this.normalizeMessage(params.message, false)
    if (!rawMessage.length) return this.fail("缺少 message")
    if (this.isBlocked(rawMessage)) return this.blockResult()

    const message = this.applyReplace(rawMessage)
    if (!message.length) return this.fail("缺少 message")

    const ret = await this.sendWithNoQWildRoute(target, this.addReceiveTime(message, receiveTime))
    return this.sendResult(ret)
  }

  async sendGroup(params, receiveTime) {
    const groupId = params.group_id
    if (!groupId) return this.fail("缺少 group_id")

    const target = this.getGroupTarget(groupId)
    if (target.error) return target.error

    const rawMessage = this.normalizeMessage(params.message, false)
    if (!rawMessage.length) return this.fail("缺少 message")
    if (this.isBlocked(rawMessage)) return this.blockResult()

    const message = this.applyReplace(rawMessage)
    if (!message.length) return this.fail("缺少 message")

    const ret = await this.sendWithNoQWildRoute(target, this.addReceiveTime(this.addKeywordAt(message), receiveTime))
    return this.sendResult(ret)
  }

  async sendMsg(params, receiveTime) {
    if (params.message_type === "private") return this.sendPrivate(params, receiveTime)
    if (params.message_type === "group") return this.sendGroup(params, receiveTime)

    if (params.user_id || params.qq) return this.sendPrivate(params, receiveTime)
    if (params.group_id) return this.sendGroup(params, receiveTime)

    return this.fail("缺少 user_id 或 group_id")
  }

  async handle(req, res, next) {
    try {
      const receiveTime = config.server.addReceiveTime ? new Date() : null
      this.applyCors(req, res)
      if (req.method === "OPTIONS" && config.server.cors) return res.status(204).end()

      if (!config.server.enable) return res.status(503).send(this.fail("OneBot HTTP 推送未开启", 1503))
      if (!this.checkToken(req)) return res.status(403).send(this.fail("Token 校验失败", 1403))

      switch (this.action(req)) {
        case "":
        case "get_status":
          return res.send(this.ok({ good: true, online: true }))
        case "get_version_info":
          return res.send(
            this.ok({
              app_name: this.name,
              protocol_version: "v11",
            }),
          )
        case "send_private_msg":
          return res.send(await this.sendPrivate(this.params(req), receiveTime))
        case "send_group_msg":
          return res.send(await this.sendGroup(this.params(req), receiveTime))
        case "send_msg":
          return res.send(await this.sendMsg(this.params(req), receiveTime))
        default:
          if (this.path === "/" && typeof next === "function") return next()
          return res.status(404).send(this.fail("不支持的接口", 1404))
      }
    } catch (err) {
      Bot.makeLog("error", ["[OneBotHttp] HTTP Server 错误", err])
      return res.status(500).send(this.fail(err.message || String(err), 1500))
    }
  }

  load() {
    this.path = normalizePath(config.server.path)

    const hasCustomUrl = Boolean(String(config.server.baseUrl || "").trim())
    const url = this.listenUrl()
    if (url) {
      if (!config.server.enable) {
        globalThis.OneBotHttpServer?.close?.()
        globalThis.OneBotHttpServer = null
        return
      }

      this.listenPath = this.joinPath(url.pathname, this.path)
      globalThis.OneBotHttpServer?.close?.()
      const server = http.createServer(this.standaloneHandle.bind(this))
      globalThis.OneBotHttpServer = server
      server.listen(Number(url.port) || 80, url.hostname, () => this.logStarted())
      server.on("error", err => Bot.makeLog("error", [`[OneBotHttp] HTTP Server 启动失败：${url.origin}`, err]))
    } else if (hasCustomUrl) {
      Bot.makeLog("error", `[OneBotHttp] 推送地址格式错误：${config.server.baseUrl}`)
      return
    } else if (Bot.express) {
      this.listenPath = this.path
      Bot.express.use(this.path, this.handle.bind(this))
      Bot.express.skip_auth?.push?.(this.path)
      Bot.express.quiet?.push?.(this.path)
      this.logStarted()
    } else {
      return
    }
  }
})()

service.load()


