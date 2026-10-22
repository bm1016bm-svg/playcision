<p><img src="public/brand/wordmark-bilingual.png" width="394" alt="Playcision／遊豫不決" /></p>

> Stop browsing. Start playing.  
> 別選了，開始玩。  
> Game of Throws／擲戲之王

Playcision 是一套 local-first、agent-native 的遊戲情報程式，提供 CLI 與本機 Web UI。每次執行才抓即時商店資料，依本機 YAML 規則產生新品、折扣或可重現的擲骰推薦。

它不需要帳號、中央後台、遙測或預載完整遊戲資料庫。Codex、Claude Code 或其他 coding agent 可以協助安裝與改設定；所有規則仍是人類可讀、可版本控制的普通檔案。

[English README](README.md)

## 目前狀態

這是 V1 的開發中原始碼，專案位於 [bm1016bm-svg/playcision](https://github.com/bm1016bm-svg/playcision)。網站尚未公開部署；GitHub 原始碼上傳不代表 npm 套件發布。

作者：[@bm1016bm-svg](https://github.com/bm1016bm-svg)。歡迎追蹤作者或替專案點星星。網站提供自願咖啡贊助入口；作者完成綠界申請並設定經核對的收款連結前，不開放付款。設定步驟與免費獨立遊戲曝光規劃見 [贊助與試辦說明](docs/support-and-indie-pilot.md)。

2026-08-10 實測 `npm view playcision` 回傳 `E404`。這只代表當下 registry 沒有回傳套件；不代表名稱已保留，也不保證未來仍可用。只有實際發布套件後，`npx playcision init` 才是有效安裝流程。

## V1 範圍

- TypeScript CLI 與嚴格驗證的 YAML 設定
- 本機 Web UI、滑卡候選池與鍵盤／按鈕替代操作
- Steam 即時新品與價格資料
- 新品／近期上市規則；預設保留搶先體驗與成人內容
- 價格、折扣、本機觀測新低、通知去重
- 均勻或加權的 seeded 擲骰
- Terminal、Markdown、JSON、Slack 輸出
- 本機排程或 GitHub Actions
- 少量、可關閉、可刪除的本機狀態

Notion、RSS、MCP 與其他商店是後續整合，不是 V1 承諾。

## 從原始碼執行

需要 Node.js `>=22.12`。

```sh
npm ci
npm run build
node dist/cli.js init
node dist/cli.js doctor
node dist/cli.js digest --dry-run
node dist/cli.js ui --open
```

開發時可用 `npm run dev -- <command>`。若你明確執行 `npm link`，即可改用 `playcision <command>`。

## CLI

| 指令 | 用途 |
| --- | --- |
| `playcision init` | 建立 `.playcision/`，詢問地區、興趣、規則、輸出與排程。 |
| `playcision ui` | 啟動只綁定本機 loopback 的滑卡 Web UI。 |
| `playcision discover` | 即時取得符合條件的 Steam 新品與近期上市遊戲。 |
| `playcision deals` | 判斷即時價格、折扣、明列的願望清單 App ID 與本機狀態。 |
| `playcision roll` | 建立候選池，再用均勻或加權隨機選一款。 |
| `playcision digest` | 一次執行 Discover、Deals 與 Roll，並寫入設定的輸出；加 `--notify` 才送 Slack。 |
| `playcision doctor` | 檢查設定、路徑、Provider 連線與輸出前置條件。 |

Roll 控制包含 `--seed <text>`、`--reroll <counter>`、`--skip <appid> --skip-days <days>`、`--exclude <appid>`、`--open-store` 與 `--launch`。只有「正規化後設定、候選池、權重規則、reroll counter」都相同時，同一 seed 才會重現；商店資料更新後，日後結果可能不同。

完整語義見 [CLI 參考](docs/cli.md)。

## 本機 UI

```sh
playcision ui --open
```

UI 預設只監聽 `127.0.0.1:4173`，沒有帳號、中央後台或遙測。頁面會在載入時執行一次不寫檔、不通知的 digest，然後把即時 Discover、Deals 與 Roll 候選做成卡牌：左滑略過、右滑加入「本次收藏」清單，方向鍵可執行相同操作，Backspace 可復原。卡片詳情中的「跳過 7 天」與「永久排除」會寫入允許的 `.playcision/state.json` 欄位；本次清單只存在目前頁面記憶體，不另建資料庫。

開發 UI 時可執行 `npm run dev:ui`。`--host 0.0.0.0` 會把偏好資料暴露給可連線的區域網路裝置，CLI 會明確警告；一般使用不建議開放。

## 設定

[`examples/config.tw.yaml`](examples/config.tw.yaml) 是完整 V1 範例，逐欄對齊 `src/config/schema.ts`。

```yaml
deals:
  maxPrice: 300
  minDiscountPercent: 20
  localObservedLowOnly: false
  wishlistAppIds:
    - "413150"
  wishlistSteamId: null

outputs:
  slack:
    enabled: true
    webhookEnv: SLACK_WEBHOOK_URL
```

`maxPrice` 使用設定中的貨幣單位。Steam 價格進入程式後會正規化成整數百分之一單位；例如 NT$300.00 會是 `30000`。

價格與折扣是 OR 規則：預設為價格不高於 NT$300，或折扣至少 20%。`maxPrice: null` 或 `minDiscountPercent: 0` 可分別關閉該條件；Steam 回傳幣別與設定不一致時會先失敗，不會硬套價格規則。

V1 預設只使用 `deals.wishlistAppIds` 明列的 Steam App ID。使用者也可主動把公開、純數字的 SteamID64 填入 `deals.wishlistSteamId`；Playcision 才會呼叫實驗性的無 key `IWishlistService`，並合併回傳 App ID。私人、空白、不存在或暫時不可用的 wishlist 可能無法可靠區分；欄位為 `null` 時完全不執行同步。

## 本機檔案與隱私

```text
.playcision/
├── config.yaml
├── state.json
├── secrets.example
├── outputs/
├── templates/
└── AGENTS.md
```

`state.json` 不是遊戲資料庫，只保留執行時間、觀測價格、通知標記、暫時跳過與永久排除。預設保留 90 天，並用本機 lock 避免同時執行互相覆寫。可關閉 state 或刪檔重置；代價是通知去重、價格變動、本機觀測新低與持久 skip 都會失效。

Slack webhook 必須放環境變數或排程平台的 secret store，不能放入 `config.yaml`、state、commit、命令列參數或 log。

詳見 [隱私與安全](docs/privacy-security.md) 及 [安全政策](SECURITY.md)。

## 資料限制

V1 使用的 Steam Search、Store Browse 與 `appdetails` 是 Valve 第一方、目前可無 Web API key 觀測的 Store 介面，但 Valve 沒有把它們發布成穩定公開合約。HTML／JSON 格式、可用性、內容與限流隨時可能改變；程式必須驗證回應、節流、有限重試，並在 schema drift 時明確失敗。

「本機觀測新低」只代表這份 `state.json` 自開始追蹤後看過的最低價，不是 Steam 全歷史最低價。

成人內容開關不會繞過 Steam 的地區、法律、年齡、登入或商品可用性限制。詳見 [Steam 資料合約](docs/steam-data.md)。

## 排程與送達語義

[排程指南](docs/scheduling.md) 包含 Windows Task Scheduler、Linux cron、macOS launchd 與 GitHub Actions。可複製的 workflow 在 [`examples/github-actions/daily-digest.yml`](examples/github-actions/daily-digest.yml)。

GitHub-hosted runner 是暫時性環境。範例用 Actions cache 還原／保存 `state.json`，但 cache 可能被淘汰或不可用；排程也可能延後或漏跑。Slack 送達與去重都是 best-effort，不是 exactly-once。

## UI 方向

預設介面採 Inter、深藍玻璃導覽、高對比文字與 lime 操作色。Steam 圖片完整呈現在 16:9 畫框內；略過與收藏是主要操作，點擊卡片開啟詳情，不模擬手機外框或系統狀態列。

- `/` 與 `/?consumer=1`：正式 consumer 介面；`/?lab=1`：視覺實驗；`/?legacy=1`：舊版介面。
- 左右滑動或方向鍵略過／收藏；Backspace 或復原按鈕回復上一個 session 決策。
- 「本次收藏」、一般略過與篩選只存在這次頁面 session，重新載入會清除。
- 詳情的「跳過 7 天／永久排除」使用既有本機 API，重新載入仍有效。寫入失敗會保留遊戲並顯示錯誤。
- Steam 分頁提供遊戲庫與商店入口，不讀取或假設使用者擁有的遊戲。
- Provider 合約說明收在 Steam → 資料來源；操作失敗會在操作處顯示。

詳見 [設計語言](docs/design-language.md) 與 [UI 驗證](design-qa.md)。CLI 與 `NO_COLOR` 行為不變。

## 第一方參考資料

- [Steam Web API 概覽](https://partner.steamgames.com/doc/webapi_overview?language=english)
- [Steam Web API 驗證](https://partner.steamgames.com/doc/webapi_overview/auth?l=english)
- [Steam Web API 回應與 429 說明](https://partner.steamgames.com/doc/webapi_overview/responses?l=english)
- [Steam Web API 使用條款](https://steamcommunity.com/dev/apiterms)
- [Slack Incoming Webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks)
- [GitHub Actions 排程事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## 授權

[MIT](LICENSE)

### Steam 卡片內容與玻璃介面

Consumer UI 使用本機打包的 Geist 與 Noto Sans TC。半透明材質透過 CSS backdrop-filter、薄邊反射與陰影呈現；這是網頁材質，不是 iOS 原生 Liquid Glass 渲染器。減少透明度／提高對比的系統設定會切換成實色背景。

卡片簡介直接取自 Steam appdetails 的 short_description，移除 HTML 後以文字顯示。圖片優先使用 Steam StoreBrowse 回傳的 main_capsule_2x 高解析度橫向封面，載入失敗再依序使用其他正式封面、appdetails 原圖與原候選縮圖；不推測 CDN 檔名、不生成或放大補畫。素材的原始品質仍由發行商決定。簡介與圖片採用獨立的按需呈現資料，不改變價格、候選池或 seeded random。僅保留有上限的程序記憶體快取，不寫入本機遊戲資料庫。

### 收藏選遊戲與介面語言

右上角篩選整合探索／新品／折扣、平台、價格、類型與遊玩人數，更新資料移至篩選抽屜。收藏後顯示短暫「已收藏 · 查看清單」，不開彈窗；本次收藏頁提供「從收藏中幫我選一款」與結果的「前往 Steam」。選擇以目前推薦種子（無推薦時用 digest 產生時間）、收藏 ID 集合與本次重選次數決定，不改寫原本推薦的 seed 或候選池。收藏仍維持本次 React session。

Steam 簡介請求跟隨目前 UI 的語言（例如 zh-Hant → tchinese），語言納入快取鍵。若發行商沒有提供該語言，Steam 可能回傳英文；此時保留來源原文，不捏造翻譯、不使用未設定的外部翻譯服務。

### 預設熱門暢銷

Consumer UI 首次進入與清除篩選後，預設使用 Steam「熱門暢銷」來源，保留 Steam 回傳的榜單順序，不再以新品發售日期排序作為首頁。新品與折扣仍可在篩選中切換。熱門候選不套用新品天數限制，會遵守設定中的成熟內容選項、App ID 排除、暫時略過與永久排除，以及 UI 篩選。

資料取自 Steam 的 [Top Sellers](https://store.steampowered.com/search/?filter=topsellers&category1=998) 搜尋來源；這代表暢銷榜，不宣稱每款均為 AAA，也不新增虛構熱度或玩家數。榜單請求失敗時顯示錯誤，不以新品冒充熱門。CLI 的既有發現、折扣與 seeded roll 規則不變。

背景使用低飽和藍綠光帶緩慢移動，遊戲卡片維持實色。背景分頁暫停動畫；系統啟用減少動態效果時顯示靜態背景，高對比或減少透明度模式關閉裝飾光帶。採用 CSS，沒有新增 Three.js 或遠端視覺素材。

探索頁點擊空白處取得焦點後，← 略過、→ 收藏、Backspace 復原。長按不連續決定；篩選、詳情、輸入欄位及其他分頁不觸發卡片快捷鍵。按鈕提供快捷鍵提示。

遊戲圖片先取得 Steam 高清資產、下載並解碼完成後才顯示，避免搜尋縮圖先糊後清。探索頁預載目前及後六張（每輪兩個背景工作，候選改變時停止舊輪次追加），使用最多 24 筆的 LRU 記憶體快取共用請求與已解碼圖片；瀏覽器 HTTP 快取依 Steam 回應標頭運作。快取不寫入遊戲狀態，重整後記憶體快取重建。高清資產失敗才依序嘗試其他真實 Steam 圖片與搜尋縮圖；慢速連線下顯示固定比例載入底圖。

探索卡片固定預留兩行標題、一行標籤及三行簡介，簡介尚未載入時也保留空間；價格區統一高度，原價置於現價下方。長內容於卡片截斷，可點卡片查看完整詳情，避免內容長短使決策操作列上下位移。

### 玩家評價與評論

探索卡片提供兩個獨立統計：最近評論（Steam 每日近期 bucket 加總，全部語言，提示中標示實際 UTC 日期範圍），以及使用者語言的全期間評論（全部購買來源、排除離題評論）。顯示好評比例與總數；好評比例為正評 ÷（正評＋負評）四捨五入，不是另造 Steam 評價標籤。缺少統計時標為暫無資料，不以全期間統計取代近期。

點擊遊戲開啟錯落評論卡：好評、差評各最多六則，依 Steam 實用度排序（day_range=365），交錯循環呈現。選讀比例不代表總體比例。預設使用者語言，可切換全部語言；使用 Steam 公開顯示名稱，未提供名稱時保留 Steam ID。文字由 React 安全渲染，不執行玩家 HTML。長留言可捲動，來源連結可查看原評論。

滑動、左右鍵或箭頭按鈕切換評論；Escape 或點背景返回。視窗內保留收藏、前往 Steam、完整遊戲簡介、跳過七天、永久排除與啟動遊戲。支援焦點管理與減少動態效果。

評論只使用有界記憶體快取（前後端各最多 64 筆、五分鐘），不寫入本機遊戲状态。官方 [appreviews 文件](https://partner.steamgames.com/doc/store/getreviews) 定義評論與統計；`appreviewhistogram` 為 2026-09-22 實測的 Steam 商店實驗性端點，schema 改變時近期統計會顯示不可用。玩家顯示名稱也是實測額外欄位，缺失不會捏造名稱。

### 分享收藏清單

分享頁以平台圖示選擇 Discord、Facebook、Instagram、TikTok、Markdown 或純文字，勾選本次收藏後，按「複製清單」貼到聊天或自己的網站編輯器。輸出只有遊戲名稱與公開 Steam 商店連結，不含本機設定。Discord 格式抑制連結預覽並將長清單分段；每段分別複製。Markdown 適用支援 Markdown 的編輯器，並非所有網站都會自動呈現格式。剪貼簿權限失敗時可從預覽手動複製。收藏仍為本次瀏覽工作階段，不會上傳或自動發送訊息。

Discord 分段以每段不超過 2,000 字元為相容預算，參考 [Discord 官方 Message 文件](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx)。

收藏頁「從收藏中幫我選一款」使用原有 seeded 選擇規則，加入逐漸減速的搖獎、單次柔和揭曉光效與彩帶。抽選期間防止重複點擊；減少動態模式直接呈現結果。離開頁面會停止搖獎計時。

篩選遊戲採全螢幕介面：來源置頂，桌面以兩排分類入口展開完整類型選項，不設「更多類型」、類型搜尋框或重複的已選條件標籤。從主頁依序開啟篩選、點分類、選類型，即可選到最終選項，再按底部套用。遊玩人數、價格與平台直接顯示；搶先體驗和成人內容放在可展開的進階篩選。每組條件單選，不同組合併套用；底部固定清除與套用，關閉則取消尚未套用的修改。右上角問號直接重播篩選教學，保留尚未套用的選擇；結束教學後回到原來的捲動位置。AI 排除開關共用於探索與推薦，包括推薦後續載入的遊戲。活動來源尚未接入這次 UI 重排。

成人內容提供「不限／只看成人／排除成人」，預設不限。僅依目前候選池中的 Sexual Content、Nudity、Hentai 等明確標籤判斷，不以一般 mature、血腥或恐怖標籤推定。不新增完整目錄，也不覆蓋原有來源、區域或設定限制；沒有成人標籤資料不代表經過內容分級驗證。

類型以單選按鈕選取；點「全部」取消類型限制。價格可選付費遊戲（必須有實際正數價格），搶先體驗可選不限、只看或排除；依原有 Steam 欄位過濾。

社群圖示選擇輸出格式，不會登入或自動發布。Facebook、Instagram、TikTok 採純文字加公開 Steam 網址；平台不保證將每個貼文位置的網址變成可點擊連結。取消勾選只影響輸出，不會刪除收藏。

分享頁以無底框社群圖示、Steam 遊戲圖片和可勾選清單呈現，連結直接可見；平常不顯示原始文字框，只有剪貼簿失敗時才展開手動複製區域。

載入畫面改用原品牌播放／雙箭頭造型的 SVG 動畫：三角形成形、銀色路徑展開、双箭頭依序浮現。無灰色骨架卡、不顯示假進度、不額外延遲資料載入；減少動態模式直接顯示完整標誌。

探索進度條依目前篩選範圍的已瀏覽比例更新，復原會回退進度。收藏頁按幣別加總目前取得的售價；未提供價格另列、不算作免費。分享頁隱藏原始網址，但複製內容仍包含 Steam 連結，勾選支援鍵盤操作。核心操作使用亮綠底色與懸停流光，減少動態偏好下停用動畫。

右上角可選 13 種介面語言：繁體中文（每次開啟預設）、英文、簡體中文、日文、韓文、德文、法文、西班牙文、巴西葡萄牙文、義大利文、俄文、泰文、越南文。切換不清空收藏；遊戲說明與本語言評論依選擇重新查詢，商店沒有翻譯時仍可能回傳原文。Steam 遊戲名稱與未翻譯的細分類標籤保留來源文字，不使用機器翻譯。
新增「推薦」頁，以當次取得的熱門遊戲優先排列，再接其他候選，去除重複及已排除項目；不是個人化推薦模型。列表只提供愛心收藏，與探索、收藏、分享共用本次清單。平台顯示 Windows／macOS／Linux 圖示並保留可讀取名稱；縮圖使用瀏覽器延遲載入。預設頁面仍為探索。

## Recommendation shelves and alignment
- Recommendation now uses separate horizontal popular, new-release and discount shelves, with responsive tiles, scroll snapping, keyboard/arrow navigation and shared favorite toggles. It does not imply personalized play history or a release calendar.
- Nearby tiles use the existing decoded high-resolution artwork cache instead of enlarging list thumbnails. Unavailable sources retain the established fallback behavior.
- Explore review rows share label, rating and count columns, and price aligns within its commerce row.

## 今晚一起玩（第一版）

分享頁新增最多四人的牌桌：40 秒出牌、20 秒投票，每人最多兩款，同款合併，結束後公開結果與 Steam 連結。房間資料由伺服器同步，瀏覽器只保留匿名憑證。已提供 Cloudflare Durable Objects 部署程式；尚未公開部署。本機预览服務重啟會清除測試房間，雲端版本使用持久儲存並在兩小時後到期。操作及部署限制見 [房間說明](docs/rooms.md)。

## 邀請制網頁內測版

內測版使用獨立 Node 網站入口、瀏覽器收藏與持久房間；與個人 CLI 設定隔離。本次未部署外網。部署、保留期限與回滾方式見 [內測版交付](docs/beta-release.md)，發出邀請前請完成 [驗收表](docs/beta-acceptance.md)。
# AI 內容篩選

網頁「篩選遊戲」可開啟「排除已揭露 AI 內容」。探索與推薦的各分類及後續批次都會依 Steam 商店頁的 AI 生成內容聲明排除遊戲；未揭露不代表未使用 AI，讀取失敗或年齡限制等未知結果仍顯示並提示。設定保存在本機瀏覽器，不會刪除現有收藏。


### Steam 活動候選來源（2026-10-22）

篩選面板的「Steam 活動」可選取活動，再點一次取消。下方類型、價格、平台、遊玩人數、搶先體驗、成人內容與 AI 聲明篩選沿用；按「套用篩選」後進入該活動的探索。活動分頁取自自己的候選清單，不使用熱門遊戲補位，剩餘符合遊戲不足時自動讀取後續批次。

名單使用官方活動頁的 tagged_items 與各區塊 capsules，套組展開去重；沒有明列商品的活動才查詢動態商品區塊。遊戲資料每批最多 50 筆，排除 DLC、原聲帶等商品；不確定的 StoreBrowse 類型再查 appdetails。玩法人數使用 Steam player categories，未定價不當成免費。一般條件在瀏覽器對活動批次取交集，AI 聲明使用共用檢查流程。伺服器同一活動批次共用快取，不因不同條件重抓資料。

來源是 [Steam 官方商店](https://store.steampowered.com/) 的實驗性介面，不保證涵蓋所有活動。活動索引及候選名單快取五分鐘，活動圖文十分鐘；快取到期後下一次請求更新，並非即時推播。單活動上限 10,000 個候選 ID、200 個套組；資料截斷、格式變更、逾時或限流會報錯，不宣稱名單完整。均為有界記憶體快取，不建立永久遊戲資料庫。

實測記錄：artifacts/filter-ui/event-integration.json。使用合成資料驗證跨頁、去重、套組展開、複合條件及截斷錯誤；網路不是單元測試依賴。
