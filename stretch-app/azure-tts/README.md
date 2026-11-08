# Azure HsiaoYu 語音試聽

使用 Python 3 標準庫呼叫 Azure Speech REST API，不需要安裝 Speech CLI 或 SDK。金鑰只從本機讀取，不寫進輸出或 App。預設僅生成 app5「原地伸展」八個動作的 32 句中文提示。

從 repo 根目錄執行：

```sh
python3 stretch-app/azure-tts/generate.py --dry-run
python3 stretch-app/azure-tts/generate.py
```

`stretch-app/.env` 支援既有的 `AzureSpeech__SubscriptionKey=...`，也支援 `AZURE_SPEECH_KEY=...`。區域預設 `eastasia`，可用 `AZURE_SPEECH_REGION` 指定。環境變數優先於檔案。不要將金鑰提交 Git。

- 聲線：`zh-TW-HsiaoYuNeural`；預設語速 `0%`。
- 輸出：`audition-output/stretch/azure/standing/zh-TW-HsiaoYuNeural/0%/`（Git 忽略）。
- `index.html`：逐句播放器及依序播放全部；`playlist.m3u`：本機播放清單。
- `manifest.json`：講稿、生成參數、檔案雜湊、音檔秒數、時間上限與超時標記。人工發音審核仍為 pending。
- 以 macOS `afinfo`（或 `ffprobe`）讀取音檔長度。超時只標記，不裁切、不自動加速。
- 每次請求至少間隔 3.2 秒；429／部分 5xx 有有限次重試。中斷可重跑，參數與檔案雜湊相符者沿用，不重複消耗額度。
- `--limit 1` 只生成首句。`--rate=+10%` 可另存較快語速的試聽版本。
- `--routine office` 等參數可指定其他現有組合；目前先不要生成其他組合。
- 不修改 exercise.json、不標記 ready、不接入 App；使用者確認試聽後再整合。

參考：https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech

## 首句 A／B 試聽

```sh
python3 stretch-app/azure-tts/compare.py
```

A 沿用原地伸展第一句已生成音檔；B 使用相同 HsiaoYu 聲線、語速 `-10%`，在「先站穩，」後加入 SSML `250ms` 停頓。只新增一個 B 音檔，不重做整組。產出保存在同聲線資料夾的 `ab-first-cue/`，包含雙播放器 `index.html`、兩個 MP3、B 的 SSML 與參數紀錄。重跑時雜湊符合就不重複呼叫 Azure。
