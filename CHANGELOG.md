# Changelog

Desktop and backend versions are independent. Unreleased entries describe local source changes, not a published release.

## Desktop 1.5.3 / backend API 1.1.0 — 2026-11-19

- Reconcile the focused chat using its connection-qualified owner when the Desktop SDK exposes it, even when the active gateway inventory belongs to another connection. Do not contact unrelated saved remotes or guess an unresolved owner.
- Use the stored session key for `session.resume` when the SDK or live inventory supplies it, while keeping event and alarm queue identity scoped to the runtime session ID.
- Clear settled alerts when a matching legacy session snapshot omits empty pending fields, including when resume uses the runtime ID as the lookup key. Suspend repeats on unrecognized snapshots rather than treating them as fresh confirmation.
- Continue checking known sessions when the active gateway's session inventory fails, and keep the inventory warning visible until recovery.
- Verify clarification alerts on Windows with both a local gateway and a direct-URL remote gateway, including bell color, audible playback, and stopping after an answer.

## Desktop 1.5.2 / backend API 1.1.0 — 2026-11-18

- Make Test prepare missing or outdated speech before playing a single preview, including the unchanged default message on a fresh installation. Reuse matching saved recordings and wait for synthesis already in progress instead of issuing duplicate requests.
- Preserve useful backend errors, reject empty messages, and prevent delayed preview playback after Stop, settings edits or plugin disposal. Opening settings and selecting an alert mode still do not generate speech.

## Desktop 1.5.1 / backend API 1.1.0 — catalog packaging

- Put the native plugin manifest, Python entrypoint and dashboard API at the repository root alongside `desktop/plugin.js`, so Hermes can install both components as one package.
- Declare the tested Hermes compatibility floor (`>=0.23.1`) and align the package/frontend version while keeping the backend wire API at 1.1.0.
- Remove diagnostic-only raw Desktop bridge calls and retain SDK-only frontend integration. Document the optional Automatic TTS adapter's internal-helper compatibility boundary.
- Update archive inputs, packaging regression coverage and manual helper instructions for the unified source layout. The published v1.5.0 tag and assets are unchanged.

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
