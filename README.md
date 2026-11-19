# TZyroPLugs

BetterDiscord plugins by **ThunderZyro**.

## LocalMessageEditor — v1.1.0

Adds a local-only edit button to messages from other users.

### What it does

- Adds a pencil button to the message action toolbar.
- Opens an editor for another person's message.
- Replaces the message text only in your local Discord view.
- Keeps Discord's original message untouched; no edit is sent to Discord.
- **Permanent message edits** setting:
  - On: new edits are saved on this device across Discord restarts.
  - Off: new edits are temporary and are discarded when the plugin stops or Discord closes.
- Provides a control to clear all local edits.

### v1.1.0 compatibility update

- Uses Discord's current `MessageContent` rendering component for local text overrides.
- Adds a `MessageButtons` toolbar integration for current Discord builds.
- Retains a `MiniPopover` fallback for older Discord builds.
- Avoids modifying Discord's message store.

### Install / update

1. Download the latest [LocalMessageEditor.plugin.js](https://raw.githubusercontent.com/ThunderZyro/TZyroPLugs/main/LocalMessageEditor.plugin.js).
2. Open the BetterDiscord plugins folder:
   - Press `Win + R`.
   - Enter `%APPDATA%\BetterDiscord\plugins`.
3. Replace the old `LocalMessageEditor.plugin.js` with the downloaded file. Keep only one copy.
4. In Discord, reload with `Ctrl + R`.
5. Open **User Settings → BetterDiscord → Plugins** and enable LocalMessageEditor.

### Troubleshooting

If the button still does not appear, open Discord's Developer Tools with `Ctrl + Shift + I`, select **Console**, and look for messages beginning with `[LocalMessageEditor]`. Share the exact error text when reporting a problem.

### Important

This is a client-side visual override. Other users always see the original message, and the plugin cannot change Discord's stored message. BetterDiscord and Discord updates can change internal components and may require future compatibility fixes.

## Repository

https://github.com/ThunderZyro/TZyroPLugs
