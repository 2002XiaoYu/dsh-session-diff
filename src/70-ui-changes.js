/* ------------------------------------------------------------------ *
 * Companion page: every file this conversation changed.
 * ------------------------------------------------------------------ */

function SessionChangesBody(props) {
	useStyleOnce();
	const t = translateOf(props);
	const version = useStoreVersion();
	const tabState = readTabState(props);
	const addressSession = parseChangesAddress(tabState.address);
	// A guide-opened page tab carries no session in its address (`sidebar://<kind>`),
	// so the body's own sessionId prop is the primary source.
	const sessionId = tabState.sessionId || (addressSession && addressSession.sessionId) || SessionDiffStore.activeSessionId();
	const chatNodes = typeof props.useChat === "function" ? props.useChat(selectLegacyNodes) : null;
	const files = useMemo(
		() => (sessionId ? (chatNodes ? filesFromNodes(chatNodes) : SessionDiffStore.files(sessionId)) : []),
		[sessionId, chatNodes, version]
	);

	function openFile(file) {
		if (!sessionId || !tabState.actions || typeof tabState.actions.openResource !== "function") return;
		const cwd = SessionDiffStore.cwd(sessionId);
		const address = sessionFileAddress(sessionId, toAddressPath(file.path, cwd));
		try {
			tabState.actions.openResource(address, {});
		} catch (error) {
			/* opening is best-effort; the list stays usable */
		}
	}

	let totalAdded = 0;
	let totalRemoved = 0;
	for (const file of files) {
		totalAdded += file.added;
		totalRemoved += file.removed;
	}

	const header = h(
		"div",
		{ className: "dsd-head" },
		h("span", { className: "dsd-path" }, L(t, "changesTitle", "Session changes")),
		files.length > 0
			? h(
					"span",
					{ className: "dsd-stat" },
					String(files.length),
					" ",
					h("span", { className: "dsd-stat-add" }, "+" + totalAdded),
					" ",
					h("span", { className: "dsd-stat-del" }, "−" + totalRemoved)
			  )
			: null,
		h("span", { className: "dsd-spacer" })
	);

	let body = null;
	if (!sessionId) body = h("div", { className: "dsd-empty" }, L(t, "noSession", "No session context available."));
	else if (files.length === 0) body = h("div", { className: "dsd-empty" }, L(t, "changesEmpty", "This conversation has not modified any file yet."), h("br"), L(t, "changesHint", ""));
	else {
		const items = files.map(function (file, index) {
			const directory = dirnameOf(file.path);
			return h(
				"div",
				{
					key: file.key + ":" + index,
					className: "dsd-item",
					title: file.path,
					onClick: function () {
						openFile(file);
					}
				},
				h(
					"div",
					{ className: "dsd-item-top" },
					h("span", { className: "dsd-item-name" }, basenameOf(file.path)),
					h("span", { className: "dsd-spacer" }),
					h("span", { className: "dsd-stat-add dsd-stat" }, "+" + file.added),
					h("span", { className: "dsd-stat-del dsd-stat" }, "−" + file.removed)
				),
				directory ? h("div", { className: "dsd-item-dir" }, directory) : null
			);
		});
		body = h("div", { className: "dsd-body" }, h("div", { className: "dsd-list" }, items));
	}

	return h("div", { className: "dsd-root" }, header, body);
}

function SessionChangesTitle(props) {
	return h("span", null, L(props && props.t, "changesTitle", languageIsZh() ? COPY.zh.changesTitle : COPY.en.changesTitle));
}
