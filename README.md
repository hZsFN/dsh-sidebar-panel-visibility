# dsh-sidebar-panel-visibility

给 DeepSeek Harness（DSH）Web 端的左侧栏加一个**面板入口显隐开关**：不想要哪个面板的图标，就在「更多」菜单里把它关掉，状态跨重启保持。

> 这是 DSH 插件的社区实现。它不改动任何 `node_modules` 里的官方包，全部通过 DSH 的槽位契约完成。

## 为什么需要它

DSH 的左侧栏面板入口是插件自己注册的，注册了就会一直显示。装了几个带面板的插件之后，左栏会被塞满，而**官方没有提供任何关闭入口的界面**。

上游代码里其实留了钩子——`@deepseek-ai/dsh-client-ui-sidebar` 的 `SidebarRoot` 会把 `onPinnedChange`（即内部的 `setPinned`）传给 `sidebar.panellist.actions` 槽位，但**没有任何 UI 消费它**；占据该槽位的 `dsh-client-ui-entry-customization` 里第一行就是 `const moreEntries = region === "conversation" ? entries : [];`，左栏（`region === "sidebar"`）恒为空数组。

而且那个状态是纯内存的，源码注释原话是 `held in memory until plugin reload`——插件一重载就复位。

本插件做两件事：

1. 往 `sidebar.panellist.actions` 注册一组开关行，把上游留的钩子真正接上；
2. 把选择存进 `localStorage`，插件重载后回放一遍。

## 安装

```bash
dsh plugin --profile <你的 profile 名> add dsh-sidebar-panel-visibility
```

本地开发：

```bash
dsh plugin --profile <profile> add link:/绝对路径/dsh-sidebar-panel-visibility
```

> 桌面版 DSH 的 `desktop` profile 由 Electron 独占管理，`dsh plugin` 会拒绝直接写入。这种情况改 `profiles/desktop/package.json`：把包名加进 `dependencies`（`link:` 或版本号）和 `dsh.profile.bundles`，再在 profile 目录跑 `pnpm install`。

装完重启 DSH。

## 用法

1. 展开左侧栏（窄屏下需要先展开）。
2. 点左栏底部的「**更多**」按钮（图标是方形加号）。
3. 菜单最上方是「**侧边栏条目**」分区，每个面板一行：左边名字，右边「显示中 / 已隐藏」。
4. 点一行就切换。隐藏的面板立刻从左栏消失，想找回就再点一次。

「插件」面板由上游 `FIXED_PANEL_ID` 硬编码保护，藏不掉——这是刻意的，不然插件页没了就没法装插件了。

## 存储

键名 `dsh.sidebar.panelPins.v1`，值是**被隐藏**的面板 id 数组，例如：

```json
["files", "jobs"]
```

用「隐藏列表」而不是「显示列表」，是因为这样默认值（键不存在）自然等于「全部显示」——最保守的降级方向。任何异常（隐私模式禁用 storage、JSON 坏掉、值被别的脚本写脏）都返回空数组，用户最多是设置丢了，不会丢面板入口。

想彻底复位：浏览器开发者工具里删掉这个键，或执行 `localStorage.removeItem("dsh.sidebar.panelPins.v1")`。

## 兼容性

| 项目 | 值 |
| --- | --- |
| DSH | 0.2.2-rc.1 实测通过 |
| 平台 | Web / 桌面端（Electron）渲染进程 |
| 浏览器 | 任何支持 `localStorage` 的现代浏览器 |
| 依赖的槽位 | `sidebar.panellist.actions`（`kind: "list"`） |
| 依赖的服务 | `slots`、`locale` |

槽位是 `list` 类型，所以本插件和内置的 entry-customization 是**并列渲染**关系，不抢占、不遮蔽。本插件注册时 `order: -10`，排在「浏览更多插件 / 创建你的插件」之前。

## 已知限制

- **只在左栏生效**。会话头部和右侧栏的「更多」菜单不显示这组开关——那里的条目语义不同，混在一起容易误操作。
- **面板被卸载时残留 id**。插件卸了但 `localStorage` 里还留着它的 id，不影响使用（那个面板本来就不存在了），下次装回来会重新生效。目前不做过期清理。
- **`localStorage` 是按浏览器隔离的**。换个浏览器、清了站点数据，设置就没了。这符合「界面偏好」的定位，没往 profile 配置文件里写。
- **不提供排序**。上游 `setPinned` 只有开关语义，排序需要另一套契约，不在本插件范围。

## 开发

```bash
node --check lib/index.js
node --check lib/client.js
node test/storage.test.mjs
```

`test/storage.test.mjs` 用一个最小 `window` 桩把 `lib/client.js` 的 factory 跑起来，测的是**真正上线的那份代码**，不是复制品。

### 代码结构

```
lib/index.js    主机半身：空壳，只为让 cordis loader 能加载插件行
lib/client.js   浏览器半身：显隐开关组件 + localStorage 读写 + 8 种语言词条
cordis.patch.yml  bundle 补丁：把插件行插进 profile
test/storage.test.mjs  纯函数单测
```

### 为什么不改 node_modules

`@deepseek-ai/dsh-client-ui-*` 这些包在 profile 的 `node_modules` 里**没有实体目录**，由客户端模块加载器 `window.__ModuleLoader__` 在浏览器侧解析。就算改已发布的 `lib/client.js`，那些文件通常是 pnpm store 的硬链（`nlink=2`），直接写会污染全局 store，必须先 `unlink` 再写。每次 DSH 升级还会被刷掉。

走槽位契约没有这些问题：插件是独立包，升级不受影响，卸载干净。

## License

MIT

---

[![](https://img.shields.io/badge/powered_by-dafeiyu-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/Dafeiyu111)
