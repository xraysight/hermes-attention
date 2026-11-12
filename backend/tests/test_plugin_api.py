import base64
import importlib.util
import json
from pathlib import Path
import sys
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def api(monkeypatch, tmp_path):
    source = ROOT / 'dashboard/plugin_api.py'
    assert source.is_file(), 'Missing synthesis API implementation'
    constants = types.ModuleType('hermes_constants')
    constants.get_hermes_home = lambda: tmp_path
    monkeypatch.setitem(sys.modules, 'hermes_constants', constants)
    spec = importlib.util.spec_from_file_location('attention_test_api', source)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)
    spec.loader.exec_module(module)
    # The only synthesis boundary is always blocked unless explicitly faked.
    def forbidden(*args, **kwargs):
        raise AssertionError('Real TTS must never run')
    monkeypatch.setattr(module, '_synthesize', forbidden)
    edge = types.ModuleType('edge_tts')
    edge.Communicate = forbidden
    edge.list_voices = forbidden
    monkeypatch.setitem(sys.modules, 'edge_tts', edge)
    return module, tmp_path


def client(api):
    app = FastAPI()
    app.include_router(api[0].router, prefix='/api/plugins/hermes-attention')
    return TestClient(app)


def test_synthesizes_once_returns_data_url_and_cleans(api, monkeypatch):
    module, home = api
    calls = []
    audio = b'ID3fake audio fixture'
    def fake(text, output_path):
        path = Path(output_path)
        assert path.is_relative_to(home / 'cache')
        calls.append((text, path))
        path.write_bytes(audio)
        return json.dumps({'success': True, 'file_path': str(path)})
    monkeypatch.setattr(module, '_synthesize', fake)
    response = client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'Attention'})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['mime'] == 'audio/mpeg'
    assert data['url'] == 'data:audio/mpeg;base64,' + base64.b64encode(audio).decode()
    assert len(calls) == 1
    assert calls[0][0] == 'Attention'
    assert not list((home / 'cache').rglob('*.*'))
    assert not calls[0][1].parent.exists()
    assert str(home) not in response.text


@pytest.mark.parametrize('body', [{}, {'text': ''}, {'text': ' '}, {'text': 'x' * 501},
                                      {'text': 3}, {'text': None},
                                      {'text': 'ok', 'output_path': '../escape.mp3'}])
def test_rejects_invalid_request_before_synthesis(api, body):
    response = client(api).post('/api/plugins/hermes-attention/synthesize', json=body)
    assert response.status_code == 422
    assert not (api[1] / 'cache').exists()


@pytest.mark.parametrize('text', ['x', 'x' * 500])
def test_accepts_boundary_text_lengths(api, monkeypatch, text):
    def fake(text, output_path):
        Path(output_path).write_bytes(b'ID3audio')
        return json.dumps({'success': True, 'file_path': output_path})
    monkeypatch.setattr(api[0], '_synthesize', fake)
    assert client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': text}).status_code == 200


@pytest.mark.parametrize('mode', ['error', 'throw', 'invalid_json', 'missing', 'empty', 'outside', 'many'])
def test_bad_provider_output_is_sanitized_and_cleaned(api, monkeypatch, mode, caplog):
    module, home = api
    outside = home / 'private.mp3'
    outside.write_bytes(b'private data must not be read or removed')
    directories = []
    def fake(text, output_path):
        path = Path(output_path)
        directories.append(path.parent)
        path.write_bytes(b'ID3partial')
        (path.parent / 'sidecar.tmp').write_bytes(b'partial')
        if mode == 'throw':
            raise RuntimeError('SECRET ' + text)
        if mode == 'invalid_json':
            return 'SECRET ' + text
        if mode == 'error':
            return json.dumps({'success': False, 'error': 'SECRET ' + text})
        if mode == 'missing':
            path.unlink()
        if mode == 'empty':
            path.write_bytes(b'')
        return json.dumps({'success': True, 'file_path': str(outside if mode == 'outside' else path),
                           'file_paths': [str(path), str(outside)] if mode == 'many' else [str(path)]})
    monkeypatch.setattr(module, '_synthesize', fake)
    response = client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'private phrase'})
    assert response.status_code == 502
    assert 'SECRET' not in response.text + caplog.text
    assert 'private phrase' not in response.text + caplog.text
    assert outside.read_bytes() == b'private data must not be read or removed'
    assert directories and all(not path.exists() for path in directories)


@pytest.mark.parametrize('suffix,mime', [('.wav', 'audio/wav'), ('.ogg', 'audio/ogg'),
                                         ('.flac', 'audio/flac'), ('.m4a', 'audio/mp4')])
def test_honors_provider_output_extension(api, monkeypatch, suffix, mime):
    def fake(text, output_path):
        path = Path(output_path).with_suffix(suffix)
        path.write_bytes(b'audio fixture')
        return json.dumps({'success': True, 'file_path': str(path)})
    monkeypatch.setattr(api[0], '_synthesize', fake)
    response = client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'})
    assert response.status_code == 200
    assert response.json()['mime'] == mime
    assert response.json()['url'].startswith(f'data:{mime};base64,')
    assert response.headers['cache-control'] == 'no-store'


@pytest.mark.parametrize('size,status', [(16 * 1024 * 1024, 200), (16 * 1024 * 1024 + 1, 413)])
def test_audio_size_limit(api, monkeypatch, size, status):
    paths = []
    def fake(text, output_path):
        path = Path(output_path)
        paths.append(path)
        with path.open('wb') as output:
            output.truncate(size)
        return json.dumps({'success': True, 'file_path': output_path})
    monkeypatch.setattr(api[0], '_synthesize', fake)
    response = client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'})
    assert response.status_code == status
    assert all(not p.parent.exists() for p in paths)


def test_overlapping_requests_are_rejected_without_extra_synthesis(api, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    import threading
    started, release = threading.Event(), threading.Event()
    calls = []
    def fake(text, output_path):
        calls.append(text)
        started.set()
        assert release.wait(5)
        Path(output_path).write_bytes(b'ID3fixture')
        return json.dumps({'success': True, 'file_path': output_path})
    monkeypatch.setattr(api[0], '_synthesize', fake)
    def post():
        return client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'})
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(post)
        assert started.wait(5)
        try:
            second = pool.submit(post).result(timeout=3)
            assert second.status_code == 429
            assert len(calls) == 1
        finally:
            release.set()
        assert first.result(timeout=5).status_code == 200
    assert post().status_code == 200  # guard was released after success


def test_guard_released_after_provider_failure(api, monkeypatch):
    def broken(text, output_path):
        raise RuntimeError('private')
    monkeypatch.setattr(api[0], '_synthesize', broken)
    for _ in range(2):
        assert client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'}).status_code == 502


def test_provider_http_exception_cannot_leak_details(api, monkeypatch):
    from fastapi import HTTPException
    def fake(text, output_path):
        raise HTTPException(400, 'SECRET private phrase')
    monkeypatch.setattr(api[0], '_synthesize', fake)
    response = client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'})
    assert response.status_code == 502
    assert 'SECRET' not in response.text


def test_adapter_calls_existing_tool_once_without_overrides(api, monkeypatch):
    tools = types.ModuleType('tools.tts_tool')
    calls = []
    def configured_tool(*, text, output_path):
        calls.append((text, output_path))
        return '{"success":true}'
    tools.text_to_speech_tool = configured_tool
    monkeypatch.setitem(sys.modules, 'tools.tts_tool', tools)
    # Reload to exercise the real lazy adapter rather than the fixture's stub.
    spec = importlib.util.spec_from_file_location('attention_adapter', ROOT / 'dashboard/plugin_api.py')
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)
    spec.loader.exec_module(module)
    assert module._synthesize('hello', 'safe-output.mp3') == '{"success":true}'
    assert calls == [('hello', 'safe-output.mp3')]


def test_unified_package_declares_desktop_and_backend_without_agent_tools():
    import yaml
    assert (ROOT / 'plugin.yaml').is_file(), 'Missing plugin manifest'
    manifest = yaml.safe_load((ROOT / 'plugin.yaml').read_text())
    assert manifest['name'] == 'hermes-attention'
    assert manifest['version'] == '1.5.1'
    assert manifest['requires_hermes'] == '>=0.23.1'
    assert (ROOT / 'desktop/plugin.js').is_file()
    assert manifest['provides_tools'] == []
    assert manifest['provides_hooks'] == []
    dashboard = json.loads((ROOT / 'dashboard/manifest.json').read_text())
    assert dashboard['name'] == manifest['name']
    assert dashboard['version'] == '1.1.0'
    assert dashboard['api'] == 'plugin_api.py'
    assert dashboard['tab']['hidden'] is True
    spec = importlib.util.spec_from_file_location('attention_registration', ROOT / '__init__.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    class NoRegistrations:
        def __getattr__(self, name):
            raise AssertionError('Backend must not register tools or hooks')
    assert module.register(NoRegistrations()) is None


def test_unsupported_output_type_is_not_served(api, monkeypatch):
    def fake(text, output_path):
        path = Path(output_path).with_suffix('.html')
        path.write_text('<script>not audio</script>')
        return json.dumps({'success': True, 'file_path': str(path)})
    monkeypatch.setattr(api[0], '_synthesize', fake)
    response = client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'})
    assert response.status_code == 502


def test_cache_failure_does_not_leave_guard_locked(api):
    (api[1] / 'cache').write_bytes(b'not a directory')
    for _ in range(2):
        response = client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'})
        assert response.status_code == 502


def test_sequential_requests_use_different_directories(api, monkeypatch):
    paths = []
    def fake(text, output_path):
        path = Path(output_path)
        paths.append(path)
        path.write_bytes(b'ID3fixture')
        return json.dumps({'success': True, 'file_path': str(path)})
    monkeypatch.setattr(api[0], '_synthesize', fake)
    for _ in range(2):
        assert client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'}).status_code == 200
    assert paths[0].parent != paths[1].parent
    assert all(not path.parent.exists() for path in paths)


@pytest.mark.parametrize('language', [None, 'auto'])
def test_auto_route_preserves_configured_tool_without_overrides(api, monkeypatch, language):
    tools = types.ModuleType('tools.tts_tool')
    calls = []
    def configured_tool(*, text, output_path):
        calls.append(text)
        Path(output_path).write_bytes(b'ID3fixture')
        return json.dumps({'success': True, 'file_path': output_path})
    tools.text_to_speech_tool = configured_tool
    monkeypatch.setitem(sys.modules, 'tools.tts_tool', tools)
    # Restore only the adapter; a real provider can never be invoked by this fake.
    spec = importlib.util.spec_from_file_location('attention_auto', ROOT / 'dashboard/plugin_api.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(api[0], '_synthesize', module._synthesize)
    body = {'text': 'Unchanged phrase'}
    if language is not None:
        body['language'] = language
    response = client(api).post('/api/plugins/hermes-attention/synthesize', json=body)
    assert response.status_code == 200, response.text
    assert calls == ['Unchanged phrase']
    assert {k: response.json()[k] for k in ('language', 'voice', 'engine')} == {
        'language': 'auto', 'voice': None, 'engine': 'hermes-configured'}


EXPECTED_VOICES = {
    'pl-PL': 'pl-PL-ZofiaNeural', 'en-US': 'en-US-AriaNeural',
    'en-GB': 'en-GB-SoniaNeural', 'de-DE': 'de-DE-KatjaNeural',
    'fr-FR': 'fr-FR-DeniseNeural', 'es-ES': 'es-ES-ElviraNeural',
    'it-IT': 'it-IT-ElsaNeural', 'pt-BR': 'pt-BR-FranciscaNeural',
    'uk-UA': 'uk-UA-PolinaNeural', 'ja-JP': 'ja-JP-NanamiNeural',
}


@pytest.mark.parametrize('language,voice', EXPECTED_VOICES.items())
def test_explicit_route_uses_fixed_edge_voice_without_changing_text(api, monkeypatch, language, voice):
    calls, paths = [], []
    text = 'Untranslated generic phrase.'
    class Communication:
        def __init__(self, actual_text, actual_voice):
            calls.append((actual_text, actual_voice))
        async def save(self, output_path):
            paths.append(Path(output_path))
            Path(output_path).write_bytes(b'ID3edge fixture')
    monkeypatch.setattr(sys.modules['edge_tts'], 'Communicate', Communication)
    response = client(api).post('/api/plugins/hermes-attention/synthesize',
                                json={'text': text, 'language': language})
    assert response.status_code == 200, response.text
    data = response.json()
    assert calls == [(text, voice)]
    assert {k: data[k] for k in ('language', 'voice', 'engine')} == {
        'language': language, 'voice': voice, 'engine': 'edge'}
    assert data['bytes'] == len(b'ID3edge fixture')
    assert base64.b64decode(data['url'].split(',', 1)[1]) == b'ID3edge fixture'
    assert response.headers['cache-control'] == 'no-store'
    assert paths and all(not p.parent.exists() for p in paths)


@pytest.mark.parametrize('language', [None, '', 'pl', 'pl-pl', 'PL-PL', 'en', 'ru-RU',
                                     'zh-CN', '../pl-PL', 'en-US-AriaNeural', 1, True, ['pl-PL']])
def test_language_selection_is_a_strict_whitelist(api, language):
    response = client(api).post('/api/plugins/hermes-attention/synthesize',
                               json={'text': 'ok', 'language': language})
    assert response.status_code == 422
    assert not (api[1] / 'cache').exists()


def test_capabilities_are_static_and_describe_selection_without_synthesis(api):
    response = client(api).get('/api/plugins/hermes-attention/capabilities')
    assert response.status_code == 200, response.text
    assert response.json() == {
        'languages': ['auto', *EXPECTED_VOICES],
        'language_selection': 'edge',
        'version': '1.1.0',
        'default_language': 'auto',
        'supported_languages': ['auto', *EXPECTED_VOICES],
        'voices': EXPECTED_VOICES,
        'auto': {'engine': 'hermes-configured', 'voice': None, 'provider_overrides': False},
        'explicit': {'engine': 'edge', 'voice_selection': 'fixed-per-locale'},
        'translates_text': False,
    }
    assert not (api[1] / 'cache').exists()


@pytest.mark.parametrize('language', ['auto', 'pl-PL'])
def test_request_timeout_keeps_guard_and_directory_until_worker_finishes(api, monkeypatch, language):
    import threading
    import time
    module, home = api
    release = threading.Event()
    paths = []
    def stalled(*args):
        path = Path(args[1])
        paths.append(path)
        # Recovery must allow ordinary scheduling and file I/O beyond 30 ms.
        if release.is_set():
            time.sleep(0.05)
        path.write_bytes(b'ID3partial')
        release.wait(1)
        return json.dumps({'success': True, 'file_path': str(path)})
    normal_timeout = module.SYNTHESIS_TIMEOUT_SECONDS
    monkeypatch.setattr(module, 'SYNTHESIS_TIMEOUT_SECONDS', 0.03, raising=False)
    monkeypatch.setattr(module, '_synthesize', stalled)
    monkeypatch.setattr(module, '_synthesize_edge', stalled)
    try:
        start = time.monotonic()
        response = client(api).post('/api/plugins/hermes-attention/synthesize',
                                   json={'text': 'ok', 'language': language})
        assert response.status_code == 504, response.text
        assert time.monotonic() - start < 0.5
        assert paths and paths[0].parent.exists()
        assert client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'}).status_code == 429
    finally:
        release.set()
    deadline = time.monotonic() + 2
    while module._guard.locked() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert not module._guard.locked()
    assert all(not p.parent.exists() for p in paths)
    monkeypatch.setattr(module, 'SYNTHESIS_TIMEOUT_SECONDS', normal_timeout)
    assert client(api).post('/api/plugins/hermes-attention/synthesize', json={'text': 'ok'}).status_code == 200


def test_default_synthesis_deadline_is_ninety_seconds(api):
    assert getattr(api[0], 'SYNTHESIS_TIMEOUT_SECONDS', None) == 90


def test_edge_deadline_cancels_async_synthesis(api, monkeypatch):
    import asyncio
    cancelled = []
    class Communication:
        def __init__(self, text, voice):
            pass
        async def save(self, output_path):
            try:
                await asyncio.sleep(0.2)
            except asyncio.CancelledError:
                cancelled.append(True)
                raise
    monkeypatch.setattr(sys.modules['edge_tts'], 'Communicate', Communication)
    monkeypatch.setattr(api[0], 'SYNTHESIS_TIMEOUT_SECONDS', 0.01)
    with pytest.raises(TimeoutError):
        api[0]._synthesize_edge('ok', str(api[1] / 'unused.mp3'), EXPECTED_VOICES['pl-PL'])
    assert cancelled == [True]


def test_provider_timeout_is_sanitized_as_gateway_timeout(api, monkeypatch):
    paths = []
    class Communication:
        def __init__(self, text, voice):
            pass
        async def save(self, output_path):
            path = Path(output_path)
            paths.append(path)
            path.write_bytes(b'ID3partial')
            raise TimeoutError('SECRET private path')
    monkeypatch.setattr(sys.modules['edge_tts'], 'Communicate', Communication)
    response = client(api).post('/api/plugins/hermes-attention/synthesize',
                               json={'text': 'ok', 'language': 'en-US'})
    assert response.status_code == 504, response.text
    assert 'SECRET' not in response.text
    assert paths and all(not p.parent.exists() for p in paths)
    assert not api[0]._guard.locked()
