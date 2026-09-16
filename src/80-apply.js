/* ------------------------------------------------------------------ *
 * Registration.
 * ------------------------------------------------------------------ */

/**
 * Browser services this bundle needs before `apply` runs.
 *
 * `uiConversation` and `sessions` are declared because the client context refuses
 * undeclared service reads outright, and `canOpen` — which runs during tab
 * routing, outside any body — needs the conversation's hunks synchronously.
 */
const inject = ["slots", "locale", "sidebarRightTabs", "remote", "remote.workspaceFiles", "uiConversation", "sessions"];

function fileTabDefinition() {
	return {
		id: FILE_TAB_ID,
		kind: FILE_TAB_KIND,
		patterns: ["dsh-resource://file/**"],
		priority: "extension",
		/** Claim only files this conversation actually changed; everything else keeps the shipped viewer. */
		canOpen: function (address) {
			try {
				const parsed = parseSessionFileAddress(address);
				if (!parsed) return false;
				return SessionDiffStore.hasChanges(parsed.sessionId, parsed.path);
			} catch (error) {
				return false;
			}
		},
		title: function (address) {
			const parsed = parseSessionFileAddress(address);
			return parsed ? basenameOf(parsed.path) : "Diff";
		}
	};
}

function changesTabDefinition() {
	return {
		id: CHANGES_TAB_ID,
		kind: CHANGES_TAB_KIND,
		patterns: ["dsh-session-diff://changes/**", "dsh-session-diff://changes"],
		priority: "extension",
		title: function () {
			return languageIsZh() ? COPY.zh.changesTitle : COPY.en.changesTitle;
		},
		guide: [
			{
				order: 4,
				title: function () {
					return languageIsZh() ? COPY.zh.changes : COPY.en.changes;
				},
				description: function () {
					return languageIsZh() ? "本次对话修改过的文件与增删行数" : "Files this conversation changed, with add/remove counts";
				}
			}
		]
	};
}

function apply(ctx) {
	captureRemote(ctx);
	bindCopy(ctx);
	tryBind(ctx);
	ctx.effect(() => ctx.locale.register(NS, { zh: COPY.zh, en: COPY.en }), "dsh-session-diff: dictionaries");
	ctx.effect(() => ctx.sidebarRightTabs.register(fileTabDefinition()), "dsh-session-diff: file tab type");
	ctx.effect(() => ctx.sidebarRightTabs.register(changesTabDefinition()), "dsh-session-diff: changes tab type");
	ctx.effect(
		() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: FILE_TAB_ID, locale: NS }, SessionDiffFileBody)),
		"dsh-session-diff: file body"
	);
	ctx.effect(
		() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: CHANGES_TAB_ID, locale: NS }, SessionChangesBody)),
		"dsh-session-diff: changes body"
	);
	ctx.effect(
		() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: FILE_TAB_ID }, SessionDiffFileTitle)),
		"dsh-session-diff: file title"
	);
	ctx.effect(
		() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: CHANGES_TAB_ID }, SessionChangesTitle)),
		"dsh-session-diff: changes title"
	);
	if (typeof console !== "undefined" && console.info) console.info("[dsh-session-diff] client half applied");
}
