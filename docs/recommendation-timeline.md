# 推薦路徑

電腦版持續向下捲動，視角會沿不交叉的方形螺旋路徑前進，依序轉向右、下、左、上；遊戲封面本身不旋轉。轉彎前後平滑減速與加速。向上捲輪可回看前面的遊戲，收藏保留在父層，不受卡片卸載影響。

## 渲染與效能邊界

- 動畫區只掛載目前索引前後各四張，最多九張卡片；SVG 只畫附近路段。遠處卡片及圖片元件會卸載。
- 同一份候選清單使用固定長度的捲動行程，每款間隔 1,000 CSS px；繼續滾動不會追加資料或增加 DOM。這個 CSS 捲動高度不代表一張同等尺寸的圖片或畫布。
- 使用一個 GSAP ScrollTrigger 與一個視角物件，逐幀只修改場景 transform；跨遊戲索引才更新 React 虛擬視窗。
- 不是无限資料來源：抵達當次候選清單尾端即結束。未新增後端分頁請求或複製遊戲來假裝無限。
- 減少動態效果與手機窄畫面改用一般列表，不使用多方向鏡頭。離開推薦時清理 ScrollTrigger 和 ResizeObserver。
- 圖片使用既有 Artwork 快取機制；上述上限是 DOM 卡片數，不是瀏覽器總記憶體保證。

## 封面預載與節奏

捲動距離從每款 400 調整為 1,000 CSS px，相同捲動距離的推進量為原本 40%。動畫追隨緩衝為 0.8 秒。預載依瀏覽方向準備前方七款、反方向兩款與當前遊戲；背景排程最多兩個工作，更新視窗會替換尚未開始的工作。全站封面管線最多四個並行工作，眼前圖片可插隊尚未開始的預載。已開始的工作會正常完成。

已解碼快取維持 24 張 LRU；進行中的請求獨立去重，不會因 LRU 淘汰而重複請求。載入及解碼完成才顯示圖片，不先放大模糊縮圖。這些措施無法保證慢網路或 Steam 圖片失效時立即顯示。

## 驗證

路徑測試驗證四向移動、位置不重疊、轉角連續、邊界限制及最多九張的視窗。實際瀏覽器連續捲動確認向下、向左、向上轉向；前段與後段掛載上限不變、頁面高度不變。尚未做長時間記憶體或低階硬體效能量測。

## 元件與樣式

- 共用元件：`src/web/components/ui/timeline.tsx`
- 元件樣式：`src/web/components/ui/timeline.css`
- 業務介面：`src/web/consumer/ConsumerPreview.tsx`
- 既有全域樣式：`src/web/styles.css`

此專案已有 React、TypeScript、Vite，尚未初始化 shadcn 或 Tailwind。這次已安裝 GSAP，沿用既有 CSS。`src/web` 是前端來源根目錄，因此在其下建立 `components/ui`，將可重用介面與遊戲業務邏輯分開，不需在儲存庫根目錄另建一份。

元件改寫自使用者提供的 Hyperiux 範例，將範例年份與辦公室照片替換為真實遊戲。使用 ScrollTrigger 及 matchMedia 管理捲動與清理；沒有使用 SplitText，避免拆分遊戲名稱。

## 若後續要使用 shadcn / Tailwind

目前元件不需要以下步驟。若要接入其他依賴 Tailwind 的 shadcn 元件，可依[官方 Vite 安裝說明](https://ui.shadcn.com/docs/installation/vite)進行：

1. 執行 `npm install tailwindcss @tailwindcss/vite`。
2. 在 `vite.config.ts` 加入 `import tailwindcss from '@tailwindcss/vite'`，將外掛改為 `[react(), tailwindcss()]`，保留其他設定。
3. 在全域 CSS 加入 `@import "tailwindcss";`。導入會影響基礎樣式，需檢查既有按鈕、表單與各頁版面。
4. 在根 `tsconfig.json` 的 `compilerOptions` 設 `baseUrl: "."`、`paths: { "@/*": ["src/web/*"] }`，網頁 tsconfig 會繼承。Vite 的 `resolve.alias` 加入 `'@': fileURLToPath(new URL('./src/web', import.meta.url))`，保留既有 `@web`。
5. 執行 `npx shadcn@latest init`，設定 CSS 為 `src/web/styles.css`，components 為 `@/components`、ui 為 `@/components/ui`、utils 為 `@/lib/utils`。不要覆蓋已完成的 timeline。
6. 執行 `npm run check` 並檢查桌面與手機版面。

動畫生命週期參考：[GSAP matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia())、[ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)。



