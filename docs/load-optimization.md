# 保留畫面與功能的減載調整

## 已套用原始碼

- 房間：以 WebSocket 推送取代每秒 HTTP 查詢；HTTP 出牌、投票寫入成功後才推送。階段截止會推送，結果完成後停止連線。背景分頁與未展開的牌桌不連線，返回時更新。身份、私人票數與原有房間期限不變。
- 篩選：原有「套用」才查詢的流程維持；探索、推薦續頁及活動頁的成功結果在瀏覽器記憶體重用 60 秒，各快取最多 20 頁。相同網址與語言的進行中查詢會合併，最多 20 個不同查詢；取消一個訂閱者不影響其他訂閱者，全部離開才中止該瀏覽器的 transport。錯誤及中止結果不保留。推薦頁離開後不再繼續等候或更新畫面；不宣稱瀏覽器取消後 Steam 已開始的工作也會取消。
- 公開列表：只有未啟用內測登入、且未使用本機個人狀態的 discovery/recommendations 成功回應才提供 `public, max-age=30, s-maxage=300`。其他回應、房間、憑證、錯誤仍不共用快取。
- 收藏與資料夾：原有瀏覽器儲存維持，沒有加入雲端同步或資料庫。
- 圖片、介紹、評論、外觀和滑動方式維持。首批預載 3 款、探索後續窗口 24 款、最多 4 款同時準備及解碼快取 64 筆，均未縮減。

## 尚待部署的部分

Node 本地服務與 Cloudflare 適配器均可本機驗證；雲端版本直接開放網頁，使用共用持久配額、Steam 查詢及休眠 WebSocket，詳見 [Cloudflare 上線文件](cloudflare-release.md)。仍未宣稱完成正式 Cloudflare 部署或線上容量驗收。

快取標頭本身不代表 Cloudflare 已在 CDN 快取 JSON，也不保證減少 Worker invocation。部署時需明確設定快取路徑、完整 query key、TTL、登入繞過及執行路由，並以實際回應與用量驗證。只在 Worker 內使用 Cache API，通常仍會執行 Worker，不能把 Steam 查詢減少當成 Worker 請求額度減少。

官方：[Static Assets 計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)、[WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)。

## 驗證範圍

`npm run check` 包含真實本地 HTTP/WebSocket 握手、跨站及未登入拒絕、非成員拒絕、儲存後推送；注入時鐘的測試驗證階段更新、投票隱私、到期及取消 timer。Cloudflare 休眠恢復以新的 adapter instance 和保留 attachments 模擬，不能替代實際平台測試。新增瀏覽器快取的 TTL、語言、容量、失敗與取消測試。未宣稱新的真實在線人數容量。
## Optional Steam AI disclosure filtering

The consumer filter adds an opt-in browser preference, `playcision.exclude-disclosed-ai.v1`.
Discovery and recommendation pages (initial categories and continuation pages) check candidates progressively in batches of three. Unchecked candidates wait; `disclosed` is excluded, `not-observed` is allowed without claiming AI-free status, and `unknown` remains visible. Saved collections are unaffected. Turning the preference off stops new checks and restores the original candidate list.

`GET /api/ai-disclosures?ids=...` accepts at most three positive numeric App IDs. The server uses only the fixed Steam Store host, English HTML and the configured country, with no forwarded cookies and no redirect following. Its shared memory cache has two active lanes, 24 waiting jobs, a 10-second queue timeout, 500 completed entries / 128,000 serialized bytes and a five-minute TTL. Each upstream fetch has an eight-second timeout, a one-MiB response cap and a 400-ms lane delay. HTTP 429 triggers a shared cooldown honoring Retry-After (at least 60 seconds); failures remain unknown. These are bounds, not measured production capacity. This opt-in feature adds store-page requests on cache misses.

瀏覽器共用觀察快取仍最多 500 筆，成功觀察五分鐘、未知結果一分鐘。每個掛載中的探索／推薦頁另外持有目前候選的觀察結果，避免長清單超過共用快取上限後，被淘汰的舊卡片反覆變回未檢查。候選移除或關閉 AI 排除時清除對應觀察，頁面卸載後釋放，不寫入 localStorage 或建立永久遊戲庫；不使用 AI 模型。

尚未檢查的候選仍等待，`unknown` 保持未知而非視為未使用 AI。TTL 到期後，下次畫面更新會安排背景重查；檢查期間保留該頁最後一次觀察，已揭露的仍排除、未知的仍保留。新候選優先於舊未知結果重試，避免後續載入被反覆重查阻塞。共享快取淘汰不會讓目前頁面的已檢查候選再計為 pending。

[tests/ai-view.test.ts](../tests/ai-view.test.ts) 的 `finishes 501 candidates without a 500-entry shared LRU making checked cards unchecked again` 使用 501 個合成候選及固定時鐘，驗證每批三筆、共 `ceil(501 / 3) = 167` 批即可完成，並保持共用快取只有 500 筆。其他測試驗證未知 TTL 重查、過期已揭露結果仍排除、移除候選及切換頁面的隔離。這是 deterministic 假 transport 回歸測試，不是 Steam 回應速度或真實在線容量量測。

The HTML classifier was checked against English, Traditional Chinese and Japanese Steam disclosure headings on 2026-10-21. AI and mature statements can share repeated `game_area_content_descriptors` IDs; they must be distinguished by heading. Empty, malformed, age-gated and structurally changed pages remain unknown. Absence cannot establish that a game never used AI, and entirely changed HTML can still reduce detection coverage. See [Steam's content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey). This is an experimental Store-page integration, not a stable documented API or an AI-free certification. Cloudflare deployment behavior has not been validated by this change.

## 2026-10-28 雲端減載

- 首頁 digest 和探索的三個初始來源共用相同的候選頁快取；digest 使用獨立的執行席，避免它等待的子查詢被自己的佇列卡住。
- API 讀取和 Steam 出站的配額，改為先持久預留、再從記憶體消耗。每個分鐘窗口從一筆起步，連續流量逐步增加，最多每批 API 16 筆／出站 8 筆；稀疏流量不預扣大批配額。建立房間和房間操作仍逐次記錄。重啟或換分鐘會丟棄未用完的預留額，不會退還或繞過全站上限，因此可能保守少用最多 15 筆 API／7 筆出站配額。
- 任一 Steam 通道收到 429，核心查詢、附加資料與 AI 通道共同冷卻，至少 60 秒並尊重更長的 Retry-After。已取得的有效快取仍可讀取；不取消已經送出的其他上游請求。冷卻狀態在記憶體，持久出站配額仍跨重啟有效。
- 沒有加長原有的成功資料 TTL、減少篩選功能、縮小封面或取消後續預載。沒有新增付費雲端服務。
- 帶內容雜湊的 JS／CSS／字型使用瀏覽器私有的一年 immutable 快取；版本內容改變會換檔名。HTML、API、錯誤與找不到資產時的 SPA fallback 不適用。這可減少重訪時的檔案請求。網頁入口不需邀請碼或登入。

實作依據：[Durable Objects 記憶體與持久儲存](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)。記憶體可能因重啟丟失，因此配額必須先寫入成功才可使用。Worker 仍會執行來源檢查及轉送；減少儲存／Steam 呼叫不能視為免除 Worker invocation。[靜態資產與 run_worker_first 計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)。

