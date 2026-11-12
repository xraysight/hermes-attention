# Changelog

Desktop and backend versions are independent. Unreleased entries describe local source changes, not a published release.

## Desktop 1.5.0 / backend API 1.1.0 — 2026-11-12

- Bundle SFX Jar's CC0 1.0 Digital alarm clock MP3 as the default custom-audio example, embedded for offline, single-file installation. Include the original asset and third-party notice in distribution archives.
- Keep Sound signal as the initial alert mode. Existing imported audio and saved settings take precedence over the bundled defaults.
- Set the initial TTS message to "Your Hermes needs you now!" independently of the interface language, without overwriting saved text or generating speech on startup.
- Document the Desktop Capabilities → Plugins marketplace as the preferred installation route when listed, followed by conditional catalog CLI commands and a manual GitHub fallback.

## Desktop 1.4.3 / backend API 1.1.0 — initial public source

- Repeating alerts for approvals and clarification requests, including Desktop batch questions; never automatically approves or answers.
- Distinct Ding, Call and Urgent synthesized tones; custom audio, cached speech and tone-plus-speech modes. Legacy `bell` maps to Ding.
- Top-right on/off bell: left-click toggles alerts; right-click opens Settings → Plugins → Hermes Attention directly, without the app-wide context menu. Per-request mute, volume/repeat controls and maximum duration.
- Gateway event handling plus active-session/resume reconciliation with `omit_messages`, scoped identifiers, stale-event handling and suspension when a scope cannot be verified.
- Web Locks sound ownership and shared mute/recent-ring state across windows in the same storage context.
- Hermes runtime UI language with English fallback; saved message text is preserved across UI-language changes.
- Automatic TTS after committed text/language edits only: 450 ms debounce, matching cache reuse, serialized latest-edit handling, stale-result rejection and visible errors. No generation button or automation toggle.
- Backend capabilities and synthesis endpoints; Automatic retains the configured Hermes provider, while ten explicit locales use fixed Edge voices without changing global settings.
- Backend validation: 500-character text limit, locale allowlist, 16 MiB output cap, output-path containment, single-worker guard, timeout handling and temporary-file cleanup.
- Sanitized source, local tests and allowlisted archive packaging. Public builds contain no personal recordings or provider-generated speech; built-in synthesized tones work offline.

### Verification boundaries

Local end-to-end verification is Windows-based. Unit tests use synthetic fixtures and mocked TTS, not live provider calls. Hosted CI results apply to the exact tested commit and do not establish macOS/Linux end-to-end playback support. See the README for operational and privacy limitations.
