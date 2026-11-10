/**
 * 冒烟测试：用假的 ctx / 假 react 把 `apply()` 真跑一遍。
 *
 * 目的不是测 UI 长什么样（那要靠人眼），而是确认三件在浏览器里一旦出错就会
 * 静默白屏的事：
 *   1. factory 返回的模块确实带 `name` / `inject` / `apply`，且名字与包名一致
 *      —— DSH 的模块表按 id 对账，对不上会整页启动失败；
 *   2. `apply()` 里对 `ctx.effect` / `ctx.locale.register` / `ctx.slots.inject` /
 *      `ctx.slots.register` 的调用形状与内置 entry-customization 一致；
 *   3. 组件本身在给定 props 下能渲染出节点，且 `onPinnedChange` 被以正确参数调用。
 *
 * 跑法：node test/smoke.test.mjs
 */
import assert from "node:assert/strict";

// ---- 假 react：只实现本插件用到的那几个 hook ----
let effectQueue = [];
let refStore = [];
let refCursor = 0;
const fakeReact = {
	useRef(initial) {
		const slot = refCursor++;
		if (!(slot in refStore)) refStore[slot] = { current: initial };
		return refStore[slot];
	},
	useEffect(fn) {
		effectQueue.push(fn);
	},
	useState(initial) {
		return [initial, () => {}];
	}
};

// ---- 假 jsx runtime：把元素降级成普通对象，便于断言 ----
const fakeJsx = {
	jsx: (type, props) => ({ type, props, key: props?.key }),
	jsxs: (type, props) => ({ type, props, key: props?.key }),
	Fragment: "Fragment"
};

// ---- 假 primitives：只需要 MenuItemButton 与两个图标有名字 ----
const fakePrimitives = {
	MenuItemButton: function MenuItemButton() {},
	IconCheckOutlineRegular: function IconCheckOutlineRegular() {},
	IconCloseOutlineRegular: function IconCloseOutlineRegular() {}
};

// ---- 最小 window 桩 ----
const store = new Map();
globalThis.window = {
	localStorage: {
		getItem: (k) => (store.has(k) ? store.get(k) : null),
		setItem: (k, v) => store.set(k, String(v)),
		removeItem: (k) => store.delete(k)
	}
};
let captured = null;
globalThis.window.__ModuleLoader__ = {
	load({ id, factory }) {
		captured = {
			id,
			exports: factory((spec) => {
				if (spec === "react") return fakeReact;
				if (spec === "react/jsx-runtime") return fakeJsx;
				if (spec === "@deepseek-ai/dsh-client-ui-primitives") return fakePrimitives;
				throw new Error(`unexpected require: ${spec}`);
			})
		};
	}
};

await import("../lib/client.js");
assert.ok(captured !== null, "factory 未被调用");
const mod = captured.exports;

// ---- 1. 模块形状：DSH 模块表按 id 对账 ----
assert.equal(captured.id, "dsh-sidebar-panel-visibility", "模块 id 必须是包名");
assert.equal(mod.name, "dsh-sidebar-panel-visibility", "name 必须与包名一致");
assert.deepEqual(mod.inject, ["slots", "locale"], "只依赖槽位与语言服务");
assert.equal(typeof mod.apply, "function", "apply 必须是函数");

// ---- 2. apply() 的调用形状 ----
const registeredSlots = [];
const registeredLocales = [];
const effects = [];
const fakeCtx = {
	// cordis 的 ctx.effect 语义是「立即执行 fn，拿回它的 disposer」，所以这里同步调用，
	// 否则注册动作根本没发生，测试会假通过。
	effect(fn, label) {
		const dispose = fn();
		effects.push({ dispose, label });
		return () => {
			if (typeof dispose === "function") dispose();
		};
	},
	locale: {
		register(ns, dicts) {
			registeredLocales.push({ ns, dicts });
			return () => {};
		}
	},
	slots: {
		inject(name, factory) {
			assert.equal(name, "sidebar.panellist.actions", "必须注入左栏「更多」菜单的 actions 槽位");
			return factory();
		},
		register(options, component) {
			registeredSlots.push({ options, component });
			return () => {};
		}
	}
};

mod.apply(fakeCtx);

assert.equal(registeredLocales.length, 1, "只注册一个语言命名空间");
assert.equal(registeredLocales[0].ns, "sidebarPanelVisibility");
for (const lang of ["zh", "en", "ja", "es", "fr", "de", "ru", "pt"]) {
	const dict = registeredLocales[0].dicts[lang];
	assert.ok(dict, `缺 ${lang} 词条`);
	for (const key of ["header", "shown", "hidden"]) {
		assert.equal(typeof dict[key], "string", `${lang}.${key} 必须是字符串`);
		assert.ok(dict[key].length > 0, `${lang}.${key} 不能为空`);
	}
}

assert.equal(registeredSlots.length, 1, "只注册一个槽位条目");
const { options, component } = registeredSlots[0];
assert.equal(options.name, "sidebar.panellist.actions");
assert.equal(options.id, "panel-visibility", "list 槽位必须有 id");
assert.equal(options.order, -10, "必须排在「浏览更多插件」之前");
assert.equal(options.locale, "sidebarPanelVisibility", "locale 必须指向本插件命名空间");
assert.equal(typeof component, "function");

// ---- 3. 组件在真实 props 下的行为 ----
const calls = [];
const entries = [
	{ id: "files", label: "文件", pinned: true, active: false },
	{ id: "jobs", label: "任务", pinned: false, active: false }
];
const t = (key) => registeredLocales[0].dicts.zh[key];

function render(props) {
	effectQueue = [];
	refCursor = 0;
	return component(props);
}

// 3a. 正常渲染：两行 + 标题 + 分隔线
let tree = render({ entries, onPinnedChange: (id, show) => calls.push([id, show]), t });
assert.equal(tree.type, "div");
const kids = tree.props.children;
assert.equal(kids.length, 4, "标题 + 两行 + 分隔线");
assert.equal(kids[0].props.children, "侧边栏条目", "标题用 zh 词条");

// 3b. 启动回放：storage 里有隐藏项时，挂载后应调用 onPinnedChange(id, false)
store.set("dsh.sidebar.panelPins.v1", JSON.stringify(["jobs"]));
render({ entries, onPinnedChange: (id, show) => calls.push(["replay", id, show]), t });
assert.equal(effectQueue.length, 1, "有一个挂载副作用");
effectQueue[0]();
assert.deepEqual(calls, [["replay", "jobs", false]], "回放隐藏项");
calls.length = 0;

// 3c. 点击切换：从显示到隐藏
const rows = kids.slice(1, 3);
const filesRow = rows[0];
assert.equal(filesRow.type, fakePrimitives.MenuItemButton, "行用 primitives 的 MenuItemButton");
filesRow.props.onSelect();
assert.deepEqual(calls, [["files", false]], "点击已显示的面板 → 隐藏");
assert.equal(JSON.parse(store.get("dsh.sidebar.panelPins.v1")).includes("files"), true, "隐藏后写回 storage");
calls.length = 0;
store.clear();

// 3d. 点击切换：从隐藏到显示
render({ entries, onPinnedChange: (id, show) => calls.push([id, show]), t });
const jobsRow = render({ entries, onPinnedChange: (id, show) => calls.push([id, show]), t }).props.children[2];
jobsRow.props.onSelect();
assert.deepEqual(calls, [["jobs", true]], "点击已隐藏的面板 → 显示");

// 3e. 缺 onPinnedChange 时组件不渲染（不炸）
assert.equal(render({ entries, t }), null, "无 onPinnedChange 时返回 null");
// 3f. 空 entries 时也不渲染
assert.equal(render({ entries: [], onPinnedChange: () => {}, t }), null, "空列表时返回 null");
// 3g. t 缺失时用中文兜底
tree = render({ entries, onPinnedChange: () => {} });
assert.equal(tree.props.children[0].props.children, "侧边栏条目", "t 缺失时回落中文");

console.log("✓ smoke.test.mjs 全部通过");
