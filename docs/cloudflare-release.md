# Cloudflare 免費公開版

網站、Steam API、十分鐘房間共用同一個 Worker 網址。使用 Workers 靜態資產及 **SQLite Durable Objects**，不需要租主機、Docker、KV、D1 或信用卡收款服務。網頁直接開放，不需帳號、邀請碼或登入 Cookie；正式公開前仍須完成實際 Cloudflare 帳號上的 HTTPS 與跨網路測試。

## 目前公開部署

2026-10-29 已部署至 [Playcision 正式網站](https://playcision.bm1016bm-cf7.workers.dev/)，帳號的 Workers 方案確認為免費。已驗證正式 HTTPS、靜態資產及安全標頭、八個 Steam 資料端點，以及同一台電腦透過正式 HTTPS／WSS 進行的兩人出牌、投票、隱藏他人票數和 alarm 自動推送結果。測試房沿既有十分鐘期限清理，沒有增加管理刪除入口。

初次驗收曾遇到 Steam 資料暫時無法取得，重試後端點驗證通過；上游可用性仍可能變動。瀏覽器尺寸模擬不等同實體手機測試，同機兩個連線也不等同不同網路裝置驗收；未進行正式站壓測，沒有可承諾的同時在線人數。

PAYUNi 三個固定金額的一頁收款頁已建立，正式網址補件已送出；商店與付款頁仍在審核，網站收款開關保持關閉。程式已替換為 PAYUNi 專用連結驗證，開放前需完成[收款驗收](support-and-indie-pilot.md)。付款由 PAYUNi 託管，不增加 Worker 付款訂單或資料庫。

## 本機驗證

```powershell
npm ci
npm run check
npm run cloud:bundle
npm run cloud:smoke
# 可選：額外請求即時 Steam，受當時上游狀態影響
npm run cloud:smoke -- --steam
```

`cloud:smoke` 透過 Wrangler Test Harness 在真正的本機 workerd 執行環境驗證無登入入口、資產、房間權限、休眠恢復和跨物件共用限額。測試資料不會寫入正式 Cloudflare。它不等同 Cloudflare 線上 CPU、額度或網路驗收；不保證上游持續可用。

預覽：複製 `.dev.vars.example` 為 `.dev.vars`，保持本機 `APP_ORIGIN`，執行 `npm run cloud:dev`，開啟 `http://127.0.0.1:4174/` 即可。沒有邀請碼或簽章密鑰設定步驟；舊的這類環境變數不再被雲端入口讀取。`.dev.vars` 及 `.wrangler` 已排除 Git。勿公開本機連接埠。

## 第一次部署

1. 在 Cloudflare 帳號確認 **Workers Free**，不要升級付費方案。執行 `npx wrangler login` 登入自己的帳號。
2. 確認帳號的 workers.dev 子網域，將 `wrangler.jsonc` 的 `APP_ORIGIN` 改成實際網址，例如 `https://playcision.你的子網域.workers.dev`。只填 origin，不加結尾斜線；自訂網域也必須與這個值一致。
3. 網頁不需要登入金鑰。房間成員憑證由玩家建立／加入房間時產生，仍用於房間權限驗證。
4. `npm run check`、`npm run cloud:bundle`、`npm run cloud:smoke`、`npm run cloud:deploy`。部署命令會檢查 HTTPS 網址與檔案；網址或必要 binding 未設定時回 503。
5. 使用實際 HTTPS 網址檢查下列事項後，再公開分享。

## 外網驗收

- 新瀏覽器直接開啟首頁，圖片、字型、篩選均可使用，不顯示邀請碼。一般遊戲 API 不需 Cookie；房間 API 仍驗證成員憑證。
- 內容雜湊 JS／CSS／字型回應 `private, max-age=31536000, immutable`；首頁與 API 維持 `no-store`。更新後檔名改變，瀏覽器取得新版；錯誤回應不套用長期快取。
- 探索、推薦、Steam 活動、評論、介紹與排除 AI 正常；快速滑動、切頁不崩潰。
- 在分享頁排除管理恢復一款遊戲，重整後仍恢復；收藏不被清除。
- 至少兩台不同網路的裝置加入一桌；準備、開始、出牌、投票與結果推送正常。開始前看不到別人的票或 token。
- 刷新頁面可恢復座位；短暫斷線可重連；建立十分鐘後不可再存取，儲存由 alarm 清理。平台 alarm 可延遲，不能宣稱實體刪除精確到秒。
- 手機 Safari／Chrome 真機確認無橫向溢出、遮擋按鈕或捲動卡死。
- Cloudflare Metrics 檢查 CPU 超限、錯誤、DO 儲存讀寫及請求量；本機成功不代表已通過線上 Free 的 CPU 限制。

## 免費額度及保護

官方文件在 2026-10-28 查核：Workers Free 每日 100,000 次動態請求、每次 10ms CPU；SQLite DO 每日 100,000 次請求、13,000 GB-s、100,000 列寫入及 5GB 儲存。這是帳號平台額度，**不是同時在線人數**，也可能受帳號其他應用程式共用影響。來源：[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)。Steam 解析放在 DO，Worker 只處理入口、驗證與轉送；DO 的執行時間仍消耗自己的額度。

程式設定的保護上限（`cloud/coordinator.ts`）如下；這些不是壓測容量：

| 項目 | 全站每分鐘 | 全站每日 UTC |
| --- | ---: | ---: |
| API | 2,400 | 10,000 |
| 房間寫入 | 600 | 3,000 |
| 建立房間 | 12 | 300 |
| WebSocket 升級 | 120 | 2,000 |
| Steam 上游請求 | 120 | 3,000 |

單一共用協調物件將配額與最多 100 間活躍房間的索引持久保存；程序換新不會清零。API 讀取及 Steam 出站改為小批持久預留後在記憶體消耗，每分鐘從一筆起步，最高每批 16／8 筆；換分鐘或重啟不退回未使用的預留額，上限維持保守有效。房間操作仍逐次記錄。不存在的房間不配置新 DO。每間房最多四人、八條連線、每人兩條；單間每分鐘最多 90 次寫入。超量回 429；上游失敗回可重試錯誤，AI 聲明失敗保留未知狀態。程式不會自動開啟付費方案。

核心遊戲查詢有兩個執行席、32 個等待席及等待期限，最多 48 筆／16MiB 的五分鐘快取。首頁 digest 使用獨立的一個執行席、八個等待席、一筆／2MiB 快取，與探索共用底層候選頁。封面、評論、AI 與活動解析各有有界快取／佇列；核心查詢、附加資料、AI 出站各使用獨立受限通道，避免封面預載阻塞探索。Steam 429 會讓各出站通道共用至少 60 秒、尊重 Retry-After 的冷卻期，避免其他通道繼續重試；有效快取仍可讀取。Steam 出站只限兩個官方 HTTPS 主機，保留最小間隔、有限重試及回應大小。收藏和排除不送入這些共用快取。

惡意流量仍可能耗盡免費平台額度或全站保護額度，使當日服務不可用。應用程式限額不能替代 Cloudflare 的流量防護；正式公開前根據實際帳號的 Security/Rate Limiting 功能設定入口保護。不要把此版本宣稱為已抗住 DDoS。

## 儲存、記錄、回滾

瀏覽器 localStorage 保存收藏、資料夾、排除與 AI 偏好；sessionStorage 保存房間身分。雲端只保存房間的暱稱、匿名 token、候選與投票十分鐘，以及單一協調物件中有界的當日計數與短期房間索引；沒有使用者帳號、行為追蹤或完整遊戲庫。

已驗證的閒置 WebSocket 可休眠；階段與到期使用 alarm。房間到期後 `deleteAll()`，空房提前刪除。協調物件在日界與房間到期時整理索引，不保存 IP 或會員 token。平台仍可能有自己的請求記錄與備份政策，不能承諾 Cloudflare 不保留任何服務資料。應用程式 observability 和 Wrangler 使用量回傳預設關閉。

更新前記下 `npx wrangler deployments list` 的版本。問題版本用 `npx wrangler rollback <version-id>` 回退；勿回滾不相容的 DO migration。需要暫停公開存取時，在 Cloudflare 關閉公開入口或部署維護回應。回滾後重跑外網驗收；網頁不再使用登入 Cookie 或邀請碼。

收款未在此路線啟用，留待下一輪。

正式站的 Steam 失敗回應保留簡短文案，另外提供固定 `code` 與上游 HTTP `upstreamStatus` 供診斷；不回傳原始內容、Cookie、授權標頭、完整 URL 或堆疊。
