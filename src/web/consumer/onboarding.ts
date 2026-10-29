export const GUIDE_KEY = 'playcision.page-guides.v2';
export const PAGE_GUIDES = {
  discover: { title: '探索', lines: ['左滑略過，右滑收藏。', '點遊戲看評論，右上角可篩選。'], hint: '電腦也能用 ← → 操作' },
  recommended: { title: '推薦', lines: ['向下捲動穿過開場，接著瀏覽推薦。', '喜歡就點愛心，加入收藏。'], hint: '右上角可以跳過開場動畫' },
  saved: { title: '收藏', lines: ['想玩的遊戲都在這裡。', '拿不定主意？讓「幫我選一款」決定。'], hint: '' },
  library: { title: '分享', lines: ['選平台、勾遊戲，再複製給朋友。', '點「今晚一起玩」，邀朋友一起選。'], hint: '「管理排除」可以恢復略過或排除的遊戲' },
  filters: { title: '篩選', lines: ['選來源，再選分類與類型。', 'AI 排除會同步套用至探索與推薦。'], hint: '選好後按「套用篩選」' },
  events: { title: 'Steam 活動', lines: ['點活動卡，從這個活動裡挑遊戲。', '再次點選可取消；原本的篩選條件仍可使用。'], hint: '選好後按「套用篩選」' },
} as const;
export type GuidePage = keyof typeof PAGE_GUIDES;
export interface GuideStep { target: string; text: string; hint: string }
export const GUIDE_STEPS: Record<GuidePage, GuideStep[]> = {
  discover: [
    { target: '[data-guide="discover-actions"]', text: '左滑略過，右滑收藏', hint: '電腦也能用 ← →' },
    { target: '[data-guide="filter-entry"]', text: '想玩哪種？從這裡選', hint: '選來源、選分類，再套用條件' },
  ],
  recommended: [
    { target: '[data-guide="recommendation-scroll"]', text: '往下捲，發現下一款', hint: '穿過開場，接著瀏覽推薦' },
    { target: '[data-guide="recommendation-favorite"]', text: '心動就收下', hint: '點愛心，留到收藏慢慢挑' },
  ],
  saved: [
    { target: '[data-guide="saved-games"]', text: '想玩的，都留在這裡', hint: '點遊戲，看看玩家怎麼說' },
    { target: '[data-guide="saved-picker"]', text: '選不出來？交給手氣', hint: '從你的收藏抽出今晚的一款' },
  ],
  library: [
    { target: '.consumer-share-platforms button', text: '挑平台，勾遊戲，分享', hint: '複製清單，貼給你的朋友' },
    { target: '[data-guide="room-entry"]', text: '也可以，大家一起選', hint: '邀朋友入座，決定今晚玩什麼' },
  ],
  filters: [
    { target: '.filter-source-options', text: '先選遊戲來源', hint: '熱門暢銷、新品、折扣，選一個' },
    { target: '.filter-category-grid', text: '選分類，再選類型', hint: '分類展開後，全部類型一次顯示' },
    { target: '.filter-ai-row input', text: '排除已揭露 AI 內容', hint: '探索、推薦，以及後續載入的遊戲都會套用' },
    { target: '.filter-panel-actions .consumer-apply', text: '選好，按套用', hint: '人數、價格、平台也能搭配選擇' },
  ],
  events: [
    { target: '.steam-event-grid button', text: '看看 Steam 活動', hint: '點選活動，再點一次即可取消' },
    { target: '.filter-panel-actions .consumer-apply', text: '套用活動與篩選', hint: '下方可搭配類型、價格、平台與 AI 篩選' },
  ],
};
export function availableGuideSteps(page: GuidePage, exists: (selector: string) => boolean): GuideStep[] {
  return GUIDE_STEPS[page].filter(step => exists(step.target));
}
export function readGuides(storage: Pick<Storage, 'getItem'>): GuidePage[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(GUIDE_KEY) ?? '[]');
    return Array.isArray(data) ? [...new Set(data.filter((key): key is GuidePage => typeof key === 'string' && Object.hasOwn(PAGE_GUIDES, key)))] : [];
  } catch { return []; }
}
export function rememberGuide(storage: Pick<Storage, 'getItem' | 'setItem'>, page: GuidePage): void {
  try { storage.setItem(GUIDE_KEY, JSON.stringify([...new Set([...readGuides(storage), page])])); } catch { /* In-memory dismissal remains available. */ }
}
