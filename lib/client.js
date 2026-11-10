window.__ModuleLoader__.load({
	id: "dsh-sidebar-panel-visibility",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region dsh-sidebar-panel-visibility/client/storage
		/**
		 * localStorage 键名。刻意沿用 DSH 侧边栏既有的命名习惯
		 * （`dsh.workspace.view.v5`、`dsh.sessions.current` 同一命名空间），
		 * 并且用 `.v1` 后缀留出未来改结构的余地。
		 */
		const STORAGE_KEY = "dsh.sidebar.panelPins.v1";
		/**
		 * 读回「被隐藏的面板 id 列表」。
		 *
		 * 任何异常（隐私模式禁用 storage、值被别的脚本写坏、JSON 不合法）
		 * 都返回空数组——空数组的含义是「全部显示」，即最保守的降级：
		 * 用户至少不会因为一次读取失败而丢面板入口。
		 *
		 * @returns 被隐藏的面板 id 数组（可能是空数组）。
		 */
		function readHiddenPanels() {
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (typeof raw !== "string" || raw === "") return [];
				const parsed = JSON.parse(raw);
				if (!Array.isArray(parsed)) return [];
				const seen = new Set();
				const ids = [];
				for (const entry of parsed) {
					if (typeof entry !== "string" || entry === "" || entry === "plugins") continue;
					if (seen.has(entry)) continue;
					seen.add(entry);
					ids.push(entry);
				}
				return ids;
			} catch {
				return [];
			}
		}
		/**
		 * 写回「被隐藏的面板 id 列表」。
		 *
		 * 列表为空时直接 removeItem，让 storage 回到干净状态（否则会留一个 `[]`，
		 * 虽然语义等价，但排查时容易被误读成「用户动过设置」）。
		 * 写失败只影响持久化，不影响本次会话——调用方已经先把状态应用到内存 store 了。
		 *
		 * @param ids - 要隐藏的面板 id 数组。
		 */
		function writeHiddenPanels(ids) {
			try {
				if (ids.length === 0) window.localStorage.removeItem(STORAGE_KEY);
				else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
			} catch {}
		}
		/**
		 * 在已有隐藏集合上应用一次切换，返回新的隐藏 id 数组。
		 *
		 * 抽成纯函数是为了能脱离浏览器单测（见 test/storage.test.mjs）。
		 *
		 * @param hidden - 当前隐藏 id 数组。
		 * @param id - 要切换的面板 id。
		 * @param show - true 表示「让它显示」，false 表示「把它隐藏」。
		 * @returns 新的隐藏 id 数组（新数组，不改动入参）。
		 */
		function applyToggle(hidden, id, show) {
			const next = hidden.filter((entry) => entry !== id);
			if (!show && id !== "plugins") next.push(id);
			return next;
		}
		//#endregion
		//#region dsh-sidebar-panel-visibility/client/menu
		/**
		 * 分区小标题的样式。DSH 的菜单用 CSS 变量描述文字层级，
		 * 这里沿用 caption 三级色，跟内置「更多」菜单的其它分区标题一致。
		 */
		const STYLE_HEADER = {
			padding: "6px 10px 2px",
			fontSize: 11,
			lineHeight: "16px",
			color: "var(--dsw-alias-label-tertiary)",
			userSelect: "none"
		};
		/** 分区与下方内置项之间的分隔线，与 primitives Menu 的分隔线同色同高。 */
		const STYLE_SEPARATOR = {
			height: 1,
			margin: "4px 6px",
			background: "var(--dsw-alias-border-l3)"
		};
		/**
		 * 一行的内容：面板名占满剩余宽度（过长省略而不是换行撑高菜单），
		 * 状态字靠右、弱化色。`MenuItemButton` 自己管按钮盒模型与悬停态，
		 * 这里只描述它内部那段文本。
		 */
		const STYLE_LABEL = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			width: "100%",
			minWidth: 0
		};
		/** 隐藏态整行退后一格：与「已隐藏」的状态字一起构成双重提示。 */
		const STYLE_LABEL_HIDDEN = { ...STYLE_LABEL, opacity: 0.6 };
		/** 状态字：右侧固定，弱化色，不参与省略。 */
		const STYLE_STATE = {
			flex: "none",
			marginLeft: "auto",
			fontSize: 11,
			color: "var(--dsw-alias-label-tertiary)"
		};
		/**
		 * 侧边栏「更多」菜单里的面板显隐开关。
		 *
		 * 数据来源与写入路径（全部走 DSH 自己的契约，不碰 node_modules）：
		 *   - 槽位 `sidebar.panellist.actions` 的渲染参数里带着 `entries`
		 *     （每个面板的 `{id, label, pinned, active}`）和 `onPinnedChange`
		 *     （即 ui-sidebar 内部 `createPanelPins().setPinned`）；
		 *   - 调 `onPinnedChange(id, false)` 就把该面板从侧边栏列表里摘掉，
		 *     `true` 就放回来。`"plugins"` 面板由 ui-sidebar 自己拦截，藏不掉。
		 *
		 * 菜单项用 primitives 的 `MenuItemButton`，和内置项同一个组件，
		 * 所以悬停、焦点环、键盘导航、危险色都是宿主原生的，不用自己仿。
		 *
		 * 为什么还要 localStorage：上游 `createPanelPins()` 的 store 是纯内存的
		 * （源码注释原话 `held in memory until plugin reload`），插件一重载就复位。
		 * 于是本插件在挂载时把上次的隐藏集合**回放**一遍（见下面的 useEffect），
		 * 之后每次点击都把结果写回 storage。这样不需要给 ui-sidebar 打补丁。
		 *
		 * @param props.entries - 槽位给的面板清单。
		 * @param props.onPinnedChange - 槽位给的显隐回调。
		 * @param props.t - 本插件 locale 命名空间的取词函数。
		 */
		function PanelVisibilityMenu({ entries, onPinnedChange, t }) {
			const list = Array.isArray(entries) ? entries : [];
			const canToggle = typeof onPinnedChange === "function";
			const tr = (key, fallback) => {
				if (typeof t !== "function") return fallback;
				const text = t(key);
				return typeof text === "string" && text !== "" ? text : fallback;
			};
			/**
			 * 启动回放：只做一次。
			 *
			 * 依赖里放 `onPinnedChange` 是有意的——它在 ui-sidebar 里是
			 * `panelPins.setPinned`，属于构造期创建的稳定引用，不会每次渲染都变；
			 * 万一将来变了，ref 守卫也能保证不会重复回放。
			 */
			const replayed = react.useRef(false);
			react.useEffect(() => {
				if (!canToggle || replayed.current) return;
				replayed.current = true;
				const hidden = readHiddenPanels();
				if (hidden.length === 0) return;
				for (const id of hidden) onPinnedChange(id, false);
			}, [canToggle, onPinnedChange]);
			if (!canToggle || list.length === 0) return null;
			const onToggle = (entry) => {
				const show = !(entry.pinned === true);
				onPinnedChange(entry.id, show);
				writeHiddenPanels(applyToggle(readHiddenPanels(), entry.id, show));
			};
			const MenuItemButton = primitives.MenuItemButton;
			const IconCheckOutlineRegular = primitives.IconCheckOutlineRegular;
			const IconCloseOutlineRegular = primitives.IconCloseOutlineRegular;
			const rows = list.map((entry) => {
				const shown = entry.pinned === true;
				return react_jsx_runtime.jsx(MenuItemButton, {
					current: shown,
					icon: shown
						? react_jsx_runtime.jsx(IconCheckOutlineRegular, { size: 16 })
						: react_jsx_runtime.jsx(IconCloseOutlineRegular, { size: 16 }),
					onSelect: () => {
						onToggle(entry);
					},
					children: react_jsx_runtime.jsxs("span", {
						"data-dsh-panel-visibility-row": entry.id,
						style: shown ? STYLE_LABEL : STYLE_LABEL_HIDDEN,
						children: [entry.label ?? entry.id, react_jsx_runtime.jsx("span", {
							style: STYLE_STATE,
							children: shown ? tr("shown", "显示中") : tr("hidden", "已隐藏")
						})]
					})
				}, `panel-visibility:${entry.id}`);
			});
			return react_jsx_runtime.jsxs("div", {
				"data-dsh-sidebar-panel-visibility": "true",
				children: [
					react_jsx_runtime.jsx("div", { style: STYLE_HEADER, children: tr("header", "侧边栏条目") }),
					...rows,
					react_jsx_runtime.jsx("div", { style: STYLE_SEPARATOR, role: "separator" })
				]
			});
		}
		//#endregion
		//#region dsh-sidebar-panel-visibility/client/locales
		/** 中文词条。 */
		const zh = {
			header: "侧边栏条目",
			shown: "显示中",
			hidden: "已隐藏"
		};
		/** English copy. */
		const en = {
			header: "Sidebar entries",
			shown: "Shown",
			hidden: "Hidden"
		};
		/** Japanese copy. */
		const ja = {
			header: "サイドバー項目",
			shown: "表示中",
			hidden: "非表示"
		};
		/** Spanish copy. */
		const es = {
			header: "Entradas de la barra lateral",
			shown: "Visible",
			hidden: "Oculto"
		};
		/** French copy. */
		const fr = {
			header: "Entrées de la barre latérale",
			shown: "Visible",
			hidden: "Masqué"
		};
		/** German copy. */
		const de = {
			header: "Seitenleisten-Einträge",
			shown: "Sichtbar",
			hidden: "Ausgeblendet"
		};
		/** Russian copy. */
		const ru = {
			header: "Элементы боковой панели",
			shown: "Показан",
			hidden: "Скрыт"
		};
		/** Portuguese copy. */
		const pt = {
			header: "Itens da barra lateral",
			shown: "Visível",
			hidden: "Oculto"
		};
		//#endregion
		//#region dsh-sidebar-panel-visibility/client/index
		/** 插件名即配置项 id，也是浏览器模块 id。 */
		const name = "dsh-sidebar-panel-visibility";
		/** 只依赖槽位与语言服务。 */
		const inject = ["slots", "locale"];
		/** 本插件独占的语言命名空间。 */
		const LOCALE_NS = "sidebarPanelVisibility";
		/**
		 * 把显隐开关注册进左栏「更多」菜单。
		 *
		 * order 取 -10：`sidebar.panellist.actions` 是 list 槽位，同 priority 下按
		 * order 升序渲染，而内置的 entry-customization 没设 order（按 0 算）。
		 * 用负数把开关排在「浏览更多插件 / 创建你的插件」之前，符合「先管条目、
		 * 再去找新插件」的使用顺序。
		 *
		 * @param ctx - 客户端根上下文。
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en,
				ja,
				es,
				fr,
				de,
				ru,
				pt
			}), "sidebar-panel-visibility: dictionaries");
			ctx.slots.inject("sidebar.panellist.actions", () => ctx.slots.register({
				name: "sidebar.panellist.actions",
				id: "panel-visibility",
				order: -10,
				locale: LOCALE_NS
			}, PanelVisibilityMenu));
		}
		//#endregion
		exports.PanelVisibilityMenu = PanelVisibilityMenu;
		exports.STORAGE_KEY = STORAGE_KEY;
		exports.applyToggle = applyToggle;
		exports.readHiddenPanels = readHiddenPanels;
		exports.writeHiddenPanels = writeHiddenPanels;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
