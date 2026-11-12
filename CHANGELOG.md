# Changelog

This file describes the prepared source snapshot, not a published release. Desktop and backend versions are independent. No earlier public release history is asserted.

## Desktop 1.4.3 / backend API 1.1.0 — publication preparation

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

Local verification is Windows-based. Unit tests use synthetic fixtures and mocked TTS, not live provider calls. No macOS/Linux end-to-end result, hosted CI pass, published repository or public release is asserted. See the README for operational and privacy limitations.
