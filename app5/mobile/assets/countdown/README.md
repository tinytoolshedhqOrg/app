# 倒數語音

跟練在每個動作前的 3 秒播放「三、二、一、開始」，並在動作的 27、28、29 秒播放「三、二、一」。音檔跟動作提示一樣打包在 App 裡，離線播放，不在執行時呼叫語音服務。

目前 App 介面只有 `zh-Hant`。這個資料夾的 `zh-Hant/` 就是對應的語言。以後若增加介面語言，為該語言各做一組 3、2、1、開始，並在 `src/audio/countdown.ts` 加入靜態 `require()`。

## 現在的檔案是靜音佔位

`zh-Hant/*.placeholder.mp3` 是靜音佔位，不是真人聲線。`manifest.json` 的 `status` 為 `placeholder`。播放時間仍會走，畫面上的數字也會顯示，但聽不到倒數。

## 生成正式音檔

聲線與既有動作提示相同：Azure `zh-TW-HsiaoYuNeural`，語速 `0%`，格式 `audio-24khz-96kbitrate-mono-mp3`。講稿是「三」「二」「一」「開始」（畫面上顯示 3、2、1、開始）。

金鑰只放本機，不要寫進程式、不要提交 Git。沿用 `stretch-app/.env`（已在根目錄 `.gitignore`）的 `AZURE_SPEECH_KEY` 或 `AzureSpeech__SubscriptionKey`。區域預設 `eastasia`。

從 repo 根目錄：

```sh
python3 app5/mobile/scripts/generate-countdown.py --dry-run
python3 app5/mobile/scripts/generate-countdown.py
```

腳本會覆蓋 `zh-Hant/*.placeholder.mp3`，量測長度，並把 `manifest.json` 的 `status` 改成 `ready`。長度必須落在 manifest 的 `max_duration_seconds` 內（數字 0.65 秒、開始 0.85 秒），超過就不會標成 ready。檔名維持 `.placeholder.mp3`，這樣 Metro 的 `require()` 不用改。生成後請再聽一次，確認發音，然後跑 `npm test`、`npm run typecheck`。
