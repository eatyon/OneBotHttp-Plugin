import { config, configSave, normalizePath } from "../model/config.js"

export class OneBotHttpAdmin extends plugin {
  constructor() {
    super({
      name: "OneBotHttpAdmin",
      dsc: "OneBot HTTP Admin",
      event: "message",
      rule: [
        {
          reg: "^#[hH][tT][tT][pP]状态$",
          fnc: "status",
          permission: "master",
        },
        {
          reg: "^#[hH][tT][tT][pP]推送地址$",
          fnc: "serverAddress",
          permission: "master",
        },
        {
          reg: "^#[hH][tT][tT][pP]推送开启$",
          fnc: "enable",
          permission: "master",
        },
        {
          reg: "^#[hH][tT][tT][pP]推送关闭$",
          fnc: "disable",
          permission: "master",
        },
        {
          reg: "^#[hH][tT][tT][pP]上报开启$",
          fnc: "clientEnable",
          permission: "master",
        },
        {
          reg: "^#[hH][tT][tT][pP]上报关闭$",
          fnc: "clientDisable",
          permission: "master",
        },
      ],
    })
  }

  status() {
    const serverBot = this.botLabel(config.server.bot, "自动")
    const clientBot = this.botLabel(config.client.bot, "全部")

    return this.reply(
      [
        "OneBot HTTP 状态",
        "",
        `HTTP推送：${config.server.enable ? "开启" : "关闭"}`,
        `协议端：${serverBot}`,
        "",
        `HTTP上报：${config.client.enable ? "开启" : "关闭"}`,
        `协议端：${clientBot}`,
      ].join("\n"),
      true,
    )
  }

  async serverAddress() {
    const base = this.baseUrl()
    const path = normalizePath(config.server.path)
    const root = this.joinUrl(base, path)
    const token = config.server.token || "未设置，当前不校验"
    const msg = [
      "OneBot HTTP 推送地址",
      "",
      "请求地址：",
      root,
      "",
      "Token：",
      token,
    ].join("\n")

    if (!this.e.isGroup) return this.reply(msg, true)

    try {
      await this.e.bot.pickFriend(this.e.user_id).sendMsg(msg)
      return this.reply("地址已发送至主人的私信了~", true)
    } catch (err) {
      logger.error("[OneBotHttp] 推送地址私信发送失败", err)
      return this.reply("私信发送失败，请私聊发送 #http推送地址", true)
    }
  }

  botLabel(botId, emptyText) {
    botId = String(botId || "").trim()
    if (!botId) return emptyText

    const bot = globalThis.Bot?.[botId]
    const name = [bot?.adapter?.name || bot?.adapter?.id, bot?.nickname].filter(Boolean).join(" ")
    return name || botId
  }

  baseUrl() {
    return String(globalThis.Bot?.url || "").replace(/\/+$/, "") || "云崽地址:端口"
  }

  joinUrl(base, routePath) {
    base = String(base || "").replace(/\/+$/, "")
    routePath = String(routePath || "").replace(/^\/+/, "")
    return routePath ? `${base}/${routePath}` : base
  }

  async enable() {
    config.server.enable = true
    await configSave()
    return this.reply("HTTP推送已开启", true)
  }

  async disable() {
    config.server.enable = false
    await configSave()
    return this.reply("HTTP推送已关闭", true)
  }

  async clientEnable() {
    config.client.enable = true
    await configSave()
    return this.reply("HTTP上报已开启", true)
  }

  async clientDisable() {
    config.client.enable = false
    await configSave()
    return this.reply("HTTP上报已关闭", true)
  }
}
