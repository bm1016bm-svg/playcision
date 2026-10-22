import { genreLabel } from './genre-labels.js';
const groups = [
  ['action', '動作與射擊', /動作|射擊|格鬥|砍殺|無雙|武術|劍術|忍者|戰鬥|大逃殺|潛行/],
  ['rpg', '角色扮演與冒險', /角色扮演|冒險|類魂|地城|Roguelike|Roguelite|銀河戰士|探索|開放世界|平台跳躍|隨機地城|隨機冒險/],
  ['strategy', '策略與經營', /策略|戰術|經營|管理|建造|製作|生存|模擬|殖民|經濟|交易|資源|自走棋|塔防|運輸/],
  ['casual', '休閒與解謎', /休閒|解謎|邏輯|推箱|放鬆|療癒|可愛|收集|收納|三消|尋物|放置|增量|桌遊|桌上|卡牌|派對|迷你|音樂|節奏|牌組|密室逃脫/],
  ['sports', '運動與競速', /運動|競速|駕駛|足球|籃球|網球|滑雪|自行車|摩托|釣魚/],
  ['story', '劇情與主題', /劇情|小說|戀愛|乙女|結局|故事|恐怖|奇幻|武俠|科幻|歷史|軍事|戰爭|犯罪|懸疑|偵探|心理|末日|殭屍|太空|中世紀|成人|裸露|血腥/],
  ['features', '玩法與風格', /多人|單人|合作|對戰|對抗|競技|視角|人稱|2D|3D|風格|像素|動漫|寫實|手繪|色彩|氛圍|模組|控制器|虛擬|搶先|免費|主角|角色自訂|平面畫面|立體畫面/],
] as const;
// Stable editorial order, independent of the order games arrive from Steam.
const preferred = ['Action', 'Shooter', 'FPS', 'Third-Person Shooter', 'Battle Royale', 'Fighting', 'Stealth', 'Hack and Slash',
  'RPG', 'Adventure', 'Open World', 'Action RPG', 'Souls-like', 'JRPG', 'Platformer', 'Dungeon Crawler',
  'Strategy', 'Simulation', 'Survival', 'City Builder', 'Management', 'Turn-Based Strategy', 'Tower Defense', 'Base Building',
  'Casual', 'Puzzle', 'Relaxing', 'Cozy', 'Card Game', 'Party Game', 'Music', 'Hidden Object',
  'Sports', 'Racing', 'Driving', 'Football (Soccer)', 'Basketball', 'Fishing',
  'Story Rich', 'Fantasy', 'Sci-fi', 'Horror', 'Visual Novel', 'Romance',
  'Singleplayer', 'Multiplayer', 'Co-op', 'Online Co-Op', 'Pixel Graphics', 'Anime'];
const priority = new Map(preferred.map((tag, index) => [genreLabel(tag), index]));
const overrides: Record<string, string> = {
  'Action RPG': 'rpg', 'Action-Adventure': 'rpg', 'Tactical RPG': 'rpg', 'Strategy RPG': 'rpg',
  'Combat Racing': 'sports', 'Automobile Sim': 'sports', 'Dating Sim': 'story',
  'Survival Horror': 'story', 'Turn-Based Combat': 'strategy', 'Card Battler': 'casual',
  'Roguelike Deckbuilder': 'casual', 'MOBA': 'action',
};
export function groupGenres(genres: readonly string[]) {
  const result = [...groups.map(([id, title]) => ({ id: String(id), title: String(title), genres: [] as string[] })), { id: 'other', title: '其他特色', genres: [] as string[] }];
  for (const genre of new Set(genres)) {
    const override = overrides[genre] ?? Object.entries(overrides).find(([key]) => genreLabel(key) === genreLabel(genre))?.[1];
    const index = groups.findIndex(([id, , pattern]) => override ? id === override : pattern.test(genreLabel(genre)));
    result[index < 0 ? result.length - 1 : index]!.genres.push(genre);
  }
  return result.filter(group => group.genres.length).map(group => ({ ...group, genres: group.genres.sort((a, b) =>
    (priority.get(genreLabel(a)) ?? 999) - (priority.get(genreLabel(b)) ?? 999) || genreLabel(a).localeCompare(genreLabel(b), 'zh-Hant')) }));
}

/** Sexual-content labels only: general mature/violence flags are not adult-game evidence. */
export function hasAdultContent(game: { tags: string[]; genres: string[] }): boolean {
  return [...game.tags, ...game.genres].some(label => /^(sexual content|nudity|hentai|adult only|adults only|成人內容|成人内容|成人動漫|成人动漫|成人遊戲|成人游戏|裸露)$/i.test(label.trim()));
}
