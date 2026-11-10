/**
 * dsh-sidebar-panel-visibility —— 主机半身（空壳）。
 *
 * 本插件的全部逻辑都在浏览器半身（lib/client.js）：它向
 * `sidebar.panellist.actions` 槽位注册一组「面板显隐开关」，并把用户的选择
 * 存进 localStorage 以便跨重启保持。
 *
 * 因此这里刻意什么都不做：
 *   - 不注册任何服务 / 投影 / RPC；
 *   - 不读写文件（面板状态属于浏览器会话，放 localStorage 才对）；
 *   - 不挂任何 intercept。
 *
 * 保留本文件只是因为包需要一个 main 入口，让 cordis loader 能加载这条插件行；
 * apply 为空是预期行为，不是占位遗漏。
 *
 * @module dsh-sidebar-panel-visibility
 */

/** 插件名，同时是 cordis 配置项 id。 */
export const name = "dsh-sidebar-panel-visibility";

/** 不依赖任何主机服务：主机侧无事可做，服务缺席也不影响浏览器半身。 */
export const inject = [];

/** 空实现：主机半身没有需要挂载的资源。 */
export function apply() {}
