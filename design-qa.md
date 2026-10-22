# Consumer production UI — 2026-09-18

Current implementation: `/` (also `/?consumer=1`). Previous screenshots and the older fixed-canvas QA below are historical, not evidence of this revision.

## Verified in the local browser

- Real Steam runtime data and artwork; no seeded mock catalog or generated art.
- 320 × 568: removed the inherited 320px minimum-width rule; measured document clientWidth and scrollWidth both 305px with a scrollbar, and verified reachable decisions after scrolling.
- 390 × 844 and 375 × 812 portrait: main card, complete image frame, primary decisions, dock; no horizontal overflow.
- 1280 × 720 desktop: short-height two-column card; measured primary-action bottom at 584.12px and dock top at 629.28px, with no horizontal overflow.
- 1440 × 1000 desktop: bounded card and controls with responsive surrounding space.
- 844 × 390 landscape: two-column card, vertical scrolling and in-flow navigation; no horizontal overflow or fixed dock hiding controls.
- Save button advances the pool and updates the session collection. Undo restores the previous card and collection count.
- Real pointer right drag saves; left drag skips. Short horizontal movement keeps the card and returns its transform to `none`.
- Free filter applies to the real candidate pool. Empty pool offers reset; reset preserves the collection.
- Detail opens with Enter. Shift+Tab from its close control wraps to the last action; Escape closes it. Background controls are excluded while the dialog is open.
- Session collection renders actual images/prices. Steam page links to the client library and store; no owned-game data is claimed.
- Long tag lists were replaced by one labeled native genre select; all source values remain selectable.
- Missing metadata is omitted instead of showing repeated unavailable-data filler. Source contract notes are collapsed on the Steam page.

## Code and automated verification

- Final CSS overflow correction also passed `npm run build:web`.
- `npm run check` passed: TypeScript, 13 test files / 73 tests, CLI build and Vite production build (2026-09-18).
- Production server at `http://127.0.0.1:4174/` loaded actual Steam data and self-hosted fonts. Browser error/warning log was empty during that load.
- Calculated WCAG contrast for the opaque card palette: secondary text `#C2D1DF` on `#243544` = 8.08:1; primary text = 11.80:1; dark Save text on lime = 11.34:1. These are token calculations, not measurements of every translucent background.

- Persistent preference IDs are projected from the existing state into the UI payload. Expired skips are excluded from that projection; no catalog, price history or notification state is exposed.
- Tests cover directional distance/velocity decisions, vertical gestures, short jitter, TWD/free/missing-price filtering, platform/player evidence, seeded-reason attribution and preference expiry/deduplication.
- Reduced motion is implemented with MotionConfig, useReducedMotion and CSS fallbacks. Reduced transparency/increased contrast use opaque fills. These OS media settings were code-reviewed, not toggled in this browser session.
- Steam-client launch links were inspected but not activated during QA. No persistent user preference was changed for browser testing.

## Visual references

User references supplied on 2026-09-18: compact selected-state navigation and Liquid Glass controls. Their operating-system decorations, sample text and mock metadata are not reproduced.

The browser screenshot service scales the rendered viewport within its image output on this Windows display. Layout assertions use DOM CSS-pixel measurements, not apparent screenshot pixel size.

---

## Historical QA (before this revision)

# Playcision consumer mobile UI — design QA

- final result: passed
- source visual truth: `C:\Users\Administrator\Desktop\codex\github\playcision\artifacts\consumer-ui-brief.md`
- contrast reference: `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-46cff589-9934-4ad6-abfa-b8a7a10fe548.png`
- implementation URL: `http://127.0.0.1:4173/?consumer=1`
- implementation screenshot: `C:\Users\Administrator\Desktop\codex\github\playcision\artifacts\consumer-preview-390x844-pass2.png`
- focused main-state screenshot: `C:\Users\Administrator\Desktop\codex\github\playcision\artifacts\consumer-preview-focused-pass2.png`
- focused detail state: `C:\Users\Administrator\Desktop\codex\github\playcision\artifacts\consumer-detail-state-focused.png`
- focused filter state: `C:\Users\Administrator\Desktop\codex\github\playcision\artifacts\consumer-filter-state-focused.png`
- combined comparison: `C:\Users\Administrator\Desktop\codex\github\playcision\artifacts\consumer-ui-comparison-pass2.png`
- state: dark theme, live Steam candidate pool, default discover tab

## Evidence normalization

- Source contrast image: 913 × 1665 px. It includes a phone frame and is used only to verify that the new direction removes the previous presentation and cyberpunk language.
- Implementation CSS target: 390 × 844 px. Measured in the in-app Browser at 389.994 × 843.998 CSS px; device pixel ratio 1.635.
- Browser full-page output scaled rendered content by `1 / 1.635`; the 239 × 516 px app crop was normalized to 390 × 844 px with bicubic resampling for full-view comparison.
- Focused typography/image evidence was captured from the unscaled viewport at 390 × 720 px so text and artwork could be judged without the full-page density artifact.
- The live candidate differs from the contrast reference by design. Content accuracy was checked against the current payload, not frozen mock data.

## Full-view comparison

- The combined comparison places the prior framed screen and the new implementation together at a common 844 px height.
- The implementation is now an app-only canvas: no device shell, design board, logo strip, slogan, `ROLL MODE`, `WEIGHTED`, App ID, release date, or permanent swipe instruction.
- The hierarchy reads cover/title first, review availability and price second, then tags and recommendation reason.

## Focused region comparison

- Main card focus verifies the 16:9 contained Steam capsule, 25 px game title, honest review-unavailable copy, single discount treatment, three-tag maximum, restrained one-line recommendation reason, and one 1 px card border.
- Detail focus verifies a bottom drawer rather than a dialog card, full-width 16:9 art, readable metadata, and two clear actions.
- Filter focus verifies functional groups for platform, price, genre, and player count with one selected-state treatment and 44 px minimum controls.

## Required fidelity surfaces

- Fonts and typography: local IBM Plex Sans is used with SF Pro, Noto Sans TC, Microsoft JhengHei, and system fallbacks. Page title is 26 px, game title is 25 px, body text is 13–19 px, and support text does not fall below 12 px. No monospaced or wide-tracked system styling appears in this route.
- Spacing and layout rhythm: the app measures 390 × 844 CSS px. The decision card measures 357.999 × 529.998 CSS px, or 62.8% of screen height. Header/card and card/action gaps are about 19–27 px; spacing follows an 8 px-derived rhythm with an 18 px card radius and 14 px controls.
- Colors and tokens: background `#0D1011`, surface `#171B1D`, text `#F3F2EE`, muted `#929A9D`, save `#8FCDB2`, price `#D9AE61`, skip `#B86F67`. There are no gradients, glass blur, glow, neon, or metallic effects.
- Image quality: the current Steam image is loaded from the live provider and displayed with `object-fit: contain` in a true 16:9 frame, so it is not stretched or cropped. Phosphor icons are reused; there are no emoji, handcrafted SVGs, CSS illustrations, or fake game art.
- Copy and content: interface copy is functional Traditional Chinese. Candidate count, game title, price, discount, tags, platform, and store link come from the live payload. The provider does not expose review score/count, so the UI says they are unavailable instead of inventing values.

## Findings

- No actionable P0, P1, or P2 issue remains.
- Residual test gap: the in-app Browser coordinate drag helper did not cross Motion's decision threshold reliably. Left/right decision state was verified through the equivalent 54 px action controls, while the Motion drag implementation, directional labels, threshold, reduced tilt, and tap-after-drag guard were checked in code.

## Comparison history

1. Pass 1 — P2: the 470 px decision card used about 55.7% of the 844 px screen, leaving roughly 70 px of empty space above and below the card. This missed the requested 60–65% card proportion and weakened the content-first hierarchy. Evidence: `artifacts/consumer-preview-390x844.png` and `artifacts/consumer-ui-comparison.png`.
2. Fix: increased the tall-screen card stage to 540 px, yielding a 530 px visible card, and distributed the existing information vertically inside the card. The compact layout for viewports at or below 760 px remains unchanged.
3. Pass 2 — verified: card is 529.998 px tall (62.8% of 844 px), artwork remains 16:9, text stays above 12 px, and no large exterior blank block remains. Evidence: `artifacts/consumer-preview-390x844-pass2.png`, `artifacts/consumer-preview-focused-pass2.png`, and `artifacts/consumer-ui-comparison-pass2.png`.

## Functional and runtime checks

- Filter drawer opened; applying `NT$300 以下` changed the live pool from 32 to 27 candidates in that run.
- Saving the active game advanced the card and added a `1` badge to 收藏; the saved list was verified in the earlier interaction pass.
- Detail drawer opened and exposed price, discount, recommendation reason, platform, tags, save control, and the real Steam link.
- Browser console contained Vite/React development messages only; no warning or error was observed.
- `npm run check`: TypeScript passed, 13 test files passed, 67 tests passed, CLI build passed, and web build passed.

## Implementation checklist

- [x] 390 × 844 app-only canvas
- [x] Mature restrained dark theme without glass/cyberpunk effects
- [x] 62.8% decision card with complete 16:9 artwork
- [x] Live data and honest unavailable-review state
- [x] Skip/details/save actions and saved state
- [x] Functional filter and detail bottom sheets
- [x] Three-tab bottom navigation
- [x] Reduced-motion and touch-target rules
- [x] Full typecheck, tests, production build, and browser QA


## 2026-09-18 — Steam synopsis, artwork and glass refinement

- Local Geist + Noto Sans TC variable fonts, including redistribution licenses.
- Glass uses translucent fills, backdrop blur/saturation, directional edge reflections and restrained shadows. Reduced-transparency/high-contrast fallback is implemented; native iOS optical rendering is not claimed.
- Separate, lazy Steam presentation endpoint: localized plain-text short_description and explicit StoreBrowse main_capsule_2x assets. No guessed CDN filenames, generated artwork or changes to pool/price/seed data. Requests are serialized through provider throttling; memory cache is bounded to 64 entries with five-minute server expiry.
- Card synopsis is limited to three lines; details exposes the full source text. Missing synopsis stays absent.
- Dock is in document flow so longer game names and descriptions cannot be covered by navigation.
- Required check: 14 test files / 78 tests passed, TypeScript and production builds passed. Tests include localized synopsis, HTML stripping, missing/malformed responses, unsafe image URLs and explicit high-resolution asset mapping.
- CSS references: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter ; material direction: https://developer.apple.com/design/human-interface-guidelines/materials .

## 2026-09-18 — Simplified navigation and saved picker

Removed the discovery slogan and source toolbar. Source is now a draft field in the top-right filter sheet and applies atomically with the other filters; refresh remains available inside the sheet. Content cards have a solid dark fill with one thin border; glass remains concentrated on controls/navigation, with reduced background color wash and unframed active tabs.

Added an actionable, non-modal saved toast with a resettable 4.5-second timeout, paused on hover/focus. The saved picker is deterministic for seed + saved IDs + reroll counter, handles empty/single collections, and links the selected real game to Steam. UI-language mapping and per-language presentation cache preserve official localized text and retain source text if Steam has no localization.

Required verification: npm run check passed, 14 files / 81 tests; includes empty/single saved pools, deterministic reordering, seed-based variation and language fallback mapping.
- Browser verification: actionable toast opened the saved list while the next card advanced; picker selected a real saved game and exposed its canonical Steam URL; source filter applied the deals pool; a real Traditional Chinese synopsis was displayed for Cave Escape. Mobile layout had no horizontal overflow and decision buttons remained above navigation. Browser error/warning log was empty. Final filter application also returns to exploration; typecheck and web build passed after that adjustment.

## 2026-09-20 — Owner-supplied logo integration

- Cropped the supplied English wordmark for the consumer header; bilingual lockup appears during loading and in both READMEs. Original lettering retained with dark matte removed.
- Cropped the supplied app tile for 180/192/512px shortcut icons and a tighter central symbol for favicon PNG/ICO. No additional glass frame or generated replacement artwork.
- Added icon/manifest links and PNG/webmanifest MIME types. This supplies shortcut branding, not offline functionality.
- npm run check: 14 files / 81 tests passed; TypeScript and production builds passed.
- Browser verified the bilingual loading screen and header wordmark. At the 390×844 QA viewport the wordmark loaded at approximately 166×36.6 CSS pixels with no horizontal overflow. All eight requested brand/manifest URLs returned HTTP 200 with the correct MIME types. Home-screen installation was not tested on a physical phone.

## 2026-09-20 — Deck counter, navigation and next-card reveal

- Removed the source caption above the card. Centered the requested “該輪次品類剩餘” label with a larger tabular numeral.
- Removed the navigation container and active-tab boxes. Navigation now follows the decision buttons with a compact gap instead of automatic bottom alignment.
- Moved the genre selector to the first field. Traditional Chinese display mappings also apply to card/detail tags; original Steam filter values and unknown tags are preserved.
- Removed the next-card clipping mask and rendered the actual next game's art/title/price beneath the draggable card. The preview is aria-hidden and pointer-inert; existing swipe threshold, spring return and reduced-motion behavior remain intact.
- npm run check passed: 15 files / 83 tests, typechecking and production build.
- Browser validation: right swipe advanced from Wreckcore to the actual pre-rendered next game, BABU - Blow All Blocks Up!, and decremented the remaining count. Navigation gap measured approximately 14 CSS px; next-card clipping is removed. Filter accessibility order starts with the translated genre selector. Added mappings for the additional English labels observed in the live pool; unknown future tags remain intact rather than receiving guessed classifications.

## 2026-09-20 — Default Steam top sellers

Added SteamProvider.getPopular using the existing bounded search transport with filter=topsellers and category1=998, without Released_DESC, interest-tag subqueries or tracked-ID injection. UI digest carries a separate popular list; existing CLI digest/roll semantics remain unchanged. Consumer source defaults/resets to popular and retains chart order, persistent exclusions/skips and UI filters. A chart failure is explicit and does not silently substitute new releases.

npm run check passed: 15 files, 85 tests, TypeScript and production builds. New provider tests verify chart request parameters/order and failure behavior. Source: https://store.steampowered.com/search/?filter=topsellers&category1=998 (checked 2026-09-20).

## 2026-09-22：動態背景

- 新增 CSS 藍綠雙光帶，緩慢 transform 移動，柔化邊緣；卡片維持實色。無新增視覺素材或 Three.js 依賴。
- 裝飾層 aria-hidden、pointer-events: none；visibilitychange 暫停背景分頁動畫，元件卸載移除監聽。
- reduced-motion 改靜態，高對比／減少透明度隱藏裝飾（程式碼檢查，未切換實機系統設定）。
- 瀏覽器驗證桌面與 390×844 版面、無水平溢出、雙動畫 running、無 console error。手機 viewport 已還原。
- npm run check 通過：15 個測試檔、85 項測試及型別／完整建置；最後僅柔化 CSS 後 build:web 再次通過。

## 2026-09-22：鍵盤便捷操作

- 保留既有左右鍵決策，新增 repeat、isComposing、defaultPrevented 防誤觸，按鈕提供 title 與 aria-keyshortcuts。
- 實際點擊候選數後，左鍵略過 PUBG、右鍵收藏 WARDOGS，卡片推進及收藏提示正常。Backspace 兩次還原測試；篩選開啟時右鍵未改變候選與收藏。
- npm run check：型別、85 項測試及建置通過。長按／輸入法保護以程式碼檢查，未做實機長按驗證。

## 2026-09-22：高清圖片預載與解碼快取

- 根因：Artwork 在 presentation 尚未就緒時直接顯示搜尋縮圖；重新掛載亦重走同一路徑。
- 改為下載／decode 完成才交給 img，共用 24 筆 LRU 記憶體快取；目前及後兩張預載，語言／App ID／備援 URL 隔離，失敗依序備援，全部失敗可重試，卸載不寫回元件。
- npm run check 通過：16 個測試檔、90 項測試，含 5 項新快取測試。
- 瀏覽器檢查 PUBG → WARDOGS → 伊莫，切卡後均為載入完成的 1232px 寬 Steam 高清資產；復原後同樣重用高清圖。無 console error。
- 未模擬限速網路；預載趕不上時仍需等候底圖，不保證任意連續快速滑動都零等待。瀏覽器磁碟快取依 CDN 標頭，不自行永久儲存圖片。

## 2026-09-22：穩定卡片內容欄位

- 標題固定兩行、metadata 20px、價格 48px、標籤單行 18px、簡介三行 5.4em。簡介容器不依 API 回傳與否消失；詳情全文不受限制。
- 桌面 PUBG → WARDOGS 操作列 top 均為 864.029 CSS px；390×844 的 WARDOGS → 伊莫均為 664.029 CSS px（DOM boundingClientRect 觀測），無水平溢出。已還原操作及 viewport。
- npm run check 全部通過，16 個測試檔／90 項測試；本次純欄位排版以實際瀏覽器比對驗證。

## 2026-09-22：增加連續滑卡預載深度

- 目前及後六張預載，每輪兩個 worker；舊輪次 cleanup 後不再追加請求。既有 in-flight 請求完成並保留共用快取，不中斷正在使用的圖片。
- 保留 24 筆 LRU 上限。1232×706×4×24 ÷ 1024² = 79.6318 MiB 僅為 RGBA 像素記憶體估算，非量測、非整體記憶體上限；瀏覽器／GPU／其他尺寸資產另計。
- npm run check 通過：16 個測試檔、91 項測試。新增預載併發與舊輪次取消測試。
- Steam 官方評論介面可提供文字、推薦與否及 query_summary；本次只確認可行性，未加入評論 UI 或資料存取。官方文件：https://partner.steamgames.com/doc/store/getreviews

## 2026-09-22：Steam 評論與錯落輪播

- 卡片顯示獨立近期／使用者語言好評率與總數，開發商及發行商使用既有 Game 資料或 appdetails presentation；固定欄位保留。玻璃動作鈕與 thin 圖示細線導覽已更新。
- 官方 appreviews 取得真實文本與正負評；分開取最多六則正評／六則負評後交錯。真實回應證實僅 verdict 分頁的 query_summary 只有 num_reviews，因此 parser 對缺少總計的分頁不捏造統計。對不完整／不一致的 totals 仍拒絕。
- 最近評論來自實測 appreviewhistogram recent 每日 bucket，驗證日期連續、計數非負整數；使用實際 UTC 範圍，好評率用正負評總和驗算。非官方商店分類標籤，不宣稱與商店所有排除規則完全一致。
- 真實 PUBG API：12 則正負交錯、每則都有顯示名稱；未把玩家文字或名稱寫入測試 fixture。前端 React 純文字渲染。
- 桌面驗證右鍵由第一則好評切到第二則差評，拖曳再切第三則；背景決策未觸發，候選維持 50。驗證循環鄰卡、全部語言切換、空白區關閉與 Escape。
- 瀏覽器實際 CSS viewport 390×844 以及 355×767：無水平溢出，長評內部捲動，窄視窗可垂直捲動查看完整操作。已還原 viewport。
- npm run check：17 個測試檔、98 項測試通過。評論測試包括語言文本、缺少名稱、空資料、schema drift、非法 ID、統計驗算、近期失敗保留語言統計、交錯去重及查詢參數。
- 減少動態效果以程式碼檢查，未切換作業系統設定；未模擬 Steam 長時間中斷。近期與語言統計獨立缺值；留言失敗提供重試。

## 2026-10-11 — 收藏清單分享

- 收藏頁加入 Discord／Markdown／純文字格式、複製與可展開預覽；長 Discord 清單逐段複製。
- 使用正規 Steam App ID 產生公開連結；去重、跳過無效 ID、跳脫 Markdown、避免 Discord 名稱觸發 mentions。沒有外部發送或新增後端。
- npm run check 通過：18 個測試檔、103 項測試。新增 5 項涵蓋輸出格式、空集合、外部字串與分段完整性。
- 本機真實 Steam 資料：收藏《燕雲十六聲》後進入收藏頁；Discord 預覽包含正確 app/3564740/ 連結，按複製顯示成功提示。瀏覽器剪貼簿讀取未回傳文字，因此未獨立驗證作業系統剪貼簿內容或外部 Discord 貼上。已目視檢查目前視窗版面。
- 權限拒絕的手動複製回退有實作，未在此瀏覽器模擬拒絕。

## 2026-10-11 — 分享入口與收藏搖獎

- 分享控制項移至 Steam 頁，使用同一份 session 收藏；空清單提供探索入口。
- 收藏抽選沿用 pickSavedGame，一次點擊只計算一次結果；視覺輪播不參與隨機選擇。加入減速輪播、骰子晃動、單次柔和光效與有限彩帶；reduced-motion 直接揭曉。離頁清除 timeout。
- npm run check 通過（18 檔／103 測試）。瀏覽器以兩款真實收藏驗證：抽選時按鈕 disabled、揭曉 PUBG 並提供實際 Steam 連結；收藏頁無分享控制项，Steam 頁顯示收藏數 2 與三種分享格式。已檢視揭曉後版面。減少動態與離頁計時清理由程式檢視確認，未模擬系統偏好。

## 2026-10-11 — 全螢幕篩選

- 全螢幕不透明炭灰表面，類型字卡置頂、單選勾選、原始 Steam key 不變；補充目前資料中的中文類型名稱，中英搜尋只影響可見選项。來源、平台、價格、人數維持原規則。固定標題與底部操作，中間單一滾動區。
- npm run check：18 檔／103 測試通過。桌面目視確認全螢幕、字卡與底部操作。手機實測 CSS 355×767（瀏覽器縮放造成），無水平溢出，底部操作列位於視窗內。
- 實際搜尋「生存」、選取、套用後候選顯示 6 款，重開選取保留；清除回到全部類型。已重設測試視窗尺寸。

## 2026-10-11 — 分類子選單與成人篩選

- 類型整理為八組收合子選單；每個原始 key 僅出現一次，未知類型仍保留在其他特色。搜尋自動展開符合群組，選取摘要保留。
- 成人內容三態預設不限；依成人／裸露明確標籤，排除一般 mature、暴力、恐怖的誤判，僅作用於現有候選池。
- npm run check 通過 19 檔／106 測試。新增群組完整性、成人標籤及組合篩選測試。瀏覽器驗證展開動作與射擊、選射擊、選只看成人，清除回復不限；版面檢視通過。沒有宣稱已取得全 Steam 成人目錄。

## 2026-10-11 — 篩選取消與補充條件

移除全部類型按鈕，細類型再點取消；新增付費（需正數已知價格）與搶先體驗三態。npm run check 通過 19 檔／108 測試。瀏覽器驗證射擊 aria-pressed 由 true 變 false，全部類型按鈕不存在，兩項新條件存在；分類可再次收合。

## 2026-10-11 — 社群分享頁

第三頁更名分享、換 ShareNetwork 圖示，移除 Steam 宣傳面板。平台圖示取代下拉選單（Discord／Facebook／Instagram／TikTok／Markdown／純文字），選中亮色其餘低彩度；逐項勾選與全選，零選取禁用複製。Facebook／Instagram／TikTok 為文字輸出，不代表直接發布整合。

完整檢查通過（19 檔／108 測試）。瀏覽器以兩款收藏驗證：選 Facebook、取消燕雲十六聲，只輸出 PUBG 與 app/578080/ 公開網址；複製 API 成功提示可見。未在外部社群實際發布或貼上。

## 2026-10-11 — 分享頁視覺精簡

社群圖示移除底框，選中以淡綠與短底線標示。移除預覽按鈕及常駐文字區，改用現有已解碼 Steam 圖片、名稱與連結構成可勾選清單。只有 Clipboard API 失敗才開手動複製區。完整檢查通過 108 測試。瀏覽器目視確認無底框圖示、真實圖片、取消勾選淡化及成功複製提示；未向外部平台發送。

## 2026-10-11 — 背景節奏

青綠光帶單程 24→17 秒，藍色 30→23 秒；小幅提高光帶漸層透明度，維持中央遮罩、位移範圍、背景分頁暫停與 reduced-motion。npm run check 通過，108 測試。

## 2026-10-11 — 品牌入場

移除載入灰色骨架卡，以原 icon 播放三角形／銀色折線／雙箭頭為依據重新描繪 SVG 動畫，不修改原始圖檔。Motion 三角形成形與箭頭依序進場，減少動態直接顯示，資料就緒立即切換，無額外等待。npm run check 通過 108 測試。新預覽分頁觀察到三角形入場與自動轉入主頁，未刷新原使用者分頁；短載入使工具未捕捉完整箭頭階段。

## 2026-10-11 — Progress, primary actions and sharing selection
- Added real filtered-pool progress, pill tags and stronger next-card edge. Browser verified save advances 0 → 1 and undo returns 1 → 0.
- Saved/share primary buttons now use lime gradient fill with hover fluid backgrounds; reduced-motion disables animation.
- Saved totals sum normalized integer hundredths per currency, deduplicate games and explicitly exclude unknown prices. Unit coverage checks mixed currencies, decimals, duplicate IDs, free and unknown prices. Browser verified all-free summary.
- Removed raw URLs from share rows while preserving existing copied-link formatter. Custom check controls retain native keyboard semantics. Browser verified row click and Space toggle selection and empty selection disables copying. Fixed existing flex rule stretching custom checkbox; final desktop screenshot confirms compact checkmark.
- npm run check: 19 test files, 110 tests passed, typechecks and production build succeeded. No mobile visual pass or full hover animation capture in this iteration.

## 2026-10-11 — Languages, platform icons and recommendations
- Added a right-header language sheet with 13 native language names and Traditional Chinese as the fresh-session default. Main navigation, filters, saved/share actions and review summaries translate locally. Language changes key presentation/review requests by locale and retain session collections. Original Steam names/tags and some diagnostic/helper text are not fully localized.
- Language mapping tests cover all 13 UI choices, including Brazilian Portuguese, Thai and Vietnamese. Every dictionary entry has 12 nonempty target translations plus the Traditional Chinese source. Share headings are localized without changing canonical public URLs.
- Windows/macOS/Linux are icon-only with accessible names and native tooltips. Unknown platforms retain text.
- Added a simple recommendation list (popular pool first, other current candidates after, deduplicated and excluding blocked IDs), lazy thumbnails and a bottom-right save toggle. Same collection feeds saved/share. Undoing a skip no longer removes a game subsequently saved from recommendations.
- Browser verified default Traditional Chinese Explore, 13 language choices, switching to English UI and actual English Steam description/review scope, recommendation save reflected in Saved and Share, and mobile add/remove toggles. Desktop and 429px mobile screenshots inspected. Corrected navigation placement for long recommendation lists and mobile long-label wrapping. Reset viewport afterward.
- Final npm run check succeeded: 20 files / 113 tests, TypeScript and production build. Vite reports the existing single entry chunk now exceeds its 500kB advisory threshold; this is a build warning, not a failed check.

## 2026-10-11 — Horizontal recommendation shelves
- Replaced the sparse vertical recommendation list with popular/new/discount horizontal shelves; desktop shows five tiles, narrower layouts three, mobile reveals part of the next tile.
- Browser verified right/left shelf scrolling and favorite add/remove updating the shared navigation count. Mobile document scroll width equals client width (377 CSS pixels); screenshot shows the next tile without page overflow.
- Inspected six loaded recommendation images: each has natural dimensions 1232 x 706. Artwork is decoded through the existing bounded cache and activated near the viewport.
- Measured both Explore review rows: label, rating and count columns have identical left/right edges. Fixed price row height override allows proper vertical alignment.
- npm run check succeeded: 20 files / 113 tests, TypeScript and production build. Existing chunk-size advisory remains.

## 2026-10-11 — Tonight Together rooms, first version
- Added the room inside Share with no new bottom navigation destination. Graphite surfaces, restrained off-white controls, thin rules, tabular countdown and muted selected states; reduced-motion disables deal animation.
- Shared pure state engine: 2–4 ready members, host starts, 40s proposal / 20s vote, two proposals per member, duplicate merging, withdrawal, multi-select private voting and public results. Ties remain explicit, no-vote rounds have no winner. Sequential public member IDs do not expose bearer credentials.
- Node preview adapter stores ephemeral server-side rooms; Cloudflare Durable Object adapter persists them and expires after two hours. Cloud deployment configuration supplied, NOT deployed. First version uses 1s HTTP polling, not WebSocket. Session storage contains only the anonymous member token.
- Browser: two independent tabs joined, prepared and submitted distinct cards; server state synchronized. Refreshed tab recovered its seat and finished result. Found and fixed primary-button hover contrast and removed the empty-share neon CTA. Found a failing hard-coded Steam header URL; room covers now use existing decoded presentation artwork.
- Live HTTP two-client test ran real 60s round: unauthorized read rejected, duplicate proposals merged, both votes accepted and private during voting, both clients received same unanimous winner and 2 votes after reveal; late vote rejected.
- npm run check passed (21 test files / 120 tests), including cloud adapter typecheck. Cloud endpoint, public cross-device use and abuse defenses are not production-validated; see docs/rooms.md.
- Final mobile screenshot checked at 415 CSS pixels: no horizontal page overflow, both room covers decoded at 1232 x 706, seats form a two-column grid. Fixed create-room button text wrapping on desktop. Reset viewport and retained Share room entry preview.

## 2026-10-11 — Share hierarchy cleanup
- Restored sharing platforms, collection selection and copy action above Tonight Together.
- Removed the room introduction, 40/20-second slogan strip, English kicker, retention/deployment note and Share data-source accordion. Technical deployment/retention details remain in docs/rooms.md.
- Removed room top/bottom dividers, toolbar/seat decorative lines and final collection-row line above Copy. Reduced room heading to secondary scale and separated sections using spacing.
- npm run check passed: 21 files / 120 tests, types and production build.

## 2026-10-11 — LINE share and room introduction
- Replaced the plain-text platform with LINE and a code-native outlined speech-bubble LINE icon. LINE copies game names and canonical Steam URLs through the existing plain-text formatter; Markdown is the last platform.
- Room remains below sharing; increased separation to 88px desktop / 64px mobile and added one sentence: 邀朋友一起出牌，選出今晚都想玩的遊戲。 No technical or timing slogans reintroduced.
- npm run check passed: 21 test files / 120 tests, typechecks and production build.

## 2026-10-11 — Four-sided material card table
- Replaced the horizontal seat list / rectangular outline with an oval timber rail, muted brass inlay and layered CSS felt texture. No generated image asset or new rendering dependency.
- Current member sits at the bottom; other seats occupy left/top/right. Avatar initials, empty seat markers and ready badges remain tied to live member state.
- Empty table shows three fanned card backs; proposed games appear on the felt surface, with bounded scrolling for a full table. Retained existing proposal, voting and server timing rules.
- npm run check passed: 21 test files / 120 tests, typechecks and production build.
- Browser verified actual waiting-room timber/felt appearance and four-sided seats on desktop and mobile. Mobile viewport measured 377px with equal document scroll width (no horizontal overflow). Adjusted card-back/caption spacing and top-seat clearance after screenshots.

## 2026-10-11 — Share subview and non-overlapping game lounge
- Moved Tonight Together to a small button beside the Share heading. It switches between sharing and room panels, with a return action; invitation URLs open the room panel directly. The hidden room component remains mounted to preserve an ongoing round.
- Removed timber, brass, felt weave and fanned card backs. Replaced them with a blue-gray game surface and controller mark.
- Replaced absolutely positioned seats with dedicated grid cells on four sides. Desktop gaps are 18/22px and mobile gaps 8/18px; active cards scroll inside the center, and room bottom padding leaves room for navigation.
- npm run check passed: 21 test files / 120 tests, typechecks and production build.

- Browser QA: share/room switching works; all four seats have zero table intersections on desktop and at a 390px viewport. Mobile document has no horizontal overflow. Viewport override reset after verification.

## 2026-10-11 — Mobile visual audit and responsive composition
See artifacts/mobile-qa/review.md for captured screens, findings, repairs and verification limits. Added consumer-mobile.css for phone layout, consistent navigation safe areas, compact room seats/table, two-column genre groups, and sharing spacing. Tab changes reset scroll to the top. Full check passed; CSS follow-ups rebuilt successfully.

## 2026-10-11 — Share entry regression and room guide
- Removed URL-based room expansion from LibraryView. The room ID still supports invitation restoration, while each share-page mount begins with social sharing.
- Renamed the entry to 「或者，今晚一起玩」. Added a dismissible gameplay dialog with an explicit enter action, reusing the existing Escape/focus handling.
- Verified in the browser with a room URL: initial social view; open guide; Escape dismiss; reopen and enter; Explore then Share returns to social view. Saved mobile screenshot: artifacts/mobile-qa/room-guide.jpg.
- npm run check passed (21 files / 120 tests, typechecks and build). No room session was left or deleted during verification.

## Recommendation timeline — 2026-10-11
- Replaced separate shelves with one deduplicated, connected game timeline.
- Desktop browser checked at requested 1320 × 1040: alternating cards, next arrow, favourite toggle, and tab exit cleanup work. Exit leaves no pin spacer.
- Mobile browser checked at requested 390 × 844: native horizontal rail; measured document width equals viewport width (391 CSS px); next arrow advances to PUBG. Screenshots in artifacts/mobile-qa/recommendation-timeline-mobile.png and recommendation-timeline-desktop.png.
- Screens below 800 CSS px tall use a single row to leave room for navigation. Reduced-motion preference disables pinning and reveals content without animation.
- npm run check passed: type checking, 21 test files / 120 tests, and production build. Vite reports a non-fatal large-chunk warning.
- Setup and behavior: docs/recommendation-timeline.md.

## Desktop wheel-driven correction — 2026-10-11
Removed recommendation arrow controls and nested desktop horizontal overflow. Real browser wheel actions at 1164 × 655 CSS pixels advanced from initial games to later games along the transformed track; node reveals followed scroll progress. Full npm run check passed (120 tests), then CSS-only artwork width fix built successfully. Remote artwork was still loading for several items during this check. Desktop behavior no longer depends on a minimum viewport height.

## Multi-direction recommendation route — 2026-10-11
Replaced the straight timeline with a square-spiral camera path. Browser wheel checks reached indices 2, 4, 5 and 8, including vertical and reversed horizontal travel. Mounted nodes remained capped at 9; first mounted index advanced to 4. Document height stayed 34160 CSS px across the sampled scroll positions (84 current candidates), so scrolling did not append page content. npm run check passed: 22 test files, 123 tests, typechecks and production build. No long-running memory benchmark was performed.

## Recommendation pacing and artwork scheduling — 2026-10-11
Changed per-item scroll travel from 400 to 1000 CSS px and scrub from 0.45 to 0.8 seconds. Added directional lookahead (seven forward, two backward, current), latest-window replacement with two background workers, global artwork concurrency of four, foreground priority, and separate in-flight deduplication from the 24-entry decoded LRU. Browser first several transitions showed loaded artwork on arrival; this is not a cold-network latency guarantee. npm run check passed: 23 files / 125 tests, typechecks and production build. Screenshot: artifacts/mobile-qa/recommendation-preloaded.png.
## 推薦動畫 DOM 修正（2026-10-22）

實際瀏覽器錯誤：NotFoundError / insertBefore，舊資源 index-DY7-k-q_.js。ScrollTrigger 將 Timeline 根節點搬入 pin spacer，React 在同層插入動態內容時仍以原父節點定位。新增固定外層，由 ScrollTrigger 只處理內層 section；保留原有捲動動畫及錯誤邊界。

驗證：npm run check 通過。實際頁面開啟 AI 篩選，推薦候選由 19 增至 70，捲動後切回探索再返回推薦，未新增錯誤紀錄。原本的錯誤紀錄仍存在於瀏覽器歷史日誌，不是新版重現。未宣稱覆蓋所有瀏覽器或擴充套件干預情境。


## 2026-10-22 prelaunch regression and creator credit

- Added by @bm1016bm-svg below the brand, linking to the public GitHub profile; no email published.
- Timeline now gives ScrollTrigger an inner pin container and isolates its imperatively updated counter text from React reconciliation.
- Browser: AI exclusion enabled while recommendations append, scrolling, ten Explore/Recommended round trips, AI off/on and source switch, then reload after local restart. No new console errors or whole-page fallback observed. Rapid skipping temporarily exhausted ready cards and disabled actions during loading; the UI resumed without reload. This does not prove lag-free behavior at unlimited swipe speed.
- Evidence: artifacts/filter-ui/release-browser-check.json and release-credit-preview.png.
- npm run check: 39 files, 220 tests passed, production build succeeded. beta:smoke passed.
- Fixed CLI Slack diagnostic redaction and init ancestor junction handling with failing-before/passing-after tests. Vite 7.3.7 / Vitest 4.1.12; official npm audit reports zero known vulnerabilities.
- Deployment decision: local invitation beta verified; free Cloudflare release blocked because public Worker ingress remains disabled and full discovery server is Node. No live deployment, mobile Safari or Firefox test. Security report coverage of ancillary files is partial and independent final patch review was unavailable due delegated model quota.
