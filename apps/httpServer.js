import { config, normalizePath } from "../model/config.js"
import crypto from "node:crypto"
import http from "node:http"

const service = new (class OneBotHttpServerService {
  constructor() {
    this.name = "OneBotHttp"
    this.path = normalizePath(config.server.path)
    this.listenPath = this.path
    this.server = null
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

  replaceText(text) {
    text = String(text ?? "")
    const replace = config.server.replace || []
    if (!replace.length) return text
    for (const item of replace) {
      if (!item.from) continue
      text = text.split(String(item.from)).join(String(item.to ?? ""))
    }
    return text
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
    const qqs = []
    for (const rule of rules) {
      if (!rule.keyword || !rule.qq || !text.includes(rule.keyword)) continue
      if (!qqs.includes(rule.qq)) qqs.push(rule.qq)
    }
    if (!qqs.length) return message

    return [
      ...qqs.map(qq => ({ type: "at", qq })),
      { type: "text", text: "\n" },
      ...message,
    ]
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
      if (match.index > lastIndex) msgs.push({ type: "text", text: this.replaceText(this.cqDecode(source.slice(lastIndex, match.index))) })

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
          msgs.push({ type: "text", text: this.replaceText(this.cqDecode(match[0])) })
      }
      lastIndex = regexp.lastIndex
    }

    if (lastIndex < source.length) msgs.push({ type: "text", text: this.replaceText(this.cqDecode(source.slice(lastIndex))) })
    return msgs.filter(item => item.type !== "text" || item.text)
  }

  normalizeMessage(message) {
    if (message === undefined || message === null) return []
    if (typeof message === "string" || typeof message === "number" || typeof message === "boolean") {
      if (config.server.messageFormat === "string") return this.parseCqMessage(message)
      return [{ type: "text", text: this.replaceText(message) }]
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
        msgs.push({ type: "text", text: this.replaceText(item) })
        continue
      }

      const type = item.type || "text"
      const data = item.data && typeof item.data === "object" ? item.data : item

      switch (type) {
        case "text":
          if (data.text !== undefined) msgs.push({ type: "text", text: this.replaceText(data.text) })
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
          msgs.push({ type: "markdown", data: this.replaceText(data.content || data.text || data.data || "") })
          break
        case "raw":
          msgs.push({ type: "raw", data: data.data ?? data })
          break
        default:
          msgs.push({ type: "text", text: this.replaceText(data.text ?? Bot.String(item)) })
      }
    }

    return msgs
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

  getPrivateTarget(userId) {
    const parts = this.getTargetParts(userId)
    if (!parts.scoped && !config.server.bot) return { picker: Bot.pickFriend(String(userId)), sendId: String(userId) }

    const selfId = parts.scoped ? parts.selfId : config.server.bot
    const bot = Bot[selfId]
    if (!bot) return { error: this.fail(`协议端 ${selfId} 未连接`, 1500) }

    const sendId = parts.scoped && this.isQQBot(bot) ? String(userId) : parts.targetId
    return { picker: bot.pickFriend(sendId), sendId }
  }

  getGroupTarget(groupId) {
    const parts = this.getTargetParts(groupId)
    if (!parts.scoped && !config.server.bot) return { picker: Bot.pickGroup(String(groupId)), sendId: String(groupId) }

    const selfId = parts.scoped ? parts.selfId : config.server.bot
    const bot = Bot[selfId]
    if (!bot) return { error: this.fail(`协议端 ${selfId} 未连接`, 1500) }

    const sendId = parts.scoped && this.isQQBot(bot) ? String(groupId) : parts.targetId
    return { picker: bot.pickGroup(sendId), sendId }
  }

  async sendPrivate(params) {
    const userId = params.user_id || params.qq
    if (!userId) return this.fail("缺少 user_id")

    const target = this.getPrivateTarget(userId)
    if (target.error) return target.error

    const message = this.normalizeMessage(params.message)
    if (!message.length) return this.fail("缺少 message")

    const ret = await target.picker.sendMsg(message)
    return this.sendResult(ret)
  }

  async sendGroup(params) {
    const groupId = params.group_id
    if (!groupId) return this.fail("缺少 group_id")

    const target = this.getGroupTarget(groupId)
    if (target.error) return target.error

    const message = this.addKeywordAt(this.normalizeMessage(params.message))
    if (!message.length) return this.fail("缺少 message")

    const ret = await target.picker.sendMsg(message)
    return this.sendResult(ret)
  }

  async sendMsg(params) {
    if (params.message_type === "private") return this.sendPrivate(params)
    if (params.message_type === "group") return this.sendGroup(params)

    if (params.user_id || params.qq) return this.sendPrivate(params)
    if (params.group_id) return this.sendGroup(params)

    return this.fail("缺少 user_id 或 group_id")
  }

  async handle(req, res, next) {
    try {
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
          return res.send(await this.sendPrivate(this.params(req)))
        case "send_group_msg":
          return res.send(await this.sendGroup(this.params(req)))
        case "send_msg":
          return res.send(await this.sendMsg(this.params(req)))
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
      this.server = http.createServer(this.standaloneHandle.bind(this))
      globalThis.OneBotHttpServer = this.server
      this.server.listen(Number(url.port) || 80, url.hostname, () => this.logStarted())
      this.server.on("error", err => Bot.makeLog("error", [`[OneBotHttp] HTTP Server 启动失败：${url.origin}`, err]))
    } else if (hasCustomUrl) {
      Bot.makeLog("error", `[OneBotHttp] 推送地址格式错误：${config.server.baseUrl}`)
      return
    } else if (Bot.express) {
      this.listenPath = this.path
      Bot.express.use(this.path, this.handle.bind(this))
      Bot.express.quiet?.push?.(this.path)
      this.logStarted()
    } else {
      return
    }
  }
})()

service.load()


