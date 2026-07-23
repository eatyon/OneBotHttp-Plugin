# OneBotHttp-Plugin

适用于 TRSS-Yunzai 的 OneBot v11 HTTP 推送和上报桥接插件

## 功能

- HTTP推送：外部程序调用本插件的 OneBot 接口，由云崽协议端发送私聊或群聊消息
- HTTP上报：云崽收到消息后，把消息事件上报给外部程序
- 支持选择推送协议端和上报协议端
- 支持 Token、签名、CORS、消息格式和请求时间开关
- 支持推送关键词拦截、关键词替换、群聊关键词艾特
- 支持上报前缀、QQ 和群黑白名单过滤

## 安装

在云崽根目录执行：

```bash
git clone https://github.com/eatyon/OneBotHttp-Plugin.git plugins/OneBotHttp-Plugin
```

然后重启云崽

## 配置

推荐使用锅巴配置。

推送和上报默认关闭，可在锅巴或配置文件中开启。

用户配置文件：

```text
plugins/OneBotHttp-Plugin/config/server.yaml
plugins/OneBotHttp-Plugin/config/client.yaml
```

默认配置文件：

```text
plugins/OneBotHttp-Plugin/config/server_default.yaml
plugins/OneBotHttp-Plugin/config/client_default.yaml
```

## HTTP推送地址

完整地址由推送地址和后缀组成，推荐留空使用云崽服务器地址。

默认推送地址后缀：

```text
/push
```

完整请求地址示例：

```text
http://localhost:2536/push
```

插件启动后，可在云崽日志查看当前推送地址。

## 推送处理

HTTP推送会按以下顺序处理：

```text
关键词拦截 -> 关键词替换 -> 群聊关键词艾特 -> 添加请求时间（请求进入时记录） -> 发送消息
```

关键词拦截命中后不会发送消息，接口仍返回成功。

## 上报前缀

默认上报前缀是：

```text
@bot
```

表示艾特机器人时才上报。触发上报后，机器人艾特始终会自动去除。

示例：

```text
@机器人 测试消息 -> 测试消息
@机器人 test测试  -> 测试
```

如果把上报前缀留空，表示不限制前缀，所有符合黑白名单规则的消息都可以上报。

如果填写普通文本，例如 `test`，则去掉机器人艾特后再判断文本前缀。

## 命令

所有命令仅主人可用，`HTTP` 支持大小写

```text
#HTTP状态
#HTTP更新 / #HTTP强制更新
#HTTP推送开启 / #HTTP推送关闭
#HTTP上报开启 / #HTTP上报关闭
```

### QWild-Plugin 兼容

已兼容 QWild-Plugin。

使用 HTTP 推送时，消息会走插件指定的协议端，不会被 QWild 改到其他协议端发送。

## 鸣谢

感谢 [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai)
