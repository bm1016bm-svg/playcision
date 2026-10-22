# 保留畫面與功能的減載調整

## 已套用原始碼

- 房間：以 WebSocket 推送取代每秒 HTTP 查詢；HTTP 出牌、投票寫入成功後才推送。階段截止會推送，結果完成後停止連線。背景分頁與未展開的牌桌不連線，返回時更新。身份、私人票數與原有房間期限不變。
- 篩選：原有「套用」才查詢的流程維持；相同網址與語言的成功結果在瀏覽器記憶體重用 60 秒，最多 20 頁。錯誤及中止結果不保留。過時請求依原流程中止；不宣稱瀏覽器取消後 Steam 已開始的工作也會取消。
- 公開列表：只有未啟用內測登入、且未使用本機個人狀態的 discovery/recommendations 成功回應才提供 `public, max-age=30, s-maxage=300`。其他回應、房間、憑證、錯誤仍不共用快取。
- 收藏與資料夾：原有瀏覽器儲存維持，沒有加入雲端同步或資料庫。
- 圖片、介紹、評論、外觀和滑動方式維持。首批預載 3 款、探索後續窗口 24 款、最多 4 款同時準備及解碼快取 64 筆，均未縮減。

## 尚待部署的部分

本次重啟的是 Node 本地服務，沒有部署 Cloudflare，也沒有完成整個 Node API 遷移。Cloudflare 房間備用適配器已加入休眠 WebSocket，公開入口仍維持安全封鎖；必須補齊服務端准入與跨房間配額並進行 runtime 驗證，才能開放。

快取標頭本身不代表 Cloudflare 已在 CDN 快取 JSON，也不保證減少 Worker invocation。部署時需明確設定快取路徑、完整 query key、TTL、登入繞過及執行路由，並以實際回應與用量驗證。只在 Worker 內使用 Cache API，通常仍會執行 Worker，不能把 Steam 查詢減少當成 Worker 請求額度減少。

官方：[Static Assets 計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)、[WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)。

## 驗證範圍

`npm run check` 包含真實本地 HTTP/WebSocket 握手、跨站及未登入拒絕、非成員拒絕、儲存後推送；注入時鐘的測試驗證階段更新、投票隱私、到期及取消 timer。Cloudflare 休眠恢復以新的 adapter instance 和保留 attachments 模擬，不能替代實際平台測試。新增瀏覽器快取的 TTL、語言、容量、失敗與取消測試。未宣稱新的真實在線人數容量。
## Optional Steam AI disclosure filtering

The consumer filter adds an opt-in browser preference, `playcision.exclude-disclosed-ai.v1`.
Discovery and recommendation pages (initial categories and continuation pages) check candidates progressively in batches of three. Unchecked candidates wait; `disclosed` is excluded, `not-observed` is allowed without claiming AI-free status, and `unknown` remains visible with a brief notice. Saved collections are unaffected. Turning the preference off stops new checks and restores the original candidate list.

`GET /api/ai-disclosures?ids=...` accepts at most three positive numeric App IDs. The server uses only the fixed Steam Store host, English HTML and the configured country, with no forwarded cookies and no redirect following. Its shared memory cache has two active lanes, 24 waiting jobs, a 10-second queue timeout, 500 completed entries / 128,000 serialized bytes and a five-minute TTL. Each upstream fetch has an eight-second timeout, a one-MiB response cap and a 400-ms lane delay. HTTP 429 triggers a shared cooldown honoring Retry-After (at least 60 seconds); failures remain unknown. These are bounds, not measured production capacity. This opt-in feature adds store-page requests on cache misses.

Client observations are also bounded to 500 entries, with five-minute successful observations and one-minute unknown observations. Browsing pages do not become a persistent game catalogue. No AI model is used.

The HTML classifier was checked against English, Traditional Chinese and Japanese Steam disclosure headings on 2026-10-21. AI and mature statements can share repeated `game_area_content_descriptors` IDs; they must be distinguished by heading. Empty, malformed, age-gated and structurally changed pages remain unknown. Absence cannot establish that a game never used AI, and entirely changed HTML can still reduce detection coverage. See [Steam's content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey). This is an experimental Store-page integration, not a stable documented API or an AI-free certification. Cloudflare deployment behavior has not been validated by this change.

