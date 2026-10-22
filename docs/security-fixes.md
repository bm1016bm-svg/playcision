# 上線前安全修正

- 房間 token 使用一致的 UUID 驗證；交易在發布至記憶體／磁碟前驗證完整快照。有效房間、加入、投票及重啟恢復維持原行為；舊損壞資料的隔離規則見 [房間說明](rooms.md)。
- 所有本機 HTTP 路由在登入、API、靜態內容及 Vite 之前檢查 Host 與實際連接埠，拒絕未知網域。允許 localhost、loopback、連線目的 IP，以及明確設定的 `--host` 名稱。使用 `--host 0.0.0.0` 分享區網時請用主機 IP；內測反向代理須保留 `PUBLIC_ORIGIN` 的 Host。容器 loopback 健康檢查仍可使用 `/healthz`。
- Steam 回應依實際串流 bytes 計數，超過既有 `maxResponseBytes` 立即取消；不只依賴 Content-Length。所有 Steam endpoint 共用此限制。
- Steam／Slack 單次重試等待最多 5 秒；較長的有效 Retry-After 會回報稍後重試，不會提早重送。整個 HTTP 重試週期（含等待）不得超過 `timeoutMs × (retries + 1)`。Slack 模糊網路失敗仍不自動重送。
- CLI 的外部顯示欄位在著色前把終端控制碼轉為可見文字；Unicode、正常版面與應用程式顏色維持。JSON、Markdown 及 Slack 輸出合約不變。
- 備用 Worker 公開入口固定停用；Node 內測房間繼續運作。

驗證：`npm run check`，包含 `tests/security-regressions.test.ts` 的惡意輸入與正常流程控制測試。此修正不代表已完成正式環境滲透測試、雲端配置驗證或最新依賴漏洞公告檢查。
