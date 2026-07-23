import { config } from "../model/config.js"
import crypto from "node:crypto"

const client = new (class OneBotHttpClientService {
  segmentToOneBot(item) {
    if (item === undefined || item === null) return false
    if (typeof item !== "object") return { type: "text", data: { text: String(item) } }

    switch (item.type) {
      case "text":
        return { type: "text", data: { text: String(item.text ?? "") } }
      case "image":
        return { type: "image", data: { file: item.file || item.url } }
      case "at":
        return { type: "at", data: { qq: item.qq || item.user_id } }
      case "reply":
        return { type: "reply", data: { id: item.id || item.message_id } }
      case "record":
      case "video":
      case "file":
        return { type: item.type, data: { file: item.file || item.url, name: item.name } }
      case "markdown":
        return { type: "markdown", data: { content: item.data || item.content || "" } }
      default:
        return { type: "text", data: { text: item.text ?? Bot.String(item) } }
    }
  }

  makeMessage(message) {
    const msg = Array.isArray(message) ? message : [message]
    return msg.map(item => this.segmentToOneBot(item)).filter(Boolean)
  }

  cqEncode(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/\[/g, "&#91;")
      .replace(/\]/g, "&#93;")
      .replace(/,/g, "&#44;")
  }

  cqSegment(type, data = {}) {
    const params = Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}=${this.cqEncode(value)}`)
      .join(",")
    return params ? `[CQ:${type},${params}]` : `[CQ:${type}]`
  }

  makeRawMessage(message) {
    return this.makeMessage(message)
      .map(item => {
        if (item.type === "text") return item.data.text
        if (item.type === "image") return this.cqSegment("image", { file: item.data.file })
        if (item.type === "at") return this.cqSegment("at", { qq: item.data.qq })
        if (item.type === "reply") return this.cqSegment("reply", { id: item.data.id })
        if (["record", "video", "file"].includes(item.type)) return this.cqSegment(item.type, item.data)
        return this.cqSegment(item.type)
      })
      .join("")
  }

  getRawMessage(e) {
    return String(e.raw_message || e.raw_msg || this.makeRawMessage(e.message ?? e.msg ?? ""))
  }

  isAtBotPrefix(prefix) {
    return ["@bot", "@机器人"].includes(String(prefix || "").trim())
  }

  botAtIds(e) {
    const ids = [e.self_id, e.bot?.uin, config.client.bot]
      .map(item => String(item || "").trim())
      .filter(Boolean)
    for (const id of [...ids]) {
      if (id.includes(":")) ids.push(id.split(":")[0])
    }
    return [...new Set(ids)]
  }

  atId(item) {
    if (!item || item.type !== "at") return ""
    return String(item.data?.qq || item.data?.user_id || item.qq || item.user_id || "").trim()
  }

  hasBotAt(e) {
    if (e.atme === true) return true

    const ids = this.botAtIds(e)
    const at = e.at
    if (at === true) return true
    if (Array.isArray(at) && at.map(item => String(item)).some(item => ids.includes(item))) return true
    if (at && typeof at === "object" && Object.values(at).map(item => String(item)).some(item => ids.includes(item))) return true

    const message = this.makeMessage(e.message ?? e.msg ?? "")
    if (message.some(item => ids.includes(this.atId(item)))) return true

    const rawMessage = this.getRawMessage(e)
    return ids.some(id => rawMessage.includes(`[CQ:at,qq=${id}]`))
  }

  escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  stripBotAtRaw(rawMessage, e) {
    let text = String(rawMessage || "")
    for (const id of this.botAtIds(e)) {
      const pattern = new RegExp(`\\[CQ:at,qq=${this.escapeRegExp(id)}\\]\\s*`, "g")
      text = text.replace(pattern, "")
    }
    return text.trim()
  }

  makeEvent(e) {
    const sourceMessage = e.message ?? e.msg ?? ""
    const message = this.makeMessage(sourceMessage)
    const rawMessage = e.raw_message || e.raw_msg || this.makeRawMessage(sourceMessage)
    const isGroup = e.isGroup || e.message_type === "group"

    const event = {
      time: e.time || Math.floor(Date.now() / 1000),
      self_id: String(e.self_id || e.bot?.uin || ""),
      post_type: "message",
      message_type: isGroup ? "group" : "private",
      sub_type: e.sub_type || (isGroup ? "normal" : "friend"),
      message_id: String(e.message_id || e.seq || Date.now()),
      user_id: String(e.user_id || ""),
      message: config.client.messageFormat === "string" ? rawMessage : message,
      raw_message: rawMessage,
      font: 0,
      sender: {
        user_id: String(e.user_id || ""),
        nickname: e.sender?.nickname || e.nickname || e.sender?.card || "",
        card: e.sender?.card || e.member?.card || "",
        role: e.sender?.role || e.member?.role || "member",
      },
    }

    if (isGroup) event.group_id = String(e.group_id || "")
    return event
  }

  isSelfMessage(e) {
    const selfId = String(e.self_id || e.bot?.uin || "")
    const userId = String(e.user_id || "")
    return Boolean(selfId && userId && selfId === userId)
  }

  inList(id, list) {
    return list.map(item => String(item)).includes(String(id || ""))
  }

  matchList(id, mode, list) {
    if (mode === "white") return this.inList(id, list)
    return !this.inList(id, list)
  }

  matchPrefix(e) {
    const prefix = String(config.client.prefix || "")
    const atBot = this.hasBotAt(e)
    if (!prefix) return ""
    if (this.isAtBotPrefix(prefix)) return atBot ? prefix : false

    const rawMessage = this.stripBotAtRaw(this.getRawMessage(e), e)
    return rawMessage.startsWith(prefix) ? prefix : false
  }

  trimEventMessage(event) {
    event.raw_message = String(event.raw_message || "").trim()

    if (typeof event.message === "string") {
      event.message = event.message.trim()
      return event
    }

    const firstText = event.message.find(item => item.type === "text")
    if (firstText?.data) firstText.data.text = String(firstText.data.text || "").trimStart()

    const lastText = [...event.message].reverse().find(item => item.type === "text")
    if (lastText?.data) lastText.data.text = String(lastText.data.text || "").trimEnd()

    event.message = event.message.filter(item => item.type !== "text" || item.data?.text)
    return event
  }

  stripBotAt(event, e) {
    event.raw_message = this.stripBotAtRaw(event.raw_message, e)

    const ids = this.botAtIds(e)
    if (typeof event.message === "string") {
      event.message = this.stripBotAtRaw(event.message, e)
      return this.trimEventMessage(event)
    }

    event.message = event.message.filter(item => !ids.includes(this.atId(item)))
    return this.trimEventMessage(event)
  }

  stripPrefix(event, prefix, e) {
    event = this.stripBotAt(event, e)
    if (!prefix || this.isAtBotPrefix(prefix) || config.client.includePrefix) return event

    if (event.raw_message?.startsWith(prefix)) event.raw_message = event.raw_message.slice(prefix.length).trimStart()

    if (typeof event.message === "string") {
      if (event.message.startsWith(prefix)) event.message = event.message.slice(prefix.length).trimStart()
      return this.trimEventMessage(event)
    }

    const firstText = event.message.find(item => item.type === "text")
    if (firstText?.data?.text?.startsWith(prefix)) firstText.data.text = firstText.data.text.slice(prefix.length).trimStart()
    return this.trimEventMessage(event)
  }

  shouldPost(e) {
    if (!config.client.enable || !config.client.endpoint) return false
    const selfId = String(e.self_id || e.bot?.uin || "")
    if (config.client.bot && selfId !== config.client.bot) return false
    if (!config.client.self && this.isSelfMessage(e)) return false
    const prefix = this.matchPrefix(e)
    if (prefix === false) return false

    const isGroup = e.isGroup || e.message_type === "group"
    if (isGroup) {
      if (!config.client.group) return false
    } else {
      if (!config.client.private) return false
    }

    if (!this.matchList(e.user_id, config.client.userMode, config.client.userList)) return false
    if (isGroup && !this.matchList(e.group_id, config.client.groupMode, config.client.groupList)) return false
    return prefix
  }

  post(e) {
    const prefix = this.shouldPost(e)
    if (prefix === false) return false

    const event = this.stripPrefix(this.makeEvent(e), prefix, e)
    const body = JSON.stringify(event)
    const headers = {
      "content-type": "application/json",
      "x-self-id": String(event.self_id || ""),
    }
    if (config.client.token) {
      const signature = crypto.createHmac("sha1", config.client.token).update(body).digest("hex")
      headers.authorization = `Bearer ${config.client.token}`
      headers["x-signature"] = `sha1=${signature}`
    }

    fetch(config.client.endpoint, {
      method: "POST",
      headers,
      body,
    }).catch(err => {
      Bot.makeLog("warn", `[OneBotHttp] HTTP Client 上报失败：${err.message || err}`)
      Bot.makeLog("debug", ["[OneBotHttp] HTTP Client 上报失败详情", err])
    })

    return true
  }
})()

export class OneBotHttpClient extends plugin {
  constructor() {
    super({
      name: "OneBotHttpClient",
      dsc: "OneBot HTTP Client",
      event: "message",
      rule: [
        {
          reg: ".*",
          fnc: "postEvent",
          log: false,
        },
      ],
    })
  }

  async postEvent() {
    client.post(this.e)
    return false
  }
}

