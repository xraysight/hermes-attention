#!/usr/bin/env python3
"""Build a local release ZIP from an explicit, credential-free file allowlist."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

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


def build(root: Path, output: Path) -> Path:
    contents = {member: (root / source).read_bytes() for source, member in FILES.items()}
    match = re.search(r"\bVERSION=['\"]([0-9]+\.[0-9]+\.[0-9]+)['\"]", contents[FILES['desktop/plugin.js']].decode('utf-8'))
    if match is None:
        raise ValueError('Desktop source must declare a semantic VERSION')
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'hermes-attention-{match.group(1)}.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
        for member, data in sorted(contents.items()):
            info = zipfile.ZipInfo(member, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            package.writestr(info, data)
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / 'SHA256SUMS').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
    return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist', help='Local artifact directory (default: dist)')
    args = parser.parse_args()
    archive = build(ROOT, args.output)
    print(json.dumps({'archive': str(archive), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'files': len(FILES)}))


if __name__ == '__main__':
    main()
