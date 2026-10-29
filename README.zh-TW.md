# Playcision 使用與開發說明

[回到專案首頁](README.md)

首頁講的是為什麼做這個產品，這裡把執行方式、資料保存與幾個容易誤會的地方交代完整。目前是 1.0 上線前候選版，本機可用，尚未公開部署；正式網站與收款仍需分別驗收。

## 兩種執行方式

### 網站與多人房間：本機 Workers 預覽

需要 Node.js `>=22.12`。在儲存庫根目錄執行：

```sh
npm ci
npm run build
npx wrangler dev --config wrangler.jsonc --local --var APP_ORIGIN:http://127.0.0.1:4174
```

開啟 <http://127.0.0.1:4174/>。網站、Steam API 與房間透過同一個來源存取，預覽不需要邀請碼或登入 Cookie。這是本機環境；把 localhost 房間連結傳給外網朋友，不會讓他連進你的電腦。

也可依[Cloudflare 部署文件](docs/cloudflare-release.md)設定 `.dev.vars` 後使用 `npm run cloud:dev`。正式部署前需設定有效 HTTPS `APP_ORIGIN`，完成資產、同來源 API、房間權限與跨網路驗收。`cloud:bundle` 是打包演練，`cloud:smoke` 是本機 runtime 測試，兩者都不會替你完成正式上線。

### 個人 CLI：規則、清單與排程

完成前述安裝與建置後：

```sh
node dist/cli.js init
node dist/cli.js doctor
node dist/cli.js digest --dry-run
node dist/cli.js ui --open
```

`init` 建立 `.playcision/` 設定；CLI 的 Web UI 預設綁定 `127.0.0.1:4173`。這條路線讀取你自己的 YAML 與可選本機狀態，和 Cloudflare 網站的共用查詢設定分開。不要把個人 CLI 設定或 Slack 密鑰放進公開網站。

開發指令 `npm run dev -- <command>` 對應尚未編譯的 CLI；`npm run dev:ui` 啟動含 Vite 的本機 UI，請先完成 `init`。尚未驗證 npm 正式發布，因此安裝說明採從原始碼執行，不要求使用 `npx playcision`。

## 網站上的幾條路

- **探索**：滑動、方向鍵與可見按鈕都可略過／收藏；復原按鈕可撤回目前工作階段中的上一個決定。
- **篩選**：先挑熱門、新品、折扣或 Steam 活動，再選類型、價格、平台、遊玩人數等條件。按「套用篩選」才執行查詢；活動也能搭配其他篩選。
- **推薦**：全視窗穿梭開場之後接原有推薦流，可跳過動畫。窄螢幕與減少動態模式採一般列表；收藏由外層保管，不隨推薦卡片卸載而消失。
- **收藏**：「本次收藏」保存在瀏覽器，重新整理仍可讀回；「整理收藏」用來移除遊戲。歷史收藏是獨立子頁，可新增、命名、刪除資料夾，將遊戲整理進去，並分享資料夾清單。
- **分享**：依 Discord、Facebook、Instagram、TikTok、Markdown 或純文字格式複製遊戲清單，再由你貼到目的地。程式不會替你發文。
- **今晚一起玩**：從分享頁進入短效房間。使用暱稱，候選與投票由房間伺服器同步，沒有全站會員帳號。

遊戲詳情可以查看 Steam 評論、介紹與商店連結，並主動「跳過 7 天」或「永久排除」。資料取得失敗時應保留返回與重試操作；沒有評論和評論查詢失敗是不同狀態。

## Steam 資料怎麼進來

查詢會依地區與語言向 Steam 取資料，再經過型別與數值驗證、App ID 正規化、條件篩選。遊戲名稱、標籤、圖片與介紹都來自商店資料，不由 AI 模型補寫。

| 內容 | 來源與處理 |
| --- | --- |
| 候選與售價 | Store 搜尋、Store Browse、必要時 `appdetails`；幣別不符時不硬套價格規則。 |
| 封面與介紹 | 商店素材按需求載入，前端使用有界快取與預載，避免重複下載。 |
| 評論 | Steam 評論服務，保留使用者語言／全部語言與正負評的範圍；來源失敗不產生替代評論。 |
| 活動 | 解析 Steam 活動索引、圖文及參與遊戲，再進行一般遊戲資訊補齊。 |
| AI 揭露 | 解析商店頁的生成式 AI 內容聲明，保存短期辨識結果。 |

這些 Store 來源由 Steam 提供，但搜尋 HTML、Store Browse、活動頁與 `appdetails` 並沒有本專案可依賴的永久穩定契約。欄位、網頁結構、區域限制與限流可能變動；程式集中管理端點、逾時、有限重試、回應大小與錯誤處理。具體端點與觀察日期見 [Steam 資料契約](docs/steam-data.md)。

活動索引、候選與多數雲端遊戲查詢使用五分鐘快取，活動圖文快取十分鐘；快取過期後的下一次請求才更新，不是 Steam 一換活動就立即推播。解析有筆數上限，也可能遇到限流或資料不完整，不能宣稱活動名單完整。

### 排除已揭露 AI 內容

這是玩家主動開啟的偏好，探索、推薦與後續載入的候選都會使用。已辨識到 Steam 聲明的遊戲會排除；尚待檢查的候選分批檢查，取得失敗或無法判定的結果保留。已收藏的遊戲不會因此被刪除。

沒有觀察到聲明，不能證明遊戲從未使用 AI。這個功能不分析遊戲畫面、不訓練辨識模型，也不宣稱能抓出未揭露的使用情況。依據是 Steam 的[內容調查與 AI 揭露機制](https://partner.steamgames.com/doc/gettingstarted/contentsurvey)。

## 哪些資料放在哪裡

| 資料 | 保存位置與行為 |
| --- | --- |
| 本次收藏、歷史資料夾 | 使用者瀏覽器 `localStorage`，沒有自動跨裝置同步。 |
| 網頁排除、暫時跳過與 AI 偏好 | 使用者瀏覽器；可在介面調整，清除網站資料會一併移除。 |
| 房間身分 | 同一分頁的 `sessionStorage`；重新整理可恢復座位，不能當作公開分享連結。 |
| 房間與投票 | 房間後端；Cloudflare 路線使用 SQLite Durable Objects。 |
| 遊戲資訊 | 有期限、有容量的記憶體快取，不建立永久完整遊戲庫。 |
| CLI 設定與狀態 | 專案內 `.playcision/`；與瀏覽器收藏分開。 |

清除瀏覽器資料、換瀏覽器或換裝置後，收藏不會由伺服器自動救回。瀏覽器儲存失敗時，程式會保留當前內容並提示未保存，不把記憶體中的變更當作已寫入成功。隱私邊界見[隱私與安全](docs/privacy-security.md)。

多人房間從建立起十分鐘到期，操作不續期；到期後拒絕存取。Cloudflare 的 alarm 執行時清理儲存，平台排程可能延遲，所以存取期限不代表物理刪除精確到秒。資料只供當桌決策使用，不拿來建立個人口味檔案。[房間同步與權限](docs/rooms.md)

## 減載做在資料流裡

前端合併相同進行中請求；成功頁面可短期重用，離開頁面後取消不再需要的訂閱。共用請求仍有其他訂閱者時，不會被其中一個分頁的取消中斷。

雲端將核心列表、首頁彙整、圖片、評論與 AI 查詢分配到受限制的快取及佇列。首頁彙整有自己的執行席，避免它等待的子查詢反過來被自己卡住。Steam 回傳限流時，各出站通道共用冷卻；已有有效快取仍可讀取。

推薦只掛載視線附近的卡片，圖片依瀏覽方向預載。多人房間使用 WebSocket 推送，而不是每秒輪詢；已驗證的 Cloudflare 連線可使用休眠機制。全站配額需要持久記錄的部分使用 Durable Object 保存，程序重啟不會重新獲得當天額度。

這些是讓負載有上限的設計，沒有換算成保證在線人數，也不能取代正式環境測試或入口防護。數值與測試限制見[減載設計](docs/load-optimization.md)與[Cloudflare 部署](docs/cloudflare-release.md)。

## CLI 規則與輸出

完整範例在 [`examples/config.tw.yaml`](examples/config.tw.yaml)，設定驗證的來源是 [`src/config/schema.ts`](src/config/schema.ts)。

| 指令 | 用途 |
| --- | --- |
| `init` | 建立並引導填寫本機設定。 |
| `doctor` | 檢查設定、路徑、資料來源與輸出條件。 |
| `discover` | 取得符合規則的新品與近期上市遊戲。 |
| `deals` | 取得價格、折扣與追蹤清單。 |
| `roll` | 從候選池均勻或加權抽選。 |
| `digest` | 合併探索、折扣與抽選結果；`--notify` 才發送 Slack。 |
| `ui` | 啟動使用本機設定的 Web UI。 |

```sh
node dist/cli.js discover
node dist/cli.js deals
node dist/cli.js roll --seed tonight
node dist/cli.js digest --dry-run
```

幾個需要保留精確含義的規則：

- **同 seed**：只有正規化設定、候選池、權重與 reroll counter 相同才會重現。Steam 候選變動後，不保證隔天抽到同一款。
- **本機觀測新低**：只比較這個 `state.json` 曾看到的價格。不是 Steam 全歷史最低價，刪除或停用狀態會失去這段觀察。
- **價格／折扣**：CLI 的兩種門檻採 OR，幣別確認後才計算。詳見[設定說明](docs/configuration.md)。
- **願望清單**：預設明列 App ID；只有主動設定 `deals.wishlistSteamId` 才查詢實驗性的公開願望清單來源。這不是 Steam 登入整合，也不能讀私人願望清單。
- **內容篩選**：不預設排除搶先體驗、成人或獨立遊戲；使用者可自行設定。程式不繞過 Steam 的區域、年齡或其他存取限制。

排程與 Slack 輸出是可選功能。Webhook 只從指定環境變數或排程平台 Secret 讀取，不放進 YAML、命令列或 Git。排程、快取與通知均可能延遲或重複，沒有 exactly-once 保證。[CLI 參考](docs/cli.md) · [排程說明](docs/scheduling.md)

## 開發與驗證

```sh
npm run typecheck
npm test
npm run check
npm run cloud:bundle
npm run cloud:smoke
```

`check` 依序執行型別檢查、測試及 CLI／網站建置。測試注入時間、隨機、檔案系統根目錄與 HTTP transport，避免把機器狀態或 Steam 當下可用性當成必要條件。Provider 修改需要對應的正常資料、缺欄位、錯誤格式、語系與 schema 變動測試。

測試通過不代表已驗證實體手機效能、跨網路房間、公開環境 CPU 與每日平台額度；部署後仍依[外網驗收清單](docs/cloudflare-release.md#外網驗收)操作。要回報安全問題，請依 [SECURITY.md](SECURITY.md) 的私人通報方式，不要把憑證貼進公開 Issue。

## 收款與後續計畫

「請我喝咖啡」和「免費支持」是分開的入口。免費支持連到作者與本專案 GitHub；網站尚未接上 PAYUNi 付款。作者已回報新增商店，但實際核准、信用卡開通、公開收款連結與正式付款結果仍未核對。原始碼中的付款連結驗證目前只接受舊綠界入口；PAYUNi 待下一輪串接，不可把 PAYUNi 網址填進 `VITE_ECPAY_*` 冒充已完成。請勿把商店金鑰放入公開的 `VITE_*` 設定。

台灣獨立遊戲優先的免費曝光、人工審核與公開成效回饋，目前是待實作方案，尚未提供申請或統計服務。[贊助與獨立遊戲試辦](docs/support-and-indie-pilot.md)

程式碼採 [MIT License](LICENSE)。專案首頁與作者：[Playcision](https://github.com/bm1016bm-svg/playcision) · [@bm1016bm-svg](https://github.com/bm1016bm-svg)
