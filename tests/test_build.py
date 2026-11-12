"""Offline release packaging tests using synthetic source files."""
import importlib.util
import hashlib
import json
import re
from pathlib import Path
import zipfile
import pytest

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'desktop/plugin.js': 'desktop-plugins/hermes-attention/plugin.js',
    'plugin.yaml': 'plugins/hermes-attention/plugin.yaml',
    '__init__.py': 'plugins/hermes-attention/__init__.py',
    'dashboard/manifest.json': 'plugins/hermes-attention/dashboard/manifest.json',
    'dashboard/plugin_api.py': 'plugins/hermes-attention/dashboard/plugin_api.py',
    'README.md': 'README.md',
    'LICENSE': 'LICENSE',
    'THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md',
    'desktop/audio/synth-digital-alarm.mp3': 'desktop-plugins/hermes-attention/audio/synth-digital-alarm.mp3',
}


def load_builder():
    path = ROOT / 'scripts/build.py'
    assert path.is_file(), 'Release builder has not been implemented'
    spec = importlib.util.spec_from_file_location('release_builder', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture_source(tmp_path):
    source = tmp_path / 'source'
    for name in FILES:
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        content = "const VERSION='1.4.0';\n" if name.endswith('plugin.js') else 'Synthetic public fixture\n'
        path.write_text(content, encoding='utf-8')
    (source / '.env').write_text('EXAMPLE_TOKEN=synthetic-placeholder\n', encoding='utf-8')
    (source / 'personal-recording.mp3').write_bytes(b'synthetic excluded recording')
    (source / 'debug.log').write_text('synthetic excluded log', encoding='utf-8')
    return source


def test_build_contains_only_the_explicit_distribution_files(tmp_path):
    module = load_builder()
    source = fixture_source(tmp_path)
    archive = module.build(source, tmp_path / 'output')
    assert archive.name == 'hermes-attention-1.4.0.zip'
    with zipfile.ZipFile(archive) as package:
        assert set(package.namelist()) == set(FILES.values())
        for name, member in FILES.items():
            assert package.read(member) == (source / name).read_bytes()
    assert (archive.parent / 'SHA256SUMS').is_file()


def test_build_is_reproducible_and_checksum_matches(tmp_path, monkeypatch):
    module = load_builder()
    source = fixture_source(tmp_path)
    monkeypatch.setattr(module.zipfile.time, 'localtime', lambda *args: (2020, 1, 2, 0, 0, 0, 3, 2, -1))
    first = module.build(source, tmp_path / 'first')
    monkeypatch.setattr(module.zipfile.time, 'localtime', lambda *args: (2021, 1, 2, 0, 0, 0, 5, 2, -1))
    second = module.build(source, tmp_path / 'second')
    assert first.read_bytes() == second.read_bytes(), 'Identical inputs must not depend on the build clock'
    digest = hashlib.sha256(second.read_bytes()).hexdigest()
    assert (second.parent / 'SHA256SUMS').read_text(encoding='utf-8').strip() == f'{digest}  {second.name}'


def test_missing_input_does_not_create_a_partial_archive(tmp_path):
    module = load_builder()
    source = fixture_source(tmp_path)
    (source / 'LICENSE').unlink()
    output = tmp_path / 'output'
    with pytest.raises(FileNotFoundError):
        module.build(source, output)
    assert not list(output.glob('*.zip'))


def test_repository_package_versions_and_real_archive_agree(tmp_path):
    import yaml
    manifest = yaml.safe_load((ROOT / 'plugin.yaml').read_text(encoding='utf-8'))
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    source = (ROOT / 'desktop/plugin.js').read_text(encoding='utf-8')
    version = re.search(r"\bVERSION='([^']+)'", source).group(1)
    assert manifest['version'] == package['version'] == version
    assert manifest['requires_hermes'] == '>=0.23.1'
    archive = load_builder().build(ROOT, tmp_path / 'real-package')
    with zipfile.ZipFile(archive) as built:
        assert set(built.namelist()) == set(FILES.values())
        for name, member in FILES.items():
            assert built.read(member) == (ROOT / name).read_bytes()
    encoded = re.search(r"const BUNDLED_FILE = .*?url:'data:audio/mpeg;base64,([^']+)'", source).group(1)
    import base64
    audio = (ROOT / 'desktop/audio/synth-digital-alarm.mp3').read_bytes()
    assert base64.b64decode(encoded, validate=True) == audio
    assert hashlib.sha256(audio).hexdigest() in (ROOT / 'THIRD_PARTY_NOTICES.md').read_text(encoding='utf-8')


def test_invalid_version_cannot_become_an_archive_path(tmp_path):
    module = load_builder()
    source = fixture_source(tmp_path)
    (source / 'desktop/plugin.js').write_text("const VERSION='../invalid';\n", encoding='utf-8')
    output = tmp_path / 'output'
    with pytest.raises(ValueError, match='semantic VERSION'):
        module.build(source, output)
    assert not list(output.glob('*.zip'))
