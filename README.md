# Personal ST Tracker

A personal fork of [kaldigo/SillyTavern-Tracker](https://github.com/kaldigo/SillyTavern-Tracker), customized for my own SillyTavern setup.

## What's Fixed vs Original

### Bug Fix: API Spam on Chat Load

The original extension had a critical bug where opening any chat with a long history would trigger one API call per historical message that lacked a saved tracker. This could mean dozens of simultaneous generation requests on every chat load — burning API credits and sometimes crashing the extension entirely.

**Root cause:** ST fires `CHARACTER_MESSAGE_RENDERED` once per message when a chat loads. The original code had no guard against this, so every historical message without a tracker attempted generation.

**Fix:** Added an `isChatLoading` flag in `interconnection.js` that is raised the moment `CHAT_CHANGED` fires and cleared via a debounced timer after rendering settles (~1 second). All render-triggered generation handlers check this flag and skip when it's true. Only deliberate user actions (`GENERATION_AFTER_COMMANDS`) bypass this guard, as intended.

### Bug Fix: Manual Edits Respected

The original auto-update would overwrite manual edits made through the UI on subsequent generations. Fixed by tightening the tracker existence check so that messages with existing tracker data are never regenerated unless explicitly requested via the Regenerate button.

## Installation

In SillyTavern, go to **Extensions → Install Extension** and paste:

```
https://github.com/ExtensionMuncher/Personal-ST-Tracker
```

## Features

All features from the original Tracker extension are preserved:

- Scene state tracking (Time, Location, Weather, Topics, Characters Present)
- Per-character detail tracking (Hair, Makeup, Outfit, State, Posture)
- Custom field support
- YAML / JSON format options
- Separate connection profile for tracker generation
- Single-stage, two-stage, and inline generation modes
- Manual edit UI with popup
- Per-message tracker preview inline in chat

## Credits

Original extension by [kaldigo](https://github.com/kaldigo/SillyTavern-Tracker). Documentation by Giglio.
