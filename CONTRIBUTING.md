# Contributing

Maintainer/author: **xraysight**. Contributions must be compatible with the [MIT License](LICENSE); preserve its copyright and permission notice. Do not add personal or third-party audio without verified redistribution rights.

## Development checks

Use Node.js 22+ and an isolated Python virtual environment. From the source root, create the environment:

```bash
python -m venv .venv
```

Activate it using the command appropriate for your shell, then install the development dependencies and run the checks:

```bash
python -m pip install -r requirements-dev.lock
node --check desktop/plugin.js
node --test desktop/tests/attention.test.cjs
python -m pytest backend/tests tests -q
python scripts/build.py
```

Use `requirements-dev.lock` for the verified development/CI environment, not to modify an installed Hermes runtime. `requirements-dev.txt` records the broader dependency constraints; regenerate the lock deliberately and rerun all tests when updating dependencies. Do not use real TTS providers or network speech generation in automated tests. The backend tests stub Hermes imports and synthesis boundaries; keep those guards intact.

## Change requirements

- Add regression coverage for changed behavior, including failure and cancellation paths. Do not mistake mocked audio/provider responses for end-to-end proof.
- Keep code, comments, tests, CLI output and documentation in English. Runtime localization bundles may intentionally contain Polish; retain English fallback and preserve user-authored message text.
- Use synthetic examples only. Never copy installed-plugin state, private recordings, logs, credentials, screenshots, user configuration, absolute personal paths or another repository into this source tree.
- Keep all approval decisions with the user. Do not add approval/answer RPCs, transcript fetching, credential access or broad remote discovery to an attention feature.
- Preserve connection/profile/session/prompt isolation, authoritative settlement/reconciliation, disconnected-scope suspension, multi-window sound ownership and unload cleanup.
- Keep TTS commit-triggered rather than keystroke- or mount-triggered. Preserve cache matching, serialization, stale-result rejection and provider-cost disclosure. Do not silently change the configured provider or send conversation content for synthesis.
- Preserve backend input validation, output containment/size bounds, sanitized errors and worker-owned cleanup, including after a request times out.
- Keep package inputs explicitly allowlisted. Public archives must not contain provider-generated speech, personal audio, configuration, caches or virtual environments. The explicitly allowlisted CC0 sample is an exception for verified third-party audio: preserve `THIRD_PARTY_NOTICES.md`, the original asset and byte equality with its embedded data URL. Keep its provenance separate from the code's MIT license.
- Update the changelog and documentation when user-visible behavior changes. Keep frontend/package/archive version and backend manifest/API versions consistent with their respective contracts.

## Manual checks worth recording

On a disposable setup, use a real click on **Test** and confirm audibility; then exercise an actual approval and a batch clarification without answering automatically. Check settlement/cancellation, background/minimized playback, two-window deduplication, per-request muting, disconnect/reconnect and disable/hot reload cleanup. Record the actual OS, Hermes build and checks performed, not an inferred support matrix.

Live TTS checks are optional and require explicit consent to send text and possibly spend money. Use a harmless phrase and your own provider setup; never include the generated recording in the public archive.

Do not modify or restart someone's installed plugin/gateway as part of a source contribution without permission. Wait for active tasks to finish before any authorized gateway restart.

Report vulnerabilities according to [SECURITY.md](SECURITY.md), not in a public issue containing sensitive details.
