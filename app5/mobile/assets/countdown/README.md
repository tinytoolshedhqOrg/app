# 倒數語音

跟練在每個動作前先念動作名稱，停一下，再以牆鐘每秒一拍播放「三、二、一、開始」，並在動作的 27、28、29 秒播放「三、二、一」。準備段固定 7 秒：2.5 秒名稱、0.5 秒停頓，接著 3、2、1、開始各隔 1.000 秒，動作在「開始」之後 1 秒才開始。音檔跟動作提示一樣打包在 App 裡，離線播放，不在執行時呼叫語音服務。畫面只顯示 3、2、1，不顯示「開始」。

目前 App 介面只有 `zh-Hant`。這個資料夾的 `zh-Hant/` 就是對應的語言。以後若增加介面語言，為該語言各做一組 3、2、1、開始，並在 `src/audio/countdown.ts` 加入靜態 `require()`。

## 現在的檔案

`zh-Hant/3.mp3`、`2.mp3`、`1.mp3`、`start.mp3` 是 Azure `zh-TW-HsiaoYuNeural` 的語音，講稿為「三」「二」「一」「開始」。Azure 回傳的 MP3 會把短句補到大約 1.87 秒，前後都是靜音；這些檔案已去掉前後靜音，並重新編成 24 kHz、96 kbps、單聲道 MP3。量測長度：三 0.576 秒、二 0.408 秒、一 0.408 秒、開始 0.744 秒，都在時間上限內（數字 0.65 秒、開始 0.85 秒）。`manifest.json` 的 `status` 為 `ready`。

## 重新生成

聲線與既有動作提示相同：語速 `0%`，格式 `audio-24khz-96kbitrate-mono-mp3`。

金鑰只放本機，不要寫進程式、不要提交 Git。沿用 `app5/tools/.env`（已在根目錄 `.gitignore`）的 `AZURE_SPEECH_KEY` 或 `AzureSpeech__SubscriptionKey`。區域預設 `eastasia`。需要本機的 `ffmpeg` 與 `ffprobe`。

從 repo 根目錄：

```sh
python3 app5/mobile/scripts/generate-countdown.py --dry-run
python3 app5/mobile/scripts/generate-countdown.py
```

腳本會先向 Azure 要音檔，再用 `ffmpeg` 的 `silenceremove` 去掉開頭與結尾的靜音（`stop_periods=-1`），編成 24 kHz、96 kbps、單聲道 MP3，然後才量測長度。長度必須落在 manifest 的 `max_duration_seconds` 內。任一檔超過上限時，不會覆蓋現有音檔，也不會把 `status` 改掉。全部通過才覆寫 `3.mp3`、`2.mp3`、`1.mp3`、`start.mp3`，並把 manifest 標成 `ready`。生成後請再聽一次，確認發音，然後跑 `npm test`、`npm run typecheck`。
