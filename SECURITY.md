# Security and privacy

Hermes Attention is an attention aid, not a security boundary, approval transport or guaranteed alarm. It never approves actions or answers questions. Do not use its sound or silence as evidence that an action is safe or a prompt has been resolved.

## Trust boundaries

- Desktop plugins execute inside the host application. Review source and install only trusted files; plugin-scoped storage is not encryption or a general sandbox.
- This plugin observes gateway events and prompt/session metadata. Resume requests specify `omit_messages: true`; it does not deliberately request transcripts or read credentials. Event payloads can still reach plugin memory.
- Settings persist locally; recordings and speech text/language metadata persist in IndexedDB. Prompt identifiers, per-request mute state and recent-ring timestamps are also stored locally. Disabling the plugin or deleting its source does not securely erase these records.
- Speech generation is optional but automatic after a text-field blur or language selection, regardless of the selected alarm mode. It can transmit entered text and incur charges. Avoid entering secrets. Repeated playback uses cached audio rather than repeatedly calling the provider.
- Automatic mode uses the gateway's configured Hermes TTS provider; explicit locales use fixed Edge TTS voices over the internet. Remote gateways also receive the synthesis request. Provider retention and usage terms are outside this plugin's control.
- The Python helper relies on Hermes' API authentication/transport. It does not add an independent authentication layer. Never mount its routes on a public unauthenticated server. Disabling the desktop UI is not equivalent to disabling an enabled backend.

## Defensive measures and limits

The helper rejects unknown fields, blank/oversized text and unsupported locales; caps audio at 16 MiB; confines returned file paths to its request directory; uses generic synthesis errors; and returns audio with `Cache-Control: no-store`. A single-worker guard rejects concurrent synthesis instead of queuing paid requests. These checks do not make an untrusted provider or custom provider command safe.

Temporary audio is created below the active Hermes home's cache and cleaned when its worker exits. A timeout does not necessarily cancel an upstream request or undo a charge; the worker retains its guard and files until it finishes. Crashes/forced termination may leave files. Host/provider diagnostics and provider-side retention are not controlled by the plugin. The Desktop frontend does not write its own health diagnostics through the raw host bridge.

Alarm playback depends on the host, browser permissions, device volume and connectivity for prompt verification. Web Locks prevent duplicate sound ownership only in the same storage context. Cached/imported audio is local data, not a securely isolated vault. Public builds intentionally exclude provider-generated and personal recordings.

## Reporting a vulnerability

There is currently no dedicated private security-reporting address or guaranteed response time. **Do not post secrets, recordings, conversation content, exploit details or private logs publicly.** Contact **xraysight** through an independently verified private channel, if one is available, and first ask how to send a confidential report. If no such channel exists, wait for a verified reporting route rather than publishing sensitive evidence.

A useful report contains the affected source/version, a minimal synthetic reproduction, expected/observed behavior and impact. Redact credentials, personal paths, session identifiers and provider data. Test only systems you own or are authorized to assess; do not incur someone else's TTS charges.

No supported-version/security-fix window or platform-wide security assurance is promised. Preserve and verify license/provenance when adding third-party assets.
