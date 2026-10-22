export const GUIDE_KEY = 'playcision.page-guides.v2';
export const PAGE_GUIDES = {
  discover: { title: '探索', lines: ['左滑略過，右滑收藏。', '點遊戲看評論，右上角可篩選。'], hint: '電腦也能用 ← → 操作' },
  recommended: { title: '推薦', lines: ['往下捲動，接著看更多遊戲。', '喜歡就點愛心，加入收藏。'], hint: '' },
  saved: { title: '收藏', lines: ['想玩的遊戲都在這裡。', '拿不定主意？讓「幫我選一款」決定。'], hint: '' },
  library: { title: '分享', lines: ['選平台、勾遊戲，再複製給朋友。', '點「今晚一起玩」，邀朋友一起選。'], hint: '' },
  filters: { title: '篩選', lines: ['選來源，再選分類與類型。', 'AI 排除會同步套用至探索與推薦。'], hint: '選好後按「套用篩選」' },
  events: { title: 'Steam 活動', lines: ['點活動卡預覽官方活動資訊。', '返回篩選會保留原有條件。'], hint: '活動遊戲篩選尚未開放' },
} as const;
export type GuidePage = keyof typeof PAGE_GUIDES;
export function readGuides(storage: Pick<Storage, 'getItem'>): GuidePage[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(GUIDE_KEY) ?? '[]');
    return Array.isArray(data) ? [...new Set(data.filter((key): key is GuidePage => typeof key === 'string' && Object.hasOwn(PAGE_GUIDES, key)))] : [];
  } catch { return []; }
}
export function rememberGuide(storage: Pick<Storage, 'getItem' | 'setItem'>, page: GuidePage): void {
  try { storage.setItem(GUIDE_KEY, JSON.stringify([...new Set([...readGuides(storage), page])])); } catch { /* In-memory dismissal remains available. */ }
}
