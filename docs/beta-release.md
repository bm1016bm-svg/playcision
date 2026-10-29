# 內測版交付與部署

本文件保留一台主機、一個 Node 程序的邀請制內測部署，請勿開多個 app 副本。若使用免費 Cloudflare，改依 [Cloudflare 免費部署](cloudflare-release.md)，不需租主機或 Docker。兩條路線均讓網站、Steam API 與房間使用同一個網域，不需設定 `VITE_ROOM_API`。

## 檔案入口

- `Dockerfile`：建置時執行完整測試，正式映像不含開發依賴，以非 root 使用者執行。
- `compose.yaml`：網站與 Caddy，持久資料 volume、資源上限、健康檢查與日誌大小限制。
- `deploy/Caddyfile`：HTTPS 及反向代理，不記錄含房間代碼的存取日誌。
- `.env.example`：網域、邀請碼、簽章密鑰；沒有預填可用密碼。
- `npm run start:beta`：與原本個人 CLI 設定分開的正式入口。
- `npm run beta:preflight`：檢查環境與資料設定，不開伺服器。
- `npm run beta:smoke`：使用獨立臨時資料，測試真實 HTTP、邀請碼、房間重啟恢復，再清除測試資料。

## 下一輪部署步驟

1. 準備可執行 Docker Compose 的 Linux 主機及自己的網域。免費主機是否支援常駐程序、持久磁碟及不休眠，必須逐項確認；本文件不承諾免費方案可用。
2. DNS 指向主機，僅開放 80/443；不要公開 4174。
3. 將 `.env.example` 複製為 `.env`，填寫 `DOMAIN`（不含協定）。各執行一次 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`，分別填入不同的 `BETA_INVITE_CODE`、`SESSION_SECRET`。勿提交或截圖分享密鑰。
4. `docker compose config --quiet`，再 `docker compose build`。
5. `docker compose run --rm app node scripts/start-beta.mjs --preflight`。
6. `docker compose up -d`，執行 `docker compose ps` 與 `docker compose logs --tail=50 app`。
7. 用外部裝置確認 HTTPS、未登入 API 被拒絕、輸入邀請碼後能探索；再照 [內測驗收表](beta-acceptance.md) 做跨網路房間測試。

只有上述外網驗收完成，才發出第一批邀請。正式 cookie 在 HTTPS 下具有 Secure、HttpOnly、SameSite=Lax，七天到期；房間 Bearer 身分不受登入入口干擾。輪換 SESSION_SECRET 並重建 app 會讓既有登入失效；只改邀請碼不會登出已登入的人。

## 資料與限制

| 資料 | 位置／期限 | 限制 |
| --- | --- | --- |
| 收藏 | 使用者瀏覽器 localStorage | 最多 500 款，不跨裝置同步；失敗會顯示未保存警告 |
| 排除／略過 | 使用者瀏覽器 localStorage | 最多 2,000 筆；略過七天；分享頁可恢復 |
| 房間 | `/data/.playcision/rooms.json` | 最多 100 間、每間四人；建立 10 分鐘後到期，操作不續期；運行中每分鐘清理已載入的房間資料 |
| 房間身分 | 瀏覽器 sessionStorage | 同一分頁重新整理可恢復；新裝置不繼承座位 |
| 遊戲資料 | 伺服器記憶體快取 | 五分鐘快取，不寫入遊戲資料庫；Steam 上游失敗會回報 |

房間寫入採單程序交易佇列與原子替換，寫入成功才回應；磁碟故障不應宣告成功。程序停機期間到期資料會留在磁碟，恢復並存取房間後清理。不要將此宣稱為即時跨區備援。

內測限制是保護措施，**不是測得的容量**：全站 API 每分鐘 2,400 次、寫入 600 次；每個房間 token 每分鐘 90 次寫入；全站每分鐘最多建立 12 間房間、20 次登入嘗試。metadata 各佇列最多 16 個等待／執行工作。超量會拒絕或請稍後重試，需依真實內測觀察調整。

上游 Steam 搜尋、Browse、appdetails 部分依賴未公開穩定契約；不可承諾完整商店涵蓋率。價格與評論可能延遲，以 Steam 原頁面為準。未加入付款、分析追蹤或帳號同步。

## 維運與回復

- `/healthz` 只確認 Node 程序有回應，不代表 Steam 正常或磁碟可寫。檢查房間建立、資料載入與磁碟空間仍是必要驗收。
- 保留上一版映像：更新前用 `docker compose images` 記下 app image ID，`docker image tag <ID> playcision-beta:previous`。不要先清掉舊映像。
- 回滾：建立本機 `compose.rollback.yaml`，內容為 `services: { app: { image: 'playcision-beta:previous' } }`；執行 `docker compose -f compose.yaml -f compose.rollback.yaml up -d --no-build app`。沿用原資料 volume。回滾前確認資料格式相容。
- 暫停邀請或維護：`docker compose stop app`；不要使用 `down -v`，該命令會刪除持久資料。
- 房間只保存短期資料。損壞資料復原時會保留隔離檔，其中可能包含 token；目前須由管理者限制存取並清理，不能把房間 10 分鐘到期當成隔離備份也已刪除。
- 設定與密鑰另存於受控密碼管理器；程式碼、鎖定檔及上一版映像用來重建。收藏由使用者複製分享清單備份。
- 這個版本沒有自動通知服務；內測管理者需查看健康狀態與使用者回報。Docker restart policy 會處理程序退出，不會自動重啟僅 unhealthy 的容器。

官方依據：[Docker Compose services](https://docs.docker.com/reference/compose-file/services/)、[Caddy 自動 HTTPS](https://caddyserver.com/docs/automatic-https)、[Caddy 環境變數](https://caddyserver.com/docs/caddyfile/concepts#environment-variables)。
