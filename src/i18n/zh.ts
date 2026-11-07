// 只翻译 UI 文字，不翻译用户内容（人设、消息、旁白，DESIGN 6.6）。
const zh = {
  common: {
    save: "保存",
    cancel: "取消",
    delete: "删除",
    create: "新建",
    loading: "加载中…",
  },
  nav: {
    characters: "角色",
    sessions: "单人会话",
    groups: "群聊",
    settings: "设置",
  },
  settings: {
    title: "设置",
    tabs: {
      personas: "我的分身",
      server: "llama-server",
      appearance: "外观",
      data: "数据",
    },
    appearance: {
      theme: "主题",
      system: "跟随系统",
      light: "浅色",
      dark: "深色",
      language: "语言",
      hint: "主题与语言只保存在本机（localStorage），不入库。",
    },
    server: {
      title: "llama-server",
      hint: "采样参数由 server 启动参数决定，这里只配置地址。",
      address: "服务器地址",
      save: "保存地址",
      test: "测试连接",
      testing: "测试中…",
    },
  },
};

export default zh;
