#!/usr/bin/env python3
"""Generate zh-Hant countdown clips with Azure HsiaoYu.

Azure's MP3 output pads each short word with silence (about 1.87s). This script
trims both ends with ffmpeg silenceremove, re-encodes to 24 kHz 96 kbps mono,
then checks the trimmed length against the countdown slot. Reads the key from
the environment or stretch-app/.env. Never prints the key, request headers, or
response bodies. Does not commit anything.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from xml.sax.saxutils import escape, quoteattr

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
OUT = ROOT / 'assets/countdown/zh-Hant'
MANIFEST = OUT / 'manifest.json'
VOICE = 'zh-TW-HsiaoYuNeural'
FORMAT = 'audio-24khz-96kbitrate-mono-mp3'


def credentials(env_file):
    values = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.removeprefix('export ').partition('=')
            values[key.strip()] = value.strip().strip('"\'')
    values.update(os.environ)
    key = values.get('AZURE_SPEECH_KEY') or values.get('AzureSpeech__SubscriptionKey')
    region = values.get('AZURE_SPEECH_REGION') or values.get('AzureSpeech__Region') or 'eastasia'
    if not key:
        raise ValueError('Missing AZURE_SPEECH_KEY or AzureSpeech__SubscriptionKey in the environment or stretch-app/.env.')
    if not re.fullmatch(r'[a-z0-9]+', region):
        raise ValueError('Invalid Azure region.')
    return key, region


def trim_silence(source, dest):
    """Drop leading and trailing silence, then write a 24 kHz 96 kbps MP3."""
    if not shutil.which('ffmpeg'):
        raise ValueError('ffmpeg is required to trim leading and trailing silence.')
    # stop_periods is negative so silence is removed from the end as well as the start.
    filt = 'silenceremove=start_periods=1:start_threshold=-50dB:stop_periods=-1:stop_threshold=-50dB:detection=peak'
    result = subprocess.run(
        ['ffmpeg', '-y', '-i', str(source), '-af', filt,
         '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', str(dest)],
        capture_output=True, text=True)
    if result.returncode != 0 or not dest.exists() or dest.stat().st_size == 0:
        raise ValueError('ffmpeg could not trim silence from the countdown clip.')


def duration(file):
    if shutil.which('ffprobe'):
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', str(file)],
            capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    if shutil.which('afinfo'):
        result = subprocess.run(['afinfo', str(file)], capture_output=True, text=True, check=True)
        match = re.search(r'estimated duration:\s*([\d.]+)', result.stdout)
        if match:
            return float(match[1])
    raise ValueError('Audio duration check requires ffprobe or macOS afinfo.')


def synthesize(text, key, region, rate, last_request):
    ssml = ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-TW">'
            f'<voice name={quoteattr(VOICE)}><prosody rate={quoteattr(rate)}>'
            f'{escape(text)}</prosody></voice></speak>')
    for attempt in range(4):
        time.sleep(max(0, 3.2 - (time.monotonic() - last_request[0])))
        request = urllib.request.Request(
            f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1',
            data=ssml.encode(),
            headers={
                'Ocp-Apim-Subscription-Key': key,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': FORMAT,
                'User-Agent': 'app5-countdown-tts',
            },
            method='POST')
        last_request[0] = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if not response.headers.get('Content-Type', '').lower().startswith('audio/'):
                    raise ValueError('Azure returned a non-audio response.')
                data = response.read()
                if not data:
                    raise ValueError('Azure returned empty audio.')
                return data
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise ValueError(f'Azure HTTP {error.code}; check key, region, and quota.') from None
            wait = min(120, max(10 * (attempt + 1), float(error.headers.get('Retry-After', '0'))))
            print(f'Azure HTTP {error.code}; retry in {wait:g}s.', flush=True)
            time.sleep(wait)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, default=REPO / 'stretch-app/.env')
    parser.add_argument('--dry-run', action='store_true', help='List clips without reading a key or calling Azure.')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    if manifest.get('locale') != 'zh-Hant' or manifest.get('voice') != VOICE:
        raise ValueError('Countdown manifest must stay on zh-Hant / HsiaoYu.')
    rate = manifest.get('rate', '0%')
    if not re.fullmatch(r'[+-]?\d{1,2}%', rate):
        raise ValueError('Manifest rate must look like 0% or +10%.')
    clips = manifest['clips']
    print(f'zh-Hant countdown: {len(clips)} clips. Voice: {VOICE}; rate: {rate}.', flush=True)
    for clip in clips:
        print(f'{clip["file"]}: 「{clip["text"]}」 max {clip["max_duration_seconds"]}s', flush=True)
    if args.dry_run:
        print('Dry run only. Countdown files were not changed.')
        return
    if not shutil.which('ffmpeg'):
        raise ValueError('ffmpeg is required to trim leading and trailing silence.')
    if not shutil.which('ffprobe') and not shutil.which('afinfo'):
        raise ValueError('Install ffprobe or run on macOS for duration checks.')
    key, region = credentials(args.env_file)
    last_request = [0.0]
    staged = []
    try:
        for clip in clips:
            target = (OUT / clip['file']).resolve()
            if not target.is_relative_to(OUT.resolve()):
                raise ValueError(f'{clip["file"]} escapes the countdown folder.')
            raw = target.with_suffix('.raw.mp3')
            trimmed = target.with_suffix('.trimmed.mp3')
            raw.write_bytes(synthesize(clip['text'], key, region, rate, last_request))
            trim_silence(raw, trimmed)
            seconds = duration(trimmed)
            if seconds <= 0:
                raise ValueError(f'{clip["file"]}: invalid audio duration after trimming silence.')
            over = seconds > clip['max_duration_seconds']
            print(f'{clip["file"]}: trimmed {seconds:.3f}s / {clip["max_duration_seconds"]}s'
                  + (' OVER LIMIT' if over else ''), flush=True)
            staged.append((clip, target, trimmed, seconds, over))
        if any(item[4] for item in staged):
            raise ValueError('At least one trimmed clip is longer than its countdown slot. Existing files were left unchanged.')
        for clip, target, trimmed, seconds, _over in staged:
            trimmed.replace(target)
            clip['measured_duration_seconds'] = round(seconds, 3)
            clip['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
            clip['over_limit'] = False
        manifest['status'] = 'ready'
        manifest['placeholder'] = False
        manifest['format'] = FORMAT
        manifest['note'] = (
            'Trimmed zh-TW-HsiaoYuNeural speech. Generated locally; the Azure key is not stored here.'
        )
        temporary_manifest = MANIFEST.with_suffix('.json.tmp')
        temporary_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        temporary_manifest.replace(MANIFEST)
    finally:
        for path in OUT.glob('*.raw.mp3'):
            path.unlink(missing_ok=True)
        for path in OUT.glob('*.trimmed.mp3'):
            path.unlink(missing_ok=True)
    print(f'Wrote {len(clips)} trimmed clips. manifest status: ready.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
