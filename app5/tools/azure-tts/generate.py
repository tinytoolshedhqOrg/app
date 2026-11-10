#!/usr/bin/env python3
"""Generate resumable Azure Speech auditions from app5's exercise library (stdlib only)."""
import argparse
import hashlib
import html
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

TOOLS = Path(__file__).resolve().parents[1]
APP = TOOLS.parent
REPO = APP.parent
LIBRARY = APP / 'mobile/assets/exercises'
ENV_FILE = TOOLS / '.env'
FORMAT = 'audio-24khz-96kbitrate-mono-mp3'


def credentials(env_file):
    values = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, sep, value = line.removeprefix('export ').partition('=')
            if sep:
                values[key.strip()] = value.strip().strip('\"\'')
    values.update(os.environ)
    key = values.get('AZURE_SPEECH_KEY') or values.get('AzureSpeech__SubscriptionKey')
    region = values.get('AZURE_SPEECH_REGION') or values.get('AzureSpeech__Region') or 'eastasia'
    if not key:
        raise ValueError('Missing AZURE_SPEECH_KEY or AzureSpeech__SubscriptionKey in local .env.')
    if not re.fullmatch(r'[a-z0-9]+', region):
        raise ValueError('Invalid Azure region.')
    return key, region


def duration(file):
    if shutil.which('afinfo'):
        result = subprocess.run(['afinfo', str(file)], capture_output=True, text=True, check=True)
        match = re.search(r'estimated duration:\s*([\d.]+)', result.stdout)
        if match:
            return float(match[1])
    if shutil.which('ffprobe'):
        result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                 '-of', 'default=noprint_wrappers=1:nokey=1', str(file)],
                                capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    raise ValueError('Audio duration check requires macOS afinfo or ffprobe.')


def fingerprint(cue, voice, rate):
    payload = json.dumps([cue['text'], voice, rate, FORMAT], ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()


def build_ssml(text, voice, rate, break_after=None, break_ms=250):
    content = escape(text)
    if break_after:
        before, marker, after = text.partition(break_after)
        if not marker or not 0 <= break_ms <= 5000:
            raise ValueError('Pause must match the text and be between 0 and 5000ms.')
        content = escape(before + marker) + f'<break time="{int(break_ms)}ms"/>' + escape(after)
    return ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-TW">'
            f'<voice name={quoteattr(voice)}><prosody rate={quoteattr(rate)}>'
            f'{content}</prosody></voice></speak>')


def synthesize(text, key, region, voice, rate, last_request, break_after=None, break_ms=250):
    # Each attempt, including retries, respects F0's 20 requests / 60 seconds.
    ssml = build_ssml(text, voice, rate, break_after, break_ms)
    for attempt in range(4):
        time.sleep(max(0, 3.2 - (time.monotonic() - last_request[0])))
        request = urllib.request.Request(
            f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1',
            data=ssml.encode(), headers={
                'Ocp-Apim-Subscription-Key': key,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': FORMAT,
                'User-Agent': 'app5-azure-tts-audition',
            }, method='POST')
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
            # Never log request headers, credentials, or Azure response bodies.
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise ValueError(f'Azure HTTP {error.code}; check key, region, and quota.') from None
            wait = min(120, max(10 * (attempt + 1), float(error.headers.get('Retry-After', '0'))))
            print(f'Azure HTTP {error.code}; retry in {wait:g}s.', flush=True)
            time.sleep(wait)


def save_manifest(out, manifest):
    temporary = out / 'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(out / 'manifest.json')


def preview(out, routine, rows):
    items = []
    previous = None
    for row in rows:
        if previous != row['exercise_id']:
            items.append(f'<h2>{html.escape(row["exercise_name"])}</h2>')
            previous = row['exercise_id']
        status = '超出時間上限，需調整' if row['over_limit'] else '秒數符合'
        items.append(f'<article><p>{html.escape(row["text"])}</p>'
                     f'<small>{row["at_seconds"]} 秒播放 · 音檔 {row["duration_seconds"]:.2f} 秒'
                     f' / 上限 {row["max_duration_seconds"]} 秒 · {status}</small><br>'
                     f'<audio controls preload="none" src="{html.escape(row["file"], quote=True)}"></audio>'
                     f'<small>{html.escape(row["cue_id"])}</small></article>')
    page = '''<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>原地伸展語音試聽</title>
<style>body{font:17px system-ui;max-width:780px;margin:40px auto;padding:0 20px;color:#18243c;background:#f5f7fb}
article{background:white;border-radius:12px;padding:16px;margin:12px 0}small{color:#526078;display:block}
audio{width:100%;margin:10px 0}button{padding:12px 20px;margin-right:8px;cursor:pointer}h2{margin-top:32px}</style>
'''
    page += (f'<h1>{html.escape(routine["name"])} · HsiaoYu 試聽</h1>'
             '<p>預設語速。此頁依序播放提示，不模擬 App 的 30 秒動作時間軸。請確認發音、方向與語氣。</p>'
             '<button id="play">依序播放全部</button><button id="stop">停止</button>' + ''.join(items))
    page += '''<script>
const clips=[...document.querySelectorAll('audio')];let sequence=false;
function stop(){sequence=false;clips.forEach(a=>{a.pause();a.currentTime=0})}
async function play(a){try{await a.play()}catch(e){sequence=false;alert('請點音檔的播放鍵繼續試聽。')}}
document.querySelector('#play').onclick=()=>{stop();sequence=true;if(clips[0])play(clips[0])};
document.querySelector('#stop').onclick=stop;
clips.forEach((a,i)=>{a.onplay=()=>clips.forEach(b=>{if(b!==a)b.pause()});
a.onended=()=>{if(sequence&&clips[i+1]){clips[i+1].scrollIntoView({block:'center'});play(clips[i+1])}else sequence=false}});
</script></html>'''
    (out / 'index.html').write_text(page)
    (out / 'playlist.m3u').write_text('#EXTM3U\n' + '\n'.join(row['file'] for row in rows) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--routine', default='standing', help='Routine ID; defaults to the eight standing exercises.')
    parser.add_argument('--env-file', type=Path, default=ENV_FILE)
    parser.add_argument('--rate', default='0%', help='SSML speaking rate, e.g. 0%% or +10%%.')
    parser.add_argument('--dry-run', action='store_true', help='List scope without reading credentials or calling Azure.')
    parser.add_argument('--limit', type=int, help='Generate only the first N cues for a small trial.')
    args = parser.parse_args()
    if not re.fullmatch(r'[+-]?\d{1,2}%', args.rate):
        parser.error('--rate must be a percentage such as 0% or +10%.')
    if args.limit is not None and args.limit < 1:
        parser.error('--limit must be positive.')
    routines = json.loads((LIBRARY / 'routines.json').read_text())
    routine = next((r for r in routines if r['id'] == args.routine), None)
    if routine is None:
        parser.error('Unknown routine ID.')
    exercises = {e['id']: e for p in LIBRARY.rglob('exercise.json') for e in [json.loads(p.read_text())]}
    plan = [(exercises[eid], cue) for eid in routine['exercise_ids'] for cue in exercises[eid]['voice_cues']]
    if args.limit:
        plan = plan[:args.limit]
    voice = 'zh-TW-HsiaoYuNeural'
    print(f'{routine["name"]}: {len(routine["exercise_ids"])} exercises, {len(plan)} clips, '
          f'{sum(len(c["text"]) for _, c in plan)} text characters. Voice: {voice}; rate: {args.rate}', flush=True)
    if args.dry_run:
        for exercise, cue in plan:
            print(f'{exercise["name"]} / {cue["id"]}: {cue["text"]}')
        return
    if not shutil.which('afinfo') and not shutil.which('ffprobe'):
        raise ValueError('Install ffprobe or run on macOS for duration checks.')
    key, region = credentials(args.env_file)
    out = REPO / 'audition-output/stretch/azure' / routine['id'] / voice / args.rate
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'clips': {}}
    manifest.update({'routine': routine['id'], 'voice': voice, 'rate': args.rate, 'region': region,
                     'format': FORMAT, 'human_review': 'pending'})
    rows = []
    last_request = [0.0]
    try:
        for exercise, cue in plan:
            file = out / f'{cue["id"]}.mp3'
            signature = fingerprint(cue, voice, args.rate)
            old = manifest['clips'].get(cue['id'], {})
            cached = (file.exists() and old.get('fingerprint') == signature and
                      old.get('sha256') == hashlib.sha256(file.read_bytes()).hexdigest())
            if not cached:
                data = synthesize(cue['text'], key, region, voice, args.rate, last_request)
                temporary = file.with_suffix('.pending.mp3')
                temporary.write_bytes(data)
                try:
                    seconds = duration(temporary)
                    if seconds <= 0:
                        raise ValueError('Invalid audio duration.')
                    temporary.replace(file)
                finally:
                    temporary.unlink(missing_ok=True)
            else:
                seconds = duration(file)
            row = {'exercise_id': exercise['id'], 'exercise_name': exercise['name'],
                   'cue_id': cue['id'], 'text': cue['text'], 'at_seconds': cue['at_seconds'],
                   'max_duration_seconds': cue['max_duration_seconds'], 'duration_seconds': seconds,
                   'over_limit': seconds > cue['max_duration_seconds'], 'file': file.name,
                   'fingerprint': signature, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
            manifest['clips'][cue['id']] = row
            rows.append(row)
            save_manifest(out, manifest)
            print(f'{len(rows)}/{len(plan)} {cue["id"]}: {seconds:.2f}s / {cue["max_duration_seconds"]}s'
                  + (' OVER LIMIT' if row['over_limit'] else '') + (' (cached)' if cached else ''), flush=True)
    finally:
        if rows:
            preview(out, routine, rows)
    print(f'Completed: {len(rows)} clips; {sum(r["over_limit"] for r in rows)} over limit.\nPreview: {out / "index.html"}')
    print('Audition only: app assets and ready flags have not been changed.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
