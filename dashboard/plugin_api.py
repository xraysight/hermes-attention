"""Optional audio generation API; playback belongs to the desktop client."""
import base64
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from hermes_constants import get_hermes_home

router = APIRouter()
_guard = Lock()  # Fail fast rather than queue paid requests; held through file cleanup.
_worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix='attention-tts')
SYNTHESIS_TIMEOUT_SECONDS = 90
MAX_AUDIO_BYTES = 16 * 1024 * 1024
EDGE_VOICES = {
    'pl-PL': 'pl-PL-ZofiaNeural', 'en-US': 'en-US-AriaNeural',
    'en-GB': 'en-GB-SoniaNeural', 'de-DE': 'de-DE-KatjaNeural',
    'fr-FR': 'fr-FR-DeniseNeural', 'es-ES': 'es-ES-ElviraNeural',
    'it-IT': 'it-IT-ElsaNeural', 'pt-BR': 'pt-BR-FranciscaNeural',
    'uk-UA': 'uk-UA-PolinaNeural', 'ja-JP': 'ja-JP-NanamiNeural',
}


class _AudioTooLarge(Exception):
    pass


class SynthesisRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: str = Field(strict=True, min_length=1, max_length=500)
    language: Literal['auto', 'pl-PL', 'en-US', 'en-GB', 'de-DE', 'fr-FR',
                      'es-ES', 'it-IT', 'pt-BR', 'uk-UA', 'ja-JP'] = 'auto'

    @field_validator('text')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Text must not be blank')
        return value


@router.get('/capabilities')
def capabilities():
    return {
        'languages': ['auto', *EDGE_VOICES],
        'language_selection': 'edge',
        'version': '1.1.0',
        'default_language': 'auto',
        'supported_languages': ['auto', *EDGE_VOICES],
        'voices': dict(EDGE_VOICES),
        'auto': {'engine': 'hermes-configured', 'voice': None, 'provider_overrides': False},
        'explicit': {'engine': 'edge', 'voice_selection': 'fixed-per-locale'},
        'translates_text': False,
    }


@router.post('/synthesize')
def synthesize(body: SynthesisRequest):
    if not _guard.acquire(blocking=False):
        raise HTTPException(429, 'Speech synthesis is busy')
    try:
        future = _worker.submit(_render, body)
    except Exception:
        _guard.release()
        raise HTTPException(502, 'Speech synthesis failed') from None
    try:
        return future.result(timeout=SYNTHESIS_TIMEOUT_SECONDS)
    except FutureTimeout:
        # Never release the guard or remove a directory while a provider still
        # writes to it. The worker owns both until it actually exits.
        raise HTTPException(504, 'Speech synthesis timed out') from None


def _render(body):
    try:
        cache = get_hermes_home() / 'cache' / 'hermes-attention'
        cache.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix='tts-', dir=cache) as temporary:
            output_path = str(Path(temporary) / 'speech.mp3')
            voice = EDGE_VOICES.get(body.language)
            if voice is None:
                result = json.loads(_synthesize(body.text, output_path))
            else:
                result = json.loads(_synthesize_edge(body.text, output_path, voice))
            if result.get('success') is not True or len(result.get('file_paths', [None])) != 1:
                raise ValueError('Synthesis failed or returned multiple files')
            path = Path(result['file_path']).resolve(strict=True)
            if not path.is_relative_to(Path(temporary).resolve()) or not path.is_file():
                raise ValueError('Output must be inside the request directory')
            mime = {'.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
                    '.flac': 'audio/flac', '.m4a': 'audio/mp4'}[path.suffix.lower()]
            if path.stat().st_size > MAX_AUDIO_BYTES:
                raise _AudioTooLarge
            with path.open('rb') as stream:
                audio = stream.read(MAX_AUDIO_BYTES + 1)
            if len(audio) > MAX_AUDIO_BYTES:
                raise _AudioTooLarge
            if not audio:
                raise ValueError('Empty audio')
            return JSONResponse({'url': f'data:{mime};base64,' + base64.b64encode(audio).decode('ascii'),
                                 'mime': mime, 'bytes': len(audio), 'language': body.language,
                                 'voice': voice, 'engine': 'edge' if voice else 'hermes-configured'},
                                headers={'Cache-Control': 'no-store'})
    except _AudioTooLarge:
        raise HTTPException(413, 'Audio exceeds 16 MiB') from None
    except TimeoutError:
        raise HTTPException(504, 'Speech synthesis timed out') from None
    except Exception:
        raise HTTPException(502, 'Speech synthesis failed') from None
    finally:
        _guard.release()


def _synthesize(text, output_path):
    from tools.tts_tool import text_to_speech_tool
    return text_to_speech_tool(text=text, output_path=output_path)


def _synthesize_edge(text, output_path, voice):
    import edge_tts
    asyncio.run(asyncio.wait_for(edge_tts.Communicate(text, voice).save(output_path),
                                 timeout=SYNTHESIS_TIMEOUT_SECONDS))
    return json.dumps({'success': True, 'file_path': output_path})
