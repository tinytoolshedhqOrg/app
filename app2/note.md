一個超商廁所 app（品牌：急廁 Go）
一人開發，先以 MVP 為主，先只串 7-11 即可（路易莎資料已可合併）

# intro
模式類似 Ubike 或 GoShare：就近找到離你最近、且還在營業的三個有廁所地點。

- 頁面 1：可愛輕鬆的 Landing：「趕快找到你附近的廁所！」＋ Q 版木頭 WC 旗
- 頁面 2：即時地圖，依定位載入附近格子的地點，顯示最近三間；支援投票、評論、說明

前端：`mobile/`（Expo，對齊 app1 的 `npm start` demo 流程）  
舊版 web demo 仍在 `web/`（可選；互動功能以 mobile 為準）

## 定位（MapScreen）
- 先 `getLastKnownPositionAsync` 立刻出圖，再 `getCurrentPositionAsync`（Low accuracy + 約 6s timeout）精修
- 定位成功時靠 `showsUserLocation` 顯示系統藍點；不再另外畫「我的位置」Marker
- 權限拒絕或定位失敗 → 改用高雄市中心示範座標
- 鏡頭只在**第一次定位成功**時對齊附近三間；之後使用者拖地圖**不會**被拉回 GPS（可從高雄滑去台南）

## UX（MapScreen）

### 清單與地圖
- 點清單卡片或地圖 Marker → 由下往上出現細節 Bottom Sheet，蓋過原清單
- Sheet 兩段式（類似 Google Maps）：
  - 第一段（~34%）：店名、距離、營業、導航、最近幾則評論
  - 再往上（~78%）：全部評論 + 留言輸入（**最多 30 字**；每店最多 **10** 則，超額刪最舊）
  - 詳情為實心底板，直接蓋過清單（不半透明）
- 長按清單卡片 → 選「複製地址」或「分享」（內容為地址，非座標）
- 頁籤 **附近 / 全部**：
  - **附近**：依 GPS 最近 3 間（營業中）
  - **全部**：目前**地圖畫面範圍**內的營業中地點（按 cell 抓取，有上限；拉太遠會提示放大）
  - marker 先畫 20 個再升到 `ALL_MARKER_CAP`（80），避免 clustering 一次塞太多 pin 閃退
  - 拖地圖：region 需超過門檻才更新；viewport 載入 debounce 600ms（與附近相同）
- 右上角「說明」：
  - **支援類型：** 7-11（陸續開放路易莎、全家等等）
  - **支援地點：** 高雄市、台南市、新北市、台北市（陸續開放其他縣市）

### 左右滑投票
- **右滑** → 顯示讚 icon，`vote +1`
- **左滑** → 顯示倒讚 icon，`vote -1`，該卡從目前三間移除，並從距離 pool（25 間）補下一間建議
- **一裝置一地一票**（匿名 `device_id`；無登入）：DB 唯一鍵保證
- 顏色依**全局**分數：`> 0` **金色發光**、`= 0` 綠、`< 0` 淡紅

### 雲端（Supabase，全局投票／留言）
- Schema：`app2/supabase/schema.sql`（Dashboard → SQL Editor 執行一次）
- API Keys（anon / publishable）：https://supabase.com/dashboard/project/xrsikhytiuirliabldmg/settings/api-keys
- App 設定：`mobile/.env`（參考 `.env.example`）
  - `EXPO_PUBLIC_SUPABASE_URL` = `https://xxxx.supabase.co`（**不要**加 `/rest/v1/`）
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = anon 或 publishable key
- 本機只存匿名 `toiletgo:device_id`（AsyncStorage）
- 程式：`src/lib/supabase.js`、`community.js`、`deviceId.js`

# 資料來源
可從 `fetchData/` run 各個 python script 取得 json 到 `data/`（例如 `711_with_toilet.json`），再由 `buildDataSet.py` **產出** `dataSet.json`、空間格子、以及縣市檔。  
越南：`vn_toilet_script/fetch_vietnam.py` 從 OpenStreetMap（Geofabrik Vietnam PBF，Overpass 為備援）只產出 `data/vn_toilets.json`（`amenity=toilets`，排除 `access=private`/`no`，以及下列場所裡標了 `toilets=yes` 的點）。未確認場所不產出。**© OpenStreetMap contributors**，授權 ODbL。這份只進 Pro 包（`PRO_SOURCE_FILES`），尚未放進免費來源。  
**注意：** `dataSet.json` 是產物不是輸入；只改它再跑 build 會被 `711_with_toilet.json` 覆蓋。要改店家請改 source JSON 或重跑抓資料腳本。  
admin 會定期重跑 `buildDataSet.py`。客戶端「附近」只載入 9 格；「全部」載入畫面範圍內的 cells（超過 60 格則不載），不再整包 import `dataSet.json`。

## json schema
```json
{
  "id": "string",
  "type": "string",
  "name": "string",
  "地址": "string",
  "lat": "number",
  "lng": "number",
  "營業時間": {
    "raw": "string",
    "allDay": "boolean",
    "unknown": "boolean",
    "byDay": {
      "1": [{"open": "HH:MM", "close": "HH:MM"}],
      "2": [{"open": "HH:MM", "close": "HH:MM"}],
      "3": [{"open": "HH:MM", "close": "HH:MM"}],
      "4": [{"open": "HH:MM", "close": "HH:MM"}],
      "5": [{"open": "HH:MM", "close": "HH:MM"}],
      "6": [{"open": "HH:MM", "close": "HH:MM"}],
      "7": [{"open": "HH:MM", "close": "HH:MM"}]
    }
  },
  "備註": ["string"]
}
```

欄位說明:
- id: 唯一識別（優先用門市 POIID，否則 hash(type+地址)）
- type: `7-11` / `family` / `加油站` / `路易莎` / `麥當勞`（MVP 先 7-11，可合併路易莎）
- name: 門市名稱（可選）
- 地址: 地址字串
- lat / lng: WGS84 經緯度（算最近距離必填）
- 營業時間: 結構化時段（見下方規範）；顯示用 `raw`，判斷營業用 `byDay` / `allDay`
- 備註: 種子留言（可空陣列）；使用者新留言存在本機，之後可改後端同步

## 營業時間規範（統一規格）

來源網站字串不一（`24H`、`06:00 ~ 23:59`、`週一至週日 07:00-21:00`…），
抓資料時一律經 `fetchData/hours.py` 的 `normalize_hours()` 轉成下列物件，前端只依此判斷。

### 欄位
| 欄位 | 型別 | 說明 |
|------|------|------|
| `raw` | string | 原始字串，給 UI 顯示 |
| `allDay` | boolean | `true` = 24 小時營業 |
| `unknown` | boolean | `true` = 無法解析；MVP 視為「當作有開」以免漏列 |
| `byDay` | object | key 為 ISO 星期 `1`=週一 … `7`=週日；value 為當日時段陣列 |

### 時段規則
- 每個 slot：`{"open":"HH:MM","close":"HH:MM"}`（24 小時制，補零）
- 某日 `[]` = 該日公休
- `close < open`（例如 `06:00`–`01:00`）= 跨日，開到隔日 close
- `allDay: true` 時 `byDay` 填滿 `00:00`–`24:00`（前端也可直接看 `allDay`）
- MVP 不處理國定假日／寒暑假；`假日`／`例假日`／`週末` 一律當週六、日

### 判斷伪碼（前端）
```
if unknown → open
if allDay → open
slots = byDay[isoWeekday(now)]   // JS: ((getDay()+6)%7)+1
if slots empty → closed
for each slot:
  if close <= open:  // overnight
    open if now >= open OR now < close
  else:
    open if open <= now < close
```

### 範例
```json
// 7-11 24H
{"raw":"24H","allDay":true,"unknown":false,"byDay":{"1":[{"open":"00:00","close":"24:00"}],"...":"..."}}

// 非全年無休
{"raw":"06:00 ~ 23:59","allDay":false,"unknown":false,
 "byDay":{"1":[{"open":"06:00","close":"23:59"}],"2":[{"open":"06:00","close":"23:59"}],"...":"同左"}}

// 平日／週末不同
{"raw":"週一至週五 07:00-21:00 週末 08:00-20:00","allDay":false,"unknown":false,
 "byDay":{
   "1":[{"open":"07:00","close":"21:00"}],
   "6":[{"open":"08:00","close":"20:00"}],
   "7":[{"open":"08:00","close":"20:00"}]
 }}
```

# mobile 結構（互動相關）

| 路徑 | 用途 |
|------|------|
| `src/screens/LandingScreen.js` | Landing＋WcFlag |
| `src/screens/MapScreen.js` | 地圖／清單／投票／詳情 |
| `src/components/WcFlag.js` | Q 版木頭 WC 旗 |
| `src/components/PlaceDetailSheet.js` | 兩段式詳情＋留言 |
| `src/components/HelpModal.js` | 右上角說明 |
| `src/components/PlaceActionsModal.js` | 長按：複製／分享 |
| `src/components/UnlockProModal.js` | Pro 解鎖／離線包下載 |
| `src/lib/community.js` | Supabase 全局 comments |
| `src/lib/supabase.js` | Supabase client |
| `src/lib/deviceId.js` | 匿名裝置 ID |
| `supabase/schema.sql` | DB schema（SQL Editor 執行） |
| `src/lib/geo.js` | 距離、營業、`nearestOpen` |
| `shared/places.js` | 載入附近 9 格 + `loadPlacesInRegion` |

依賴：`@gorhom/bottom-sheet`、`react-native-gesture-handler`、`react-native-reanimated`、`@react-native-async-storage/async-storage`、`expo-clipboard`

# TODO

## 已完成
1. ~~**看全部地點**~~ — 主清單改為 `@gorhom/bottom-sheet`（三段 snap 14%/45%/85%）+ `BottomSheetFlatList`，加「附近 / 全部」切換頁籤
2. ~~**點空白處收合面板**~~ — MapView `onPress` 收合 sheet 到最小 snap
3. ~~**Handle 無營業時間資料**~~ — 詳情頁「營業時間不明，建議出發前確認」
4. ~~**拖地圖載入其他區域**~~ — `onRegionChangeComplete` + debounce 600ms 依地圖中心判斷縣市，載入該市全部（鏡頭不再自動拉回 GPS）
5. ~~**CDN 資料託管**~~ — 改用 `EXPO_PUBLIC_PLACES_URL` 指向 GitHub Pages（或其他靜態主機），`cellRegistry.js` 降為離線 fallback
6. ~~**全部 = 該市全部**~~ — `buildDataSet.py` 產出 `cities/{縣市}.json`；tab 數量與 marker 隨地圖中心縣市切換

## Nice to have
- **用戶自訂地點（本地端）** — 用 AsyncStorage 存用戶新增的地點，合併進 places state，地圖上用不同顏色 marker 標示

# 資料架構

## 資料流（CDN 模式）
```
fetchData/*.py → data/711_with_toilet.json → buildDataSet.py
                      ↓
              data/dataSet.json
              data/dist/cells/{i}_{j}.json
              data/dist/cities/{縣市}.json
                      ↓
              deploy-places.sh → GitHub Pages
                      ↓
  https://tinytoolshedhq.github.io/app/places/cells/{i}_{j}.json
  https://tinytoolshedhq.github.io/app/places/cities/{縣市}.json
                      ↓
              mobile app（EXPO_PUBLIC_PLACES_URL）
```

## 離線 fallback
若 `EXPO_PUBLIC_PLACES_URL` 未設定，mobile 只打包**高雄示範中心 9 格**（`cellRegistry.js`），不再 bundle 全台 cells / cities。  
正式路徑：CDN 按格抓取 + `expo-file-system` 磁碟快取（去過的格子可離線）。  
`manifest.json` 的 `version` / `builtAt` 用來做 lazy invalidation（版本變了不整包清空，下次讀該格再重抓）。

## 拖地圖載入
- 用戶拖地圖到新區域時，`onRegionChangeComplete` 觸發（debounce 600ms）
- 「附近」仍用 GPS 附近 9 格；「全部」依**目前畫面範圍**載入重疊的 cells（`loadPlacesInRegion`）
- 畫面涵蓋超過 `MAX_CELLS_PER_LOAD`（60 格）時不抓資料，提示「請放大地圖以載入地點」
- 鏡頭**不會**因新資料載入而 `fitToCoordinates` 回 GPS
- `shared/places.js`：記憶體 LRU（最多 200）→ 磁碟 cacheAdapter → CDN → bundled 9 格

## 落地狀態（方案 C）
- [x] `loadPlacesInRegion` cell 上限 + zoom-out UI
- [x] 記憶體 LRU
- [x] `cacheAdapter` + `mobile/src/lib/placesCache.js`（documentDirectory）
- [x] `manifest.json` `version` / `builtAt` + 啟動時 sync
- [ ] 可選：用戶自選縣市離線包（尚未做）


# 擴充性：按需抓取 + 持久快取（方案 C）

> 目標：資料量成長到 100 倍（`dataSet.json` ≈ 184MB、cell 數上萬）也不會爆。  
> 核心觀念：**App 永遠不整包載入資料**，只抓「使用者實際會用到的格子」，抓過就存進裝置持久快取，去過的區域即可離線。

## 為什麼選 C（vs 其他方案）
| 方案 | App 體積 | 首次啟動 | 離線範圍 | 100 倍可行性 |
|------|---------|---------|---------|-------------|
| A. 全部 bundle 進 App（現行離線 fallback） | 極大 | 慢 | 完整 | ❌ 上架體積爆炸、Metro 靜態 `require` 上萬檔 |
| B. 首次下載全部到手機 | 小 | 慢（下 184MB） | 完整 | △ 可行但體驗差、多數是浪費 |
| **C. 按需抓 cell + 持久快取** | **最小** | **快** | 去過的區域 | ✅ **最佳** |

現有 CDN 路徑（`EXPO_PUBLIC_PLACES_URL` + 按 cell 分片）本身就是 C 的雛形，  
唯一缺口是：目前只有記憶體快取（`shared/places.js` 的 `memoryCache`），關 App 就消失。  
方案 C = 把記憶體快取升級為**磁碟持久快取**，並補上兩個保護閥。

## 實作方式

### 1) 持久快取層（核心）
用 `expo-file-system` 把抓下來的 cell JSON 存到裝置，讀取順序：
**記憶體 → 磁碟 → 網路（抓完寫回磁碟）**。

- 快取目錄：`FileSystem.cacheDirectory + 'places/cells/'`（`cacheDirectory` 系統可回收；要保證常駐改用 `documentDirectory`）
- 檔名：`{i}_{j}.json`、`{縣市}.json`，與 CDN 路徑一致
- 建議在 `shared/places.js` 的 `fetchCell` / `fetchCity` 外包一層 `readThroughCache(key, fetcher)`：
  ```
  async function readThroughCache(relPath, fetcher) {
    if (memoryCache.has(relPath)) return memoryCache.get(relPath)
    const file = CACHE_ROOT + relPath
    const info = await FileSystem.getInfoAsync(file)
    if (info.exists && !isStale(info)) {
      const rows = JSON.parse(await FileSystem.readAsStringAsync(file))
      memoryCache.set(relPath, rows); return rows
    }
    const rows = await fetcher()                         // 走 CDN
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {})
    await FileSystem.writeAsStringAsync(file, JSON.stringify(rows))
    memoryCache.set(relPath, rows); return rows
  }
  ```
- `shared/places.js` 是純 JS（web 也用），`expo-file-system` 只在 mobile 有。  
  作法：把「快取讀寫函式」以 option 形式注入（如 `loadPlacesNear(lat,lng,{ cacheAdapter })`），  
  mobile 傳入 FS adapter、web 不傳（維持記憶體快取）。避免在 shared 直接 import expo。

### 2) 保護閥 A：`loadPlacesInRegion` 加上限
目前拉遠地圖會把 bounding box 內**所有 cell** 一次 `Promise.all` 抓，100 倍時會炸。
- 加 `MAX_CELLS_PER_LOAD`（例如 60）；超過就不逐格抓，改走 `cities/{縣市}.json` 或提示「請放大以載入地點」。
- 或設定「最小 zoom 門檻」，低於門檻不載入 marker（只顯示叢集）。

### 3) 保護閥 B：記憶體快取加 LRU 上限
`memoryCache` 目前只增不減。改成有上限的 LRU（例如最多 200 格），  
避免長時間使用累積過多資料在 RAM。磁碟快取則靠 TTL / 版本淘汰。

### 4) 版本與新鮮度（增量更新）
- `manifest.json` 已含 `placeCount` / `cellCount`，建議再加 `version` 或 `builtAt`。
- App 啟動時抓 `manifest.json`（很小）比對本地版本；版本變了就把磁碟快取標記為過期，  
  下次讀到該 cell 再重抓（lazy invalidation，不用一次清空）。
- 單一 cell 也可用 HTTP `ETag` / `Last-Modified` 條件請求,減少流量。

### 5)（可選）離線地圖包
沿用既有的 `cities/{縣市}.json` 分片，讓用戶「自選縣市」預先下載到 `documentDirectory`，  
需要完全離線去某地時才下該區，而非強迫全量下載（即方案 B 的痛點）。

## 落地順序（建議）
1. 先做 **2)+3)** 兩個保護閥（純前端、風險低，先擋住 zoom-out / RAM 問題）。
2. 再做 **1)** 持久快取（改 `shared/places.js` 加 cacheAdapter + mobile FS adapter）。
3. 最後做 **4)** 版本比對，讓資料能安全更新。
4. **5)** 視產品定位再決定要不要做離線包。

## 影響到的檔案
| 檔案 | 變更 |
|------|------|
| `shared/places.js` | `fetch*` 外包 read-through cache；`loadPlacesInRegion` 加 cell 上限；`memoryCache` 改 LRU |
| `mobile/src/screens/MapScreen.js` | 傳入 mobile FS cacheAdapter；zoom 門檻 UI |
| `mobile/src/lib/`（新增 `placesCache.js`） | 用 `expo-file-system` 實作磁碟讀寫 / TTL / 版本 |
| `fetchData/buildDataSet.py` | `manifest.json` 增加 `version` / `builtAt` |

> 備註：`cellRegistry.js`（全量 bundled cells）在 C 之下應**縮小或移除**，  
> 只保留極少數熱區 cell 當「完全沒網路且沒快取」時的最後保底，避免 App 體積隨資料成長。

# cmd

```bash
# 在 app2/ 目錄執行

# 1) （可選）重新抓 7-11 → data/711_with_toilet.json
python3 fetchData/get711List.py

# 2) 合併 source → dataSet.json + cells + cities + manifest.version，並同步
#    web/public/places/ 與 mobile/assets/places/
#    cellRegistry.js 只打包高雄示範 9 格（其餘走 CDN + 裝置快取）
#    請改 711_with_toilet.json（或其它 SOURCE_FILES），不要只改 dataSet.json
python3 fetchData/buildDataSet.py

# 3) 部署到 GitHub Pages（手機讀 CDN 時必跑；首次需先開啟 Pages → gh-pages）
bash deploy-places.sh

# 4) Expo demo
cd mobile && npm install && npm start
# 需設定 EXPO_PUBLIC_PLACES_URL（見 mobile/.env.example）
# 部署後請重開 app（memory cache / GitHub Pages 可能仍是舊檔）
```
