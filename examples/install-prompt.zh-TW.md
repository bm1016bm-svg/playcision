# Agent 安裝提示範例

把下面這段交給 Codex、Claude Code 或其他可操作本機專案的 coding agent：

> 在目前專案安裝並初始化 Playcision。我在台灣，使用 TWD 與繁體中文；想看 Steam 過去七天新品、成人內容、Roguelike，以及我明列的願望清單 App ID 中低於 NT$300 或折扣至少 20% 的遊戲。每天 Asia/Taipei 上午九點產生 Markdown 並傳到 Slack。請先顯示設定 diff，不要把 Slack webhook 寫進檔案；用環境變數 `SLACK_WEBHOOK_URL`。完成後執行 `playcision doctor` 與一次不送通知的 dry run。

Agent 應該：

1. 先確認目前是原始碼安裝還是已發布套件；不要假設 npm 已有套件。
2. 執行初始化，再用 [`config.tw.yaml`](config.tw.yaml) 對照實際 schema。
3. 要求使用者在本機 shell 或 GitHub Actions secret 中設定 webhook；不讀取或回顯值。
4. 顯示將建立的本機排程／workflow，但不在未確認時註冊 OS 任務或推送遠端。
5. 說明 Steam Store adapter、local-observed-low、cache 與 Slack 的限制。
