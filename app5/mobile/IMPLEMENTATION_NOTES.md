# app5 實作筆記

## 2026-11-08：介面、原地伸展語音與播放器修正

### 本次介面調整

- 採用 B「輕快動能」方向：冷白底、鈷藍主卡片、雙欄組合卡片；首頁保留上次使用、組合及部位入口。
- 預覽採活動時間／動作摘要與可排序縮圖卡片；跟練、動作說明、完成頁同步調整。設計比較素材存於 `../design/ui-directions/`。
- 詳細流程與目前行為見 [README](README.md)。

### 已確認的語音設定

- Azure Speech 資源：`app5-speech`，區域 `eastasia`，方案 F0。
- 聲線：`zh-TW-HsiaoYuNeural`；SSML 語速 `0%`、不額外加入停頓。
- 使用者比較首句 A／B 後選擇 A（原版）。B 為慢 10%、在「先站穩，」後加 250ms 停頓，僅保留本機試聽，不套用至 App。
- 輸出格式：`audio-24khz-96kbitrate-mono-mp3`。
- 「原地伸展」包含 8 個動作、32 句講稿、379 個中文字元（含標點）。32 個 MP3 合計約 1.51 MB，總長約 125.64 秒；全部符合各句的時間上限。

已接入的動作 ID：

```text
stand_neck_turn
stand_shoulder_circles
stand_chest_open
stand_elbow_bend
stand_wrist_flex
stand_finger_open
stand_side_slide
stand_shoulder_blades
```

### 生成與接入方式

- 生成工具在 repo 根目錄的 `stretch-app/azure-tts/`，只需要 Python 3 標準庫。操作見該資料夾 README。
- 本機金鑰在 `stretch-app/.env`，支援 `AzureSpeech__SubscriptionKey` 或 `AZURE_SPEECH_KEY`；此檔已加入 Git 忽略規則，不打包進 App。
- 從 repo 根目錄執行：

```sh
python3 -B stretch-app/azure-tts/generate.py --dry-run
python3 -B stretch-app/azure-tts/generate.py
python3 -B stretch-app/azure-tts/compare.py
```

- 預設只處理 standing 組合。生成請求至少間隔 3.2 秒，對 429／部分 5xx 有有限次重試；相同參數及音檔雜湊符合時直接沿用，避免重複生成。
- 試聽輸出在 `audition-output/stretch/azure/standing/zh-TW-HsiaoYuNeural/0%/`，包含播放器頁面、MP3、播放清單與 manifest；整個試聽目錄被 Git 忽略。換電腦不會取得這些本機暫存，但正式 App 音檔會跟著 Git。
- 生成腳本本身只產出試聽檔，不會自動覆寫正式素材。這次已將通過雜湊、講稿一致性及 `afinfo` 長度檢查的 32 個 MP3 複製到各動作的 `audio/`。
- 各 `exercise.json` 的對應 cue 已標記 `audio_status: ready`，填入實測 `measured_duration_seconds`。
- 執行 `npm run content:build` 產生 `src/content/exercise-index.ts` 的靜態 `require()`。目前索引為 36 個動作、32 個已就緒語音檔。
- 同一動作可被不同組合及部位入口引用，所以這些入口也會共用語音。其他動作沒有音檔時仍顯示文字提示。
- App 播放本地音檔，不呼叫 Azure、不需要金鑰；正式打包後可離線使用。開發模式下 Expo Go 仍透過 Metro 提供素材。

### 播放器問題與修正

- 使用者回報跟練時只聽見背景音樂。實際檢查時，模擬器另出現 `pause` 呼叫失敗：找不到對應的 native shared object。
- 已確認清理順序有問題：Expo `useAudioPlayer` 擁有並釋放原生播放器；其清理可能先於畫面 effect 清理執行，畫面再呼叫 `music.pause()`／`audio.stopAll()` 便會操作已釋放的物件。
- 修正為 `createCueAudioService().dispose()` 只取消 JavaScript 計時器並清除狀態；畫面卸載交由 Expo hook 釋放及停止原生播放器，不再重複呼叫原生 pause。
- 跟練現在等待音訊模式設定及背景音樂偏好讀取完成，再啟動計時與第一句提示，避免第一句早於音訊設定。
- 正常的暫停、切動作、緩衝及完成仍透過原本的播放控制停止／暫停語音。背景音樂維持 25%，語音維持正常音量。
- 冷啟動後，模擬器實際原生狀態已確認背景音樂及語音都有播放進度，語音出現完成事件、無原生播放錯誤；離開跟練再開始也確認可播完第一句。
- 上述證據確認程式與原生播放器運作；尚未以真機驗證實際出聲、來電中斷、藍牙／耳機斷線。也未完全證明使用者最初靜音情境的唯一成因，不應只靠 mock 測試宣稱實際聲音正常。

### 驗證與後續

- `npm run content:build`：36 個動作、32 個 ready clips。
- `npm run typecheck`、`npm run lint` 通過。
- `npm test -- --runInBand`：11 組、77 項測試通過；新增等待音訊設定與原生播放器已釋放後清理的回歸測試。
- iOS Metro 編譯、模擬器實際播放狀態、離開／重新開始已驗證。
- 尚未生成其餘動作、英文或越南文語音；先停在本次八個動作的範圍。
- 沒有執行 EAS build、submit 或商店發布。

模擬器開發啟動指令（在 `app5/mobile`）：

```sh
REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 npx expo start --ios --lan --port 8085
```

音訊出現不明狀態時，先冷啟動 Expo Go，再從預覽開始跟練；檢查原生 `isLoaded`、`playing`、`currentTime`、完成事件與錯誤，不要只確認 JS 呼叫過 `play()`。
