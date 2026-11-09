# 動作名稱語音

每個動作開始前，先念該動作的名稱，再進入「3、2、1、開始」。音檔打包在 App 裡，離線播放。

目前介面只有 `zh-Hant`。檔名是動作 id，例如 `zh-Hant/stand_chest_open.mp3`。`src/audio/exerciseNames.ts` 用靜態 `require()` 對應動作 id；沒有音檔的 id 不播放名稱，倒數照常。

這批是 Azure `zh-TW-HsiaoYuNeural` 去掉前後靜音後的 MP3。最長 2.208 秒（`sit_triceps`），短於播放器的 2.5 秒名稱窗口。`manifest.json` 只有講稿與秒數，沒有金鑰。
