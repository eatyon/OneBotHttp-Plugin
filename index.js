const { config } = await import("./model/config.js")

Bot.makeLog("info", "[OneBotHttp] 插件初始化完成")
if (config.server.enable) Bot.makeLog("info", "[OneBotHttp] HTTP Server 启动中")

await import("./apps/httpServer.js")

const appFiles = ["admin.js", "httpClient.js", "update.js"]
const apps = {}

for (const file of appFiles) {
  const app = await import(`./apps/${file}`)
  const name = Object.keys(app)[0]
  if (name) apps[name] = app[name]
}

export { apps }
