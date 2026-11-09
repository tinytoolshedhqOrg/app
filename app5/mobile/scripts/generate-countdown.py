#!/usr/bin/env python3
"""Replace zh-Hant countdown placeholders with Azure HsiaoYu clips.

Reads the key from the environment or stretch-app/.env. Never prints the key,
request headers, or response bodies. Does not commit anything.
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
        print('Dry run only. Placeholder files were not changed.')
        return
    if not shutil.which('ffprobe') and not shutil.which('afinfo'):
        raise ValueError('Install ffprobe or run on macOS for duration checks.')
    key, region = credentials(args.env_file)
    last_request = [0.0]
    ready = True
    for clip in clips:
        target = OUT / clip['file']
        if not target.resolve().is_relative_to(OUT.resolve()):
            raise ValueError(f'{clip["file"]} escapes the countdown folder.')
        data = synthesize(clip['text'], key, region, rate, last_request)
        temporary = target.with_suffix('.pending.mp3')
        temporary.write_bytes(data)
        try:
            seconds = duration(temporary)
            if seconds <= 0:
                raise ValueError('Invalid audio duration.')
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        clip['measured_duration_seconds'] = round(seconds, 3)
        clip['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
        clip['over_limit'] = seconds > clip['max_duration_seconds']
        if clip['over_limit']:
            ready = False
        print(f'{clip["file"]}: {seconds:.3f}s / {clip["max_duration_seconds"]}s'
              + (' OVER LIMIT' if clip['over_limit'] else ''), flush=True)
    manifest['status'] = 'ready' if ready else 'placeholder'
    manifest['placeholder'] = not ready
    manifest['format'] = FORMAT
    temporary_manifest = MANIFEST.with_suffix('.json.tmp')
    temporary_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temporary_manifest.replace(MANIFEST)
    if not ready:
        raise ValueError('At least one clip is longer than its countdown slot. Status left as placeholder.')
    print(f'Wrote {len(clips)} clips. manifest status: ready.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
