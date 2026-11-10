# 伸展（app5/mobile）

語音生成設定、素材接入、播放器生命週期修正與驗證紀錄見 [實作筆記](IMPLEMENTATION_NOTES.md)。

2026-11-08 採用 B「輕快動能」設計：冷白底、鈷藍主卡片、雙欄組合卡片、白色部位入口；預覽使用時間／動作摘要與可排序縮圖卡片，跟練與完成頁沿用同一配色。首頁保留「上次使用／組合／部位」，流程為預覽 → 跟練 → 完成。沒有統計、提醒、登入或購買入口。舊的 IAP 模組暫存，但不在啟動流程執行。

## 執行

```sh
npm ci
npm run content:build
npm run assets:build
npm run typecheck
npm run lint
npm test -- --runInBand
REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 npx expo start --ios --lan --port 8085
```

這台 Mac 的 `--localhost` 曾只監聽 IPv6，但 Expo manifest 使用 IPv4；上面的啟動方式可避免這個問題。不執行 EAS build / submit。

## 當前行為

- 11 個情境組合、8 個部位入口，引用同一份 100 個動作資料；包含同一活動的姿勢變體與關節活動。
- 每動作固定 30 秒。每個動作開始前有 7 秒準備（含第一個動作）：先念動作名稱（2.5 秒窗口）、停 0.5 秒，再以每秒一拍念「3、2、1、開始」，動作在「開始」後 1 秒開始。每個動作的結束倒數在第 27、28、29 秒。最後一個動作結束後立即進入完成流程。預覽的「活動時間」只算每個動作的 30 秒。
- 結束時依語音開關播放離線 HsiaoYu 口播「恭喜！完成了一組動作」。播完後顯示「歐哞！你好棒！」，依背景音樂開關播放一次 Yay 音效。
- 預覽可長按動作右側把手，上下拖曳排序；靠近上下邊緣會自動捲動。跟練會使用調整後的順序。
- 按下開始跟練才持久化最後組合與順序；只查看預覽不覆寫。重開首頁仍可恢復。第一次使用不顯示空白歷史卡片。
- 冷白底、鈷藍、Noto Sans TC 字型；首頁使用雙欄組合卡片與部位標籤，跟練使用長方形人物示範與分段進度條。
- 首頁主卡片與完成頁使用原版壺鈴吉祥物；尚無上次使用紀錄時，吉祥物顯示在首頁標題旁。動作維持靜態人物與箭頭。
- 預覽不顯示組合副標、每段間隔說明或長按提示；7 秒準備與拖曳排序功能保留。
- 介面移除注意事項、動作參考、底部醫療提示。資料庫保留來源與原有欄位供內容維護。
- 背景音樂採使用者提供的 `assets/music/stretch-background.mp3`，以 25% 音量循環。暫停、查看動作說明、完成或離開時停止／暫停；音樂開關會持久保存。
- App 進入背景會暫停跟練，返回後由使用者繼續。本原型尚未驗證真機音訊中斷／耳機拔除行為。
- 「原地伸展」八個動作已加入 32 個中文本地 MP3，採 Azure HsiaoYu（`zh-TW-HsiaoYuNeural`）預設語速、不額外加停頓。每句已量測並符合播放時間上限，按時間軸自動播放；引用同一動作的其他組合／部位入口也會播放。尚未補音檔的動作維持文字提示。App 不呼叫線上 TTS，可離線播放。
- 倒數口播（3、2、1、開始）使用離線的 HsiaoYu 音檔（`assets/countdown/zh-Hant/`）。「3、2、1、開始」的起音相隔剛好 1.000 秒，不是等上一句播完再接。畫面只顯示 3、2、1；「開始」有聲音、沒有文字。Azure 產生的短句會先去掉前後靜音再量測。語音關閉時不播放倒數，畫面數字仍在。動作提示必須在 27 秒前結束，避免蓋到結束倒數。
- 動作名稱使用離線的 HsiaoYu 音檔（`assets/exercise-names/zh-Hant/`），以動作 id 做靜態 `require()`。沒有音檔的 id 略過名稱，倒數照常。最長 2.208 秒，落在 2.5 秒窗口裡。

## 動作與組合資料

`assets/exercises/` 是新版動作的唯一編輯來源；`assets/content/exercises.zh-Hant.json` 僅保留舊分類與規格資料，執行時動作陣列會由新版取代。

```text
assets/exercises/
  手臂/
    三頭肌/
      stand_triceps/
        exercise.json
        audio/
          stand_triceps_cue_01.mp3  # 尚未生成
          stand_triceps_cue_02.mp3
          stand_triceps_cue_03.mp3
          stand_triceps_cue_04.mp3
  sources.json
  routines.json
  動作清單.txt                     # content:build 自動產生
```

各 JSON 包含動作 ID、姿勢、部位標籤、器材、準備姿勢、中文步驟、注意事項、完整 0–30 秒時間軸、來源 ID，以及 `library` 的部位／肌群／靜態圖模板。來源英文網址與適用範圍列於 `sources.json`。首批沿用原有 30 筆中文草稿，另新增 6 筆參考英文來源的內容；30 秒編排、換側及部分姿勢變體是產品設計，不是來源原始運動處方，亦未經動作專業審核。

`routines.json` 僅保存有序 `exercise_ids`，同一動作可重複引用於不同組合。新增至上百筆時不需要增加播放器分支。現有組合避免途中切換坐／站／躺；部位集合依坐→站→躺排序，使用者可暫停準備。

## 語音檔加入流程

每個動作的 `voice_cues` 是待合成逐句講稿。例如：

```json
{
  "id": "stand_triceps_cue_01",
  "at_seconds": 0,
  "max_duration_seconds": 9,
  "text": "左手抬高彎肘，右手輕扶左肘。",
  "audio_path": "audio/stand_triceps_cue_01.mp3",
  "audio_status": "pending",
  "measured_duration_seconds": null
}
```

1. 每句個別合成，將 MP3 放進該動作的 `audio/`，路徑相對於該 `exercise.json`。
2. 量測真實長度，填入 `measured_duration_seconds`，人工檢查方向、發音與完整性，將 `audio_status` 改為 `ready`。
3. 超出 `max_duration_seconds` 請重新合成調整語速，不要截掉重要提示。下一句不可重疊，而且整句必須在 27 秒前結束，把最後 3 秒留給「3、2、1」。
4. 執行 `npm run content:build`。Metro 需要靜態 `require()`，不能只把檔案丟入資料夾就自動發現。建置腳本會拒絕 ready 但缺檔、未量測或超時的音檔。
5. 執行型別、lint 與測試，再在模擬器／真機檢查。可以逐句補檔，缺檔仍使用文字提示。

生成的 `src/content/exercise-index.ts` 同時匯入 JSON 與現有音檔。執行時依 `at_seconds` 播放；暫停會暫停語音，切動作、緩衝和完成會停止原提示。語音與音樂使用不同播放器。未使用的預製舊 TTS 試聽工具位於 [`app5/tools/tts-audition`](../tools/tts-audition/)，本流程不自動執行它。

## 白藍設計與本地素材

設計稿：https://www.figma.com/design/wUNg8befHYBeTFeefkpfpk?node-id=4-139

- 首頁 `4:294`、預覽 `4:393`、跟練 `4:465`、完成 `4:534`。
- `assets/figma/kettlebell-cheer.svg`：由 Figma 完成頁正式匯出的 SVG（原始 230×253）。
- `assets/figma/kettlebell-hello.svg`：保存本對話中已確認的 Figma 原始向量繪圖資料（200×220）。因 Starter 讀取額度達上限，沿用已保留的幾何資料。
- `assets/figma/back.svg`：Figma 匯出的返回圖示（22×22）。
- `npm run assets:build` 將以上檔案封裝成 `src/components/figmaAssets.ts`，供 React Native SVG 本地讀取；不依賴暫時素材網址。
- `Mascot` 保留 SVG 原始比例，透過等比例容器縮放。
- 字型使用本地打包的 Noto Sans TC Regular / Medium / Bold；載入完成後才顯示主畫面。
