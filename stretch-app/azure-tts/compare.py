#!/usr/bin/env python3
"""Compare the existing first standing cue with a slower HsiaoYu version."""
import hashlib
import html
import json
from pathlib import Path
import shutil
import sys

from generate import REPO, build_ssml, credentials, duration, synthesize


def main():
    voice = 'zh-TW-HsiaoYuNeural'
    cue_id = 'stand_neck_turn_cue_01'
    base = REPO / 'audition-output/stretch/azure/standing' / voice
    original = base / '0%' / f'{cue_id}.mp3'
    original_manifest = json.loads((base / '0%/manifest.json').read_text())
    row = original_manifest['clips'][cue_id]
    if hashlib.sha256(original.read_bytes()).hexdigest() != row['sha256']:
        raise ValueError('Original clip hash mismatch.')
    text = row['text']
    out = base / 'ab-first-cue'
    out.mkdir(parents=True, exist_ok=True)
    shutil.copy2(original, out / 'A-original.mp3')
    b = out / 'B-slower-pause.mp3'
    ssml = build_ssml(text, voice, '-10%', '先站穩，', 250)
    signature = hashlib.sha256(ssml.encode()).hexdigest()
    manifest_path = out / 'manifest.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    cached = (b.exists() and old.get('ssml_sha256') == signature and
              old.get('B', {}).get('sha256') == hashlib.sha256(b.read_bytes()).hexdigest())
    if not cached:
        key, region = credentials(REPO / 'stretch-app/.env')
        data = synthesize(text, key, region, voice, '-10%', [0.0], '先站穩，', 250)
        temporary = b.with_suffix('.pending.mp3')
        temporary.write_bytes(data)
        try:
            if duration(temporary) <= 0:
                raise ValueError('Invalid audio duration.')
            temporary.replace(b)
        finally:
            temporary.unlink(missing_ok=True)
    a_seconds, b_seconds = duration(out / 'A-original.mp3'), duration(b)
    maximum = row['max_duration_seconds']
    manifest = {'cue_id': cue_id, 'text': text, 'voice': voice,
                'max_duration_seconds': maximum, 'human_review': 'pending',
                'ssml_sha256': signature,
                'A': {'file': 'A-original.mp3', 'rate': '0%', 'duration_seconds': a_seconds,
                      'sha256': row['sha256']},
                'B': {'file': b.name, 'rate': '-10%', 'break_after': '先站穩，', 'break_ms': 250,
                      'duration_seconds': b_seconds, 'over_limit': b_seconds > maximum,
                      'sha256': hashlib.sha256(b.read_bytes()).hexdigest()}}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (out / 'B.ssml').write_text(ssml + '\n')
    cards = []
    for label, description in [('A', '目前版本：預設語速'), ('B', '舒緩版：慢 10%，「先站穩」後加入 250 毫秒停頓')]:
        clip = manifest[label]
        cards.append(f'<article><h2>{label} · {description}</h2>'
                     f'<p>{clip["duration_seconds"]:.2f} 秒 / 上限 {maximum} 秒</p>'
                     f'<audio controls preload="metadata" src="{clip["file"]}"></audio></article>')
    page = '''<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>HsiaoYu A／B 試聽</title>
<style>body{font:18px system-ui;max-width:760px;margin:48px auto;padding:0 20px;background:#f5f7fb;color:#18243c}
article{padding:20px;background:white;border-radius:16px;margin:20px 0}audio{width:100%}h2{font-size:21px}</style>
<h1>HsiaoYu · A／B 試聽</h1>'''
    page += '<p>' + html.escape(text) + '</p>' + ''.join(cards)
    page += '''<p>請比較引導感與節奏。其他 32 句原版音檔保留，尚未套用新設定。</p>
<script>const clips=[...document.querySelectorAll('audio')];clips.forEach(a=>a.onplay=()=>clips.forEach(b=>{if(b!==a)b.pause()}));</script></html>'''
    (out / 'index.html').write_text(page)
    print(f'A: {a_seconds:.2f}s; B: {b_seconds:.2f}s; limit: {maximum}s; B over limit: {b_seconds > maximum}')
    print(f'B cached: {cached}\nPreview: {out / "index.html"}')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
