# TimeWhere macOS Widget

Display-only WidgetKit companion for the desktop app.

Current boundary:

- Shows current tasks, today's completed count, and today's pending count.
- Reads only `timewhere-widget-v1.json`.
- Does not read IndexedDB, Google sync state, OAuth tokens, client secrets, or local account identifiers.
- Uses `group.cn.williamxia.timewhere` when the app is signed with an App Group entitlement.
- Falls back to the desktop app's Application Support snapshot during unsigned internal preparation.
- Builds with `CODE_SIGNING_ALLOWED=NO` for source validation only.

This widget is not embedded into the Electron macOS zip until a later signing and packaging decision.
