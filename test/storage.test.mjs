/**
 * 纯函数单测：只测 applyToggle / readHiddenPanels / writeHiddenPanels 的语义，
 * 不碰 React、不碰 DSH 运行时。
 *
 * 跑法：node test/storage.test.mjs
 *
 * 之所以能这么测：lib/client.js 是 window.__ModuleLoader__ 的 factory 形式，
 * 直接 import 会因为没有 window 而失败。这里用一个最小桩把 factory 跑起来，
 * 拿到它导出的纯函数——这样测的就是**真正上线的那份代码**，不是复制品。
 */
import assert from "node:assert/strict";

// ---- 最小 window 桩 ----
const store = new Map();
let throwOnRead = false;
let throwOnWrite = false;

globalThis.window = {
	localStorage: {
		getItem(key) {
			if (throwOnRead) throw new Error("storage disabled");
			return store.has(key) ? store.get(key) : null;
		},
		setItem(key, value) {
			if (throwOnWrite) throw new Error("quota exceeded");
			store.set(key, String(value));
		},
		removeItem(key) {
			if (throwOnWrite) throw new Error("quota exceeded");
			store.delete(key);
		}
	}
};

let captured = null;
globalThis.window.__ModuleLoader__ = {
	load({ id, factory }) {
		const fakeRequire = (spec) => {
			// client.js 顶层只 require react / react/jsx-runtime / primitives；
			// 纯函数部分不触碰它们，所以给空对象就够。
			if (spec === "react") return {};
			if (spec === "react/jsx-runtime") return {};
			if (spec === "@deepseek-ai/dsh-client-ui-primitives") return {};
			throw new Error(`unexpected require: ${spec}`);
		};
		captured = { id, exports: factory(fakeRequire) };
	}
};

await import("../lib/client.js");

assert.ok(captured !== null, "factory 未被调用");
assert.equal(captured.id, "dsh-sidebar-panel-visibility");
const { applyToggle, readHiddenPanels, writeHiddenPanels, STORAGE_KEY, name, inject } = captured.exports;

// ---- 元数据 ----
assert.equal(name, "dsh-sidebar-panel-visibility");
assert.deepEqual(inject, ["slots", "locale"]);
assert.equal(STORAGE_KEY, "dsh.sidebar.panelPins.v1");

// ---- applyToggle：纯函数语义 ----
assert.deepEqual(applyToggle([], "files", false), ["files"], "隐藏一个面板");
assert.deepEqual(applyToggle(["files"], "files", true), [], "显示回来");
assert.deepEqual(applyToggle(["a", "b"], "c", false), ["a", "b", "c"], "追加到末尾");
assert.deepEqual(applyToggle(["a", "b"], "a", true), ["b"], "只移除目标");
assert.deepEqual(applyToggle([], "plugins", false), [], "plugins 面板不可隐藏");
{
	const input = ["a"];
	const output = applyToggle(input, "b", false);
	assert.deepEqual(input, ["a"], "不得改动入参");
	assert.notEqual(input, output, "必须返回新数组");
}

// ---- readHiddenPanels：异常降级 ----
store.clear();
assert.deepEqual(readHiddenPanels(), [], "无值时返回空数组");

store.set(STORAGE_KEY, JSON.stringify(["files", "jobs"]));
assert.deepEqual(readHiddenPanels(), ["files", "jobs"]);

store.set(STORAGE_KEY, JSON.stringify(["files", "files", "jobs"]));
assert.deepEqual(readHiddenPanels(), ["files", "jobs"], "去重");

store.set(STORAGE_KEY, JSON.stringify(["files", "plugins", "", 42, null]));
assert.deepEqual(readHiddenPanels(), ["files"], "过滤非法项与 plugins");

store.set(STORAGE_KEY, "not json");
assert.deepEqual(readHiddenPanels(), [], "坏 JSON 降级为空");

store.set(STORAGE_KEY, JSON.stringify({ a: 1 }));
assert.deepEqual(readHiddenPanels(), [], "非数组降级为空");

store.set(STORAGE_KEY, "");
assert.deepEqual(readHiddenPanels(), [], "空字符串降级为空");

throwOnRead = true;
assert.deepEqual(readHiddenPanels(), [], "storage 抛错时降级为空");
throwOnRead = false;

// ---- writeHiddenPanels：空列表清键 ----
store.clear();
writeHiddenPanels(["files"]);
assert.equal(store.get(STORAGE_KEY), JSON.stringify(["files"]));

writeHiddenPanels([]);
assert.equal(store.has(STORAGE_KEY), false, "空列表应删除键而不是写 []");

throwOnWrite = true;
assert.doesNotThrow(() => writeHiddenPanels(["files"]), "写失败不得抛出");
throwOnWrite = false;

// ---- 往返一致性 ----
store.clear();
writeHiddenPanels(["files", "jobs"]);
assert.deepEqual(readHiddenPanels(), ["files", "jobs"], "写入后能原样读回");

console.log("✓ storage.test.mjs 全部通过");
