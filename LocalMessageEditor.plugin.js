/**
 * @name LocalMessageEditor
 * @author OpenAI
 * @version 1.0.0
 * @description Locally edit other users' messages in your Discord client. Nothing is sent to Discord.
 */

module.exports = class LocalMessageEditor {
    constructor() {
        this.pluginName = "LocalMessageEditor";
        this.defaults = { permanent: true };
        this.settings = { ...this.defaults };
        this.api = null;
        this.savedEdits = new Map();
        this.sessionEdits = new Map();
        this.renderListeners = new Map();
        this.unpatches = [];
        this.currentUserId = null;
        this.started = false;
    }

    getName() { return this.pluginName; }
    getAuthor() { return "OpenAI"; }
    getVersion() { return "1.0.0"; }
    getDescription() {
        return "Adds a local-only edit button to other users' messages. Local edits never change Discord's stored message.";
    }

    start() {
        if (this.started) return;
        this.started = true;

        try {
            this.api = new BdApi(this.pluginName);
            const storedSettings = this.api.Data.load("settings");
            this.settings = { ...this.defaults, ...(storedSettings && typeof storedSettings === "object" ? storedSettings : {}) };

            const storedEdits = this.api.Data.load("edits");
            if (storedEdits && typeof storedEdits === "object" && !Array.isArray(storedEdits)) {
                for (const [key, value] of Object.entries(storedEdits)) {
                    if (typeof value === "string") this.savedEdits.set(key, value);
                }
            }

            const userStore = BdApi.Webpack.getByKeys("getCurrentUser", "getUser") || BdApi.Webpack.Stores?.UserStore;
            this.currentUserId = userStore?.getCurrentUser?.()?.id || null;

            this.installMessageRendererPatch();
            this.installToolbarPatch();

            if (!this.unpatches.length) {
                throw new Error("Could not locate the Discord message or hover-toolbar components.");
            }

            this.api.Logger.info("Started. Local edits loaded:", this.savedEdits.size);
            this.api.UI.showToast("LocalMessageEditor enabled — edits are only visible to you.", { type: "success" });
        } catch (error) {
            this.api?.Logger?.error("Failed to start", error);
            console.error("[LocalMessageEditor] Failed to start:", error);
            this.api?.UI?.showToast("LocalMessageEditor could not attach to Discord's message UI. Check the console.", { type: "error" });
            this.stop();
        }
    }

    stop() {
        // Refresh visible messages while the patches are being removed so the
        // original Discord text is restored in the UI immediately.
        for (const listeners of this.renderListeners.values()) {
            for (const listener of [...listeners]) {
                try { listener(); } catch (_) { /* Ignore teardown-only React races. */ }
            }
        }
        for (const unpatch of this.unpatches.splice(0)) {
            try { unpatch(); } catch (error) { console.warn("[LocalMessageEditor] Unpatch failed:", error); }
        }
        this.renderListeners.clear();
        this.sessionEdits.clear();
        this.started = false;
    }

    getCurrentUserId() {
        try {
            const store = BdApi.Webpack.Stores?.UserStore || BdApi.Webpack.getByKeys("getCurrentUser", "getUser");
            return store?.getCurrentUser?.()?.id || this.currentUserId;
        } catch (_) {
            return this.currentUserId;
        }
    }

    keyFor(message) {
        if (!message?.id || !(message.channel_id || message.channelId)) return null;
        return `${message.channel_id || message.channelId}:${message.id}`;
    }

    getLocalEdit(key) {
        if (!key) return undefined;
        if (this.sessionEdits.has(key)) return this.sessionEdits.get(key);
        if (this.savedEdits.has(key)) return this.savedEdits.get(key);
        return undefined;
    }

    savePersistentEdits() {
        if (!this.settings.permanent) return;
        const data = Object.fromEntries(this.savedEdits);
        this.api.Data.save("edits", data);
    }

    saveLocalEdit(message, content) {
        const key = this.keyFor(message);
        if (!key) return;

        if (this.settings.permanent) {
            this.savedEdits.set(key, content);
            this.sessionEdits.delete(key);
            this.savePersistentEdits();
        } else {
            this.sessionEdits.set(key, content);
        }

        this.forceUpdateMessage(key);
        this.api.UI.showToast(
            this.settings.permanent
                ? "Local edit saved on this device. Other people still see the original."
                : "Local edit applied for this session only. It will not be saved.",
            { type: "success" }
        );
    }

    forceUpdateMessage(key) {
        const listeners = this.renderListeners.get(key);
        if (!listeners) return;
        for (const listener of [...listeners]) {
            try { listener(); } catch (error) { console.warn("[LocalMessageEditor] Message refresh failed:", error); }
        }
    }

    addPatch(unpatch) {
        if (typeof unpatch === "function") this.unpatches.push(unpatch);
    }

    installMessageRendererPatch() {
        // This is Discord's exported Message component. We clone only its input props;
        // the original message object held by Discord's stores is never mutated.
        let messageTarget = null;
        let messageTargetKey = null;

        // Recent Discord builds wrap the main message component in a memo object whose
        // inner `type` function contains this stable diagnostic string. Prefer that
        // target, then fall back to the older named default export.
        try {
            const memoMessage = BdApi.Webpack.getBySource(
                "Message must not be a thread starter message",
                {
                    declarationFilter: declaration =>
                        typeof declaration?.type === "function" &&
                        String(declaration.type).includes("Message must not be a thread starter message")
                }
            );
            if (memoMessage?.type) {
                messageTarget = memoMessage;
                messageTargetKey = "type";
            }
        } catch (_) { /* Try the display-name fallback below. */ }

        if (!messageTarget) {
            const messageModule = BdApi.Webpack.getModule(module => module?.default?.displayName === "Message");
            if (messageModule?.default) {
                messageTarget = messageModule;
                messageTargetKey = "default";
            }
        }

        if (!messageTarget || !messageTargetKey) {
            throw new Error("Discord's Message component was not found.");
        }

        this.addPatch(BdApi.Patcher.before(this.pluginName, messageTarget, messageTargetKey, (_thisObject, args) => {
            const props = args?.[0];
            const originalMessage = props?.message;
            const key = this.keyFor(originalMessage);
            const localContent = this.getLocalEdit(key);
            if (localContent === undefined) return;

            const localMessage = {
                ...originalMessage,
                content: localContent,
                // Hide the server edited timestamp in this local presentation.
                // This is a display-only clone; Discord's original data is unchanged.
                editedTimestamp: null,
                edited_timestamp: null
            };
            args[0] = { ...props, message: localMessage };
        }));

        // Each rendered message subscribes to a tiny local refresh channel so an edit
        // appears immediately without dispatching fake Discord events or touching stores.
        this.addPatch(BdApi.Patcher.after(this.pluginName, messageTarget, messageTargetKey, (_thisObject, args, result) => {
            const props = args?.[0] || {};
            const key = this.keyFor(props.message);
            const React = BdApi.React;
            const [, forceUpdate] = React.useState(0);

            React.useEffect(() => {
                if (!key) return undefined;
                let listeners = this.renderListeners.get(key);
                if (!listeners) {
                    listeners = new Set();
                    this.renderListeners.set(key, listeners);
                }
                const listener = () => forceUpdate(value => value + 1);
                listeners.add(listener);

                return () => {
                    const current = this.renderListeners.get(key);
                    if (!current) return;
                    current.delete(listener);
                    if (!current.size) this.renderListeners.delete(key);
                };
            }, [key]);

            return result;
        }));
    }

    findMessageProps(value, seen = new Set(), depth = 0) {
        if (!value || typeof value !== "object" || seen.has(value) || depth > 5) return null;
        seen.add(value);

        if (value.message?.id && value.message?.author?.id) return value;
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = this.findMessageProps(item, seen, depth + 1);
                if (found) return found;
            }
            return null;
        }

        for (const key of Object.keys(value)) {
            if (key === "_owner" || key === "_store" || key === "stateNode" || key === "ref") continue;
            const found = this.findMessageProps(value[key], seen, depth + 1);
            if (found) return found;
        }
        return null;
    }

    makeEditIcon(React) {
        return React.createElement("svg", {
            width: 20,
            height: 20,
            viewBox: "0 0 24 24",
            fill: "none",
            "aria-hidden": "true"
        }, React.createElement("path", {
            d: "M3.5 17.25V20.5h3.25L18.9 8.35l-3.25-3.25L3.5 17.25Zm17.25-10.6a.86.86 0 0 0 0-1.22l-2.03-2.03a.86.86 0 0 0-1.22 0l-1.59 1.59 3.25 3.25 1.59-1.59Z",
            fill: "currentColor"
        }));
    }

    installToolbarPatch() {
        // MiniPopover is the compact action toolbar used for message hover actions.
        const miniPopoverModule = BdApi.Webpack.getModule(module => module?.default?.displayName === "MiniPopover");
        const MiniPopover = miniPopoverModule?.default;
        if (!miniPopoverModule || !MiniPopover?.Button) {
            throw new Error("Discord's message hover toolbar (MiniPopover) was not found.");
        }

        this.addPatch(BdApi.Patcher.after(this.pluginName, miniPopoverModule, "default", (_thisObject, args, result) => {
            try {
                if (!result?.props) return result;
                const messageProps = this.findMessageProps(args);
                const message = messageProps?.message;
                if (!message?.id || !message?.author?.id) return result;
                const currentUserId = this.getCurrentUserId();
                if (currentUserId && message.author.id === currentUserId) return result;

                const React = BdApi.React;
                const children = result.props.children;
                const childArray = Array.isArray(children) ? children : (children == null ? [] : [children]);
                if (childArray.some(child => child?.key === "local-message-editor-button")) return result;

                const button = React.createElement(MiniPopover.Button, {
                    key: "local-message-editor-button",
                    onClick: event => {
                        event?.stopPropagation?.();
                        this.openEditor(message);
                    },
                    "aria-label": "Edit message locally",
                    title: "Edit message locally"
                }, this.makeEditIcon(React));

                // Place it with the normal message actions, beside Reply / Forward.
                childArray.splice(Math.min(2, childArray.length), 0, button);
                result.props.children = childArray;
            } catch (error) {
                this.api?.Logger?.warn("Could not add the local edit button to a message", error);
            }
            return result;
        }));
    }

    openEditor(message) {
        const key = this.keyFor(message);
        if (!key) return;

        const existing = this.getLocalEdit(key);
        const currentText = existing === undefined ? (message.content || "") : existing;
        let textarea = null;
        const React = BdApi.React;

        const body = React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, [
            React.createElement("p", {
                key: "notice",
                style: { margin: 0, color: "var(--text-muted)", fontSize: "13px" }
            }, "This is a private, local-only version. It does not edit or send anything to Discord, and other people will continue seeing the original message."),
            React.createElement("textarea", {
                key: "editor",
                ref: element => { textarea = element; },
                defaultValue: currentText,
                rows: 7,
                autoFocus: true,
                spellCheck: true,
                style: {
                    boxSizing: "border-box",
                    width: "100%",
                    minHeight: "150px",
                    resize: "vertical",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid var(--background-modifier-accent)",
                    background: "var(--input-background, var(--background-secondary))",
                    color: "var(--text-normal)",
                    font: "inherit"
                }
            })
        ]);

        this.api.UI.showConfirmationModal("Edit message locally", body, {
            confirmText: "Save local edit",
            cancelText: "Cancel",
            onConfirm: () => {
                if (!textarea) return;
                this.saveLocalEdit(message, textarea.value);
            }
        });
    }

    clearAllEdits() {
        this.savedEdits.clear();
        this.sessionEdits.clear();
        this.api.Data.delete("edits");
        for (const key of [...this.renderListeners.keys()]) this.forceUpdateMessage(key);
        this.api.UI.showToast("All local message edits were removed.", { type: "success" });
    }

    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.cssText = "padding:16px;color:var(--text-normal);font-size:14px;";

        const title = document.createElement("div");
        title.textContent = "Local message edits";
        title.style.cssText = "font-size:16px;font-weight:700;margin-bottom:8px;";
        panel.appendChild(title);

        const description = document.createElement("p");
        description.textContent = "Edits change only your local view. Discord and other users' messages are never modified.";
        description.style.cssText = "margin:0 0 16px;color:var(--text-muted);line-height:1.45;";
        panel.appendChild(description);

        const row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:12px 0;";
        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = !!this.settings.permanent;
        toggle.style.cssText = "margin-top:3px;";
        toggle.addEventListener("change", () => {
            this.settings.permanent = toggle.checked;
            this.api.Data.save("settings", this.settings);
            this.api.UI.showToast(
                toggle.checked
                    ? "Permanent saving enabled. New edits will be saved on this device."
                    : "Permanent saving disabled. New edits will last only for this session.",
                { type: "info" }
            );
        });

        const textWrap = document.createElement("span");
        const label = document.createElement("strong");
        label.textContent = "Permanent message edits";
        const note = document.createElement("div");
        note.textContent = "On: save new local edits across Discord restarts. Off: new edits are session-only and are discarded when the plugin or Discord closes.";
        note.style.cssText = "color:var(--text-muted);font-size:12px;line-height:1.4;margin-top:3px;";
        textWrap.append(label, note);
        row.append(toggle, textWrap);
        panel.appendChild(row);

        const count = document.createElement("p");
        count.textContent = `Saved edits: ${this.savedEdits.size} · Session-only edits: ${this.sessionEdits.size}`;
        count.style.cssText = "color:var(--text-muted);font-size:12px;margin:16px 0 10px;";
        panel.appendChild(count);

        const clear = document.createElement("button");
        clear.type = "button";
        clear.textContent = "Clear all local edits";
        clear.style.cssText = "padding:8px 12px;border:0;border-radius:4px;background:var(--button-danger-background);color:white;font-weight:600;cursor:pointer;";
        clear.addEventListener("click", () => {
            this.api.UI.showConfirmationModal(
                "Clear all local edits?",
                "This permanently removes every saved and session-only local edit. Discord's original messages are not affected.",
                {
                    confirmText: "Clear all",
                    cancelText: "Cancel",
                    danger: true,
                    onConfirm: () => {
                        this.clearAllEdits();
                        count.textContent = "Saved edits: 0 · Session-only edits: 0";
                    }
                }
            );
        });
        panel.appendChild(clear);

        return panel;
    }
};