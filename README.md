# TZyroPLugs

A collection of BetterDiscord plugins maintained by **ThunderZyro**.

## LocalMessageEditor

Adds a local-only edit button to other people's messages in the Discord hover action toolbar.

### Features

- Adds a pencil button to messages sent by other users.
- Lets you change the message text in your own Discord client.
- Does not send edits to Discord or change the original message.
- Includes a **Permanent message edits** setting:
  - **On:** new local edits are saved on this device and survive Discord restarts.
  - **Off:** new local edits are kept only for the current plugin session and are discarded when the plugin stops or Discord closes.
- Includes a control to clear all local edits.

### Install

1. Download [LocalMessageEditor.plugin.js](./LocalMessageEditor.plugin.js).
2. Open Discord's BetterDiscord plugins folder:
   - Press `Win + R`.
   - Enter `%APPDATA%\BetterDiscord\plugins`.
3. Put `LocalMessageEditor.plugin.js` in that folder.
4. Restart Discord (or press `Ctrl + R`).
5. Open **User Settings → BetterDiscord → Plugins** and enable **LocalMessageEditor**.

### Important

This plugin changes only your local presentation of messages. Other users continue to see the original message, and Discord's stored message is not edited. BetterDiscord and Discord updates may change internal UI components and require plugin compatibility updates.

The plugin has not yet been verified against your live Discord client. If the button does not appear or Discord reports an error, capture the console error and open an issue in this repository.

## Repository

https://github.com/ThunderZyro/TZyroPLugs
