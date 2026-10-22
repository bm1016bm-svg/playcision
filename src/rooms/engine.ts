import { z } from 'zod';

export const roomTokenSchema = z.string().uuid();

export const roomAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), name: z.string().trim().min(1).max(24) }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('propose'), id: z.string().regex(/^\d{1,10}$/), name: z.string().trim().min(1).max(160) }),
  z.object({ type: z.literal('withdraw'), id: z.string() }),
  z.object({ type: z.literal('vote'), id: z.string(), selected: z.boolean() }),
  z.object({ type: z.literal('leave') }),
]);
export type RoomAction = z.infer<typeof roomAction>;
export type RoomPhase = 'waiting' | 'proposing' | 'voting' | 'finished';
export interface RoomState {
  id: string; nextPlayerId: number; expiresAt: number; startedAt: number | null;
  players: { id: string; token: string; name: string; ready: boolean }[];
  cards: { id: string; name: string; owners: string[]; votes: string[] }[];
}
export function phase(room: RoomState, now: number): RoomPhase {
  if (room.startedAt === null) return 'waiting';
  const elapsed = now - room.startedAt;
  return elapsed < 40_000 ? 'proposing' : elapsed < 60_000 ? 'voting' : 'finished';
}
export function newRoom(id: string, name: string, token: string, now: number): RoomState {
  roomTokenSchema.parse(token);
  const input = roomAction.parse({ type: 'join', name });
  if (input.type !== 'join') throw new Error('暱稱無效');
  return { id, nextPlayerId: 2, expiresAt: now + 10 * 60 * 1000, startedAt: null,
    players: [{ id: "p1", token, name: input.name, ready: false }], cards: [] };
}
export function changeRoom(room: RoomState, input: unknown, token: string, now: number): void {
  roomTokenSchema.parse(token);
  if (now >= room.expiresAt) throw new Error('房間已到期，請重新開桌');
  const a = roomAction.parse(input);
  const current = phase(room, now);
  const player = room.players.find(p => p.token === token);
  if (a.type === 'join') {
    if (player) return;
    if (current !== 'waiting') throw new Error('這一輪已開始');
    if (room.players.length >= 4) throw new Error('房間已滿，最多四人');
    room.players.push({ id: `p${room.nextPlayerId++}`, token, name: a.name, ready: false }); return;
  }
  if (!player) throw new Error('請重新加入房間');
  if (a.type === 'ready' || a.type === 'leave') {
    if (current !== 'waiting') throw new Error('開始後不能更動座位');
    if (a.type === 'ready') player.ready = a.ready;
    else room.players = room.players.filter(p => p !== player);
    return;
  }
  if (a.type === 'start') {
    if (room.players[0] !== player) throw new Error('由房主開始');
    if (current !== 'waiting') throw new Error('這一輪已開始');
    if (room.players.length < 2 || room.players.some(p => !p.ready)) throw new Error('至少兩人，並且全員準備好才能開始');
    room.startedAt = now; return;
  }
  if (a.type === 'vote') {
    if (current !== 'voting') throw new Error('請在最後 20 秒投票');
    const card = room.cards.find(c => c.id === a.id);
    if (!card) throw new Error('找不到這張遊戲卡');
    card.votes = card.votes.filter(id => id !== player.id);
    if (a.selected) card.votes.push(player.id);
    return;
  }
  if (current !== 'proposing') throw new Error('出牌時間已結束');
  if (a.type === 'withdraw') {
    room.cards.forEach(c => { if (c.id === a.id) c.owners = c.owners.filter(id => id !== player.id); });
    room.cards = room.cards.filter(c => c.owners.length); return;
  }
  const card = room.cards.find(c => c.id === a.id);
  if (card?.owners.includes(player.id)) return;
  if (room.cards.filter(c => c.owners.includes(player.id)).length >= 2) throw new Error('每人最多出兩款，可先收回一張');
  if (card) card.owners.push(player.id);
  else room.cards.push({ id: a.id, name: a.name, owners: [player.id], votes: [] });
}
export function roomView(room: RoomState, token: string, now: number) {
  if (now >= room.expiresAt) throw new Error('房間已到期，請重新開桌');
  const me = room.players.find(p => p.token === token);
  if (!me) throw new Error('請重新加入房間');
  const current = phase(room, now);
  const high = Math.max(0, ...room.cards.map(c => c.votes.length));
  return { id: room.id, expiresAt: room.expiresAt, startedAt: room.startedAt, serverNow: now,
    phase: current, me: me.id, host: room.players[0]?.id,
    players: room.players.map(({ token: _token, ...p }) => p),
    cards: room.cards.map(c => ({ ...c, votes: current === 'finished' ? c.votes : c.votes.filter(id => id === me.id) })),
    winners: current === 'finished' && high > 0 ? room.cards.filter(c => c.votes.length === high).map(c => c.id) : [] };
}
export type RoomView = ReturnType<typeof roomView>;
