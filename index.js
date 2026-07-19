import "./apps/httpServer.js"
import { OneBotHttpAdmin } from "./apps/admin.js"
import { OneBotHttpClient } from "./apps/httpClient.js"
import { OneBotHttpUpdate } from "./apps/update.js"

export const apps = {
  OneBotHttpAdmin,
  OneBotHttpClient,
  OneBotHttpUpdate,
}
