import { config, configSave } from "./model/config.js"

function makeOption(label, value) {
  value = String(value ?? "")
  return {
    label: label ? `${label} (${value})` : value,
    value,
  }
}

function friendOptions() {
  const map = globalThis.Bot?.fl || new Map()
  return Array.from(map.entries())
    .map(([id, item]) => makeOption(item?.nickname || item?.name || item?.remark, id))
    .filter(item => item.value)
}

function groupOptions() {
  const map = globalThis.Bot?.gl || new Map()
  return Array.from(map.entries())
    .map(([id, item]) => makeOption(item?.group_name || item?.name, id))
    .filter(item => item.value)
}

function botOptions() {
  const ids = globalThis.Bot?.uin || []
  return [
    { label: "不指定", value: "" },
    ...Array.from(ids)
      .map(id => {
        const bot = globalThis.Bot?.[id]
        const name = [bot?.adapter?.name || bot?.adapter?.id, bot?.nickname].filter(Boolean).join(" ")
        return makeOption(name, id)
      })
      .filter(item => item.value),
  ]
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: "OneBotHttp-Plugin",
      title: "OneBotHttp-Plugin",
      author: "eatyon",
      authorLink: "https://github.com/eatyon",
      link: "https://github.com/eatyon/OneBotHttp-Plugin",
      isV3: true,
      isV2: false,
      description: "OneBot v11 HTTP 推送和上报桥接插件",
      showInMenu: "auto",
      icon: "mdi:lan-connect",
      iconColor: "#1677ff",
    },
    configInfo: {
      schemas: [
        {
          component: "SOFT_GROUP_BEGIN",
          label: "HTTP推送",
        },
        {
          field: "server.enable",
          label: "启用推送",
          component: "Switch",
          bottomHelpMessage: "开启后允许外部程序调用接口发送消息",
        },
        {
          field: "server.bot",
          label: "推送协议端",
          component: "Select",
          bottomHelpMessage: "选择用哪个协议端发送，留空自动选择",
          componentProps: {
            options: botOptions(),
          },
        },
        {
          field: "server.baseUrl",
          label: "推送地址",
          component: "Input",
          bottomHelpMessage: "示例：localhost:3000，留空使用云崽服务器地址，修改后需要重启云崽",
          componentProps: {
            addonBefore: "http://",
          },
        },
        {
          field: "server.path",
          label: "推送地址后缀",
          component: "Input",
          bottomHelpMessage: "推送地址后缀，留空表示直接挂载到推送地址路径，修改后需要重启云崽",
        },
        {
          field: "server.token",
          label: "推送Token",
          component: "Input",
          bottomHelpMessage: "访问 Token 留空表示不校验",
        },
        {
          field: "server.cors",
          label: "允许跨域",
          component: "Switch",
          bottomHelpMessage: "允许浏览器跨域调用推送接口",
        },
        {
          field: "server.addReceiveTime",
          label: "添加请求时间",
          component: "Switch",
          bottomHelpMessage: "开启后在推送消息开头添加收到请求的时间",
        },
        {
          field: "server.messageFormat",
          label: "推送消息格式",
          component: "Select",
          bottomHelpMessage: "外部程序传入的 message 格式，array 为消息段，string 为 CQ 码",
          componentProps: {
            options: [
              { label: "array", value: "array" },
              { label: "string", value: "string" },
            ],
          },
        },
        {
          field: "server.block",
          label: "关键词拦截",
          component: "GSubForm",
          bottomHelpMessage: "命中后不发送消息，接口仍返回成功",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "keywords",
                label: "拦截条件",
                component: "Select",
                required: true,
                bottomHelpMessage: "输入后回车添加，支持 \\n 换行、{at:*} 任意艾特和 {at:all} 全体艾特",
                componentProps: {
                  mode: "tags",
                  options: [],
                },
              },
              {
                field: "mode",
                label: "拦截模式",
                component: "Select",
                defaultValue: "all",
                bottomHelpMessage: "默认全部命中",
                componentProps: {
                  options: [
                    { label: "全部命中", value: "all" },
                    { label: "命中其一", value: "any" },
                  ],
                },
              },
            ],
          },
        },
        {
          field: "server.replace",
          label: "关键词替换",
          component: "GSubForm",
          bottomHelpMessage: "发送前处理推送文本，按触发条件替换指定内容",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "keywords",
                label: "触发条件",
                component: "Select",
                bottomHelpMessage: "输入后回车添加，留空表示直接替换，支持 \\n 换行、{at:*} 任意艾特和 {at:all} 全体艾特",
                componentProps: {
                  mode: "tags",
                  options: [],
                },
              },
              {
                field: "keywordMode",
                label: "触发模式",
                component: "Select",
                defaultValue: "all",
                bottomHelpMessage: "存在触发条件时生效，默认全部命中",
                componentProps: {
                  options: [
                    { label: "全部命中", value: "all" },
                    { label: "命中其一", value: "any" },
                  ],
                },
              },
              {
                field: "excludes",
                label: "排除条件",
                component: "Select",
                bottomHelpMessage: "输入后回车添加，命中任意一个就不替换，支持 \\n 换行、{at:*} 任意艾特和 {at:all} 全体艾特",
                componentProps: {
                  mode: "tags",
                  options: [],
                },
              },
              {
                field: "from",
                label: "被替换内容",
                component: "Select",
                required: true,
                bottomHelpMessage: "输入后回车添加，支持多选和 \\n 换行，{at:*} 可匹配任意真实艾特，{at:all} 可匹配全体艾特",
                componentProps: {
                  mode: "tags",
                  options: [],
                },
              },
              {
                field: "to",
                label: "替换为",
                component: "Input",
                bottomHelpMessage: "留空表示删除，支持 \\n 表示换行和 {at:目标ID} 艾特",
              },
            ],
          },
        },
        {
          field: "server.at",
          label: "关键词艾特",
          component: "GSubForm",
          bottomHelpMessage: "群聊推送命中关键词时，按位置艾特指定QQ",
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: "keyword",
                label: "关键词",
                component: "Input",
                required: true,
              },
              {
                field: "qq",
                label: "艾特QQ",
                component: "Input",
                required: true,
              },
              {
                field: "position",
                label: "艾特位置",
                component: "Select",
                defaultValue: "prefixLine",
                bottomHelpMessage: "默认开头换行",
                componentProps: {
                  options: [
                    { label: "开头同行", value: "prefix" },
                    { label: "开头换行", value: "prefixLine" },
                    { label: "结尾换行", value: "suffixLine" },
                    { label: "结尾同行", value: "suffix" },
                  ],
                },
              },
            ],
          },
        },
        {
          component: "SOFT_GROUP_BEGIN",
          label: "HTTP上报",
        },
        {
          field: "client.enable",
          label: "启用上报",
          component: "Switch",
          bottomHelpMessage: "开启后把云崽收到的消息上报给外部程序",
        },
        {
          field: "client.bot",
          label: "上报协议端",
          component: "Select",
          bottomHelpMessage: "选择要上报哪个协议端收到的消息，留空表示全部协议端",
          componentProps: {
            options: botOptions(),
          },
        },
        {
          field: "client.endpoint",
          label: "上报地址",
          component: "Input",
          bottomHelpMessage: "外部程序接收 OneBot 事件的地址",
        },
        {
          field: "client.token",
          label: "上报Token",
          component: "Input",
          bottomHelpMessage: "访问 Token 留空表示不校验",
        },
        {
          field: "client.messageFormat",
          label: "上报消息格式",
          component: "Select",
          bottomHelpMessage: "上报给外部程序的 message 格式，array 为消息段，string 为 CQ 码",
          componentProps: {
            options: [
              { label: "array", value: "array" },
              { label: "string", value: "string" },
            ],
          },
        },
        {
          field: "client.private",
          label: "上报私聊",
          component: "Switch",
          bottomHelpMessage: "是否上报私聊消息",
        },
        {
          field: "client.group",
          label: "上报群聊",
          component: "Switch",
          bottomHelpMessage: "是否上报群消息",
        },
        {
          field: "client.self",
          label: "上报自身",
          component: "Switch",
          bottomHelpMessage: "是否上报机器人自己发送的消息",
        },
        {
          field: "client.userMode",
          label: "QQ过滤模式",
          component: "Select",
          bottomHelpMessage: "白名单只上报名单内QQ，黑名单排除名单内QQ",
          componentProps: {
            options: [
              { label: "黑名单", value: "black" },
              { label: "白名单", value: "white" },
            ],
          },
        },
        {
          field: "client.userList",
          label: "QQ名单",
          component: "Select",
          bottomHelpMessage: "配合 QQ过滤模式使用，留空表示不限制",
          componentProps: {
            mode: "multiple",
            options: friendOptions(),
          },
        },
        {
          field: "client.groupMode",
          label: "群过滤模式",
          component: "Select",
          bottomHelpMessage: "白名单只上报名单内群，黑名单排除名单内群",
          componentProps: {
            options: [
              { label: "黑名单", value: "black" },
              { label: "白名单", value: "white" },
            ],
          },
        },
        {
          field: "client.groupList",
          label: "群名单",
          component: "Select",
          bottomHelpMessage: "配合群过滤模式使用，留空表示不限制",
          componentProps: {
            mode: "multiple",
            options: groupOptions(),
          },
        },
        {
          field: "client.prefix",
          label: "上报前缀",
          component: "Input",
          bottomHelpMessage: "@bot表示艾特机器人触发，留空表示不限制前缀",
        },
        {
          field: "client.includePrefix",
          label: "保留前缀",
          component: "Switch",
          bottomHelpMessage: "开启后保留文本前缀，机器人艾特始终会自动去掉",
        },
      ],
      getConfigData() {
        return structuredClone(config)
      },
      async setConfigData(data, { Result }) {
        for (const [key, value] of Object.entries(data || {})) {
          const keys = key.split(".")
          let target = config
          while (keys.length > 1) {
            const name = keys.shift()
            if (!target[name] || typeof target[name] !== "object") target[name] = {}
            target = target[name]
          }
          target[keys[0]] = value
        }
        await configSave()
        return Result.ok({}, "保存成功")
      },
    },
  }
}





