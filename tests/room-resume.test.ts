import { describe, expect, it, vi } from 'vitest';
import { changeRoom, newRoom, roomView } from '../src/rooms/engine.js';
import { forgetRoomMembership, parseRoomSnapshot, readRoomMembership, rememberRoomMembership, resumeRoom, ROOM_MEMBERSHIP_KEY } from '../src/web/consumer/room-resume.js';

const id = 'aaaaaaaa-0000-4000-8000-000000000000';
const other = 'bbbbbbbb-0000-4000-8000-000000000000';
const token = 'cccccccc-0000-4000-8000-000000000000';
const guest = 'dddddddd-0000-4000-8000-000000000000';
function session() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
function setup() {
  const storage = session();
  const room = newRoom(id, '原暱稱', token, 0);
  changeRoom(room, { type: 'join', name: 'Friend' }, guest, 1);
  const view = roomView(room, token, 2);
  rememberRoomMembership(storage, view);
  return { storage, view, signal: new AbortController().signal };
}

describe('returning to an existing room', () => {
  it('fetches an existing member snapshot without joining again or extending expiry', async () => {
    const a = setup();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(a.view));
    const view = await resumeRoom({ ...a, id, token, fetcher });
    expect(view).toEqual(a.view);
    expect(view?.players[0]?.name).toBe('原暱稱');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/rooms/' + id);
    expect(options?.method).toBeUndefined();
    expect(options?.body).toBeUndefined();
    expect(options?.headers).toEqual({ Authorization: `Bearer ${token}` });
    const saved = JSON.parse(a.storage.getItem(ROOM_MEMBERSHIP_KEY)!);
    expect(saved).toEqual({ id, expiresAt: a.view.expiresAt });
    expect(JSON.stringify(saved)).not.toContain(token);
    expect(JSON.stringify(saved)).not.toContain('原暱稱');
  });

  it('does not send credentials or automatically join an unknown invitation', async () => {
    const a = setup(); const fetcher = vi.fn<typeof fetch>();
    expect(await resumeRoom({ ...a, id: other, token, fetcher })).toBeNull();
    expect(await resumeRoom({ ...a, id: 'not-a-room', token, fetcher })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(readRoomMembership(a.storage, id)?.id).toBe(id);
  });

  it('clears a membership only when the server reports it expired', async () => {
    const a = setup(); const fetcher = vi.fn<typeof fetch>(async () => Response.json({ error: '房間已到期' }, { status: 410 }));
    await expect(resumeRoom({ ...a, id, token, fetcher })).rejects.toMatchObject({ status: 410 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readRoomMembership(a.storage, id)).toBeUndefined();
  });

  it.each([-600000, 3600000])('uses the server deadline when the device clock is %i ms', async deviceTime => {
    vi.useFakeTimers(); vi.setSystemTime(deviceTime);
    try {
      const a = setup(); const fetcher = vi.fn<typeof fetch>(async () => Response.json(a.view));
      await expect(resumeRoom({ ...a, id, token, fetcher })).resolves.toEqual(a.view);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(readRoomMembership(a.storage, id)?.expiresAt).toBe(a.view.expiresAt);
      const expired = { ...a.view, serverNow: a.view.expiresAt };
      await expect(resumeRoom({ ...a, id, token, fetcher: async () => Response.json(expired) })).rejects.toMatchObject({ status: 410 });
      expect(readRoomMembership(a.storage, id)).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it.each([400, 401, 403, 404, 410])('clears invalid membership on HTTP %i so it cannot keep reopening a dead seat', async status => {
    const a = setup(); const fetcher = vi.fn<typeof fetch>(async () => Response.json({ error: '請重新加入房間' }, { status }));
    await expect(resumeRoom({ ...a, id, token, fetcher })).rejects.toMatchObject({ status });
    expect(readRoomMembership(a.storage, id)).toBeUndefined();
  });

  it('retains the original membership on an outage and permits a successful retry', async () => {
    const a = setup(); const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(Error('offline'))
      .mockResolvedValueOnce(Response.json({ error: 'busy' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json(a.view));
    await expect(resumeRoom({ ...a, id, token, fetcher })).rejects.toThrow('offline');
    await expect(resumeRoom({ ...a, id, token, fetcher })).rejects.toMatchObject({ status: 503 });
    expect(readRoomMembership(a.storage, id)?.expiresAt).toBe(a.view.expiresAt);
    await expect(resumeRoom({ ...a, id, token, fetcher })).resolves.toEqual(a.view);
  });

  it('still clears a forbidden seat when an edge response is HTML rather than JSON', async () => {
    const a = setup();
    const fetcher = vi.fn<typeof fetch>(async () => new Response('<html>Forbidden</html>', { status: 403 }));
    await expect(resumeRoom({ ...a, id, token, fetcher })).rejects.toMatchObject({ status: 403 });
    expect(readRoomMembership(a.storage, id)).toBeUndefined();
  });

  it('ignores late canceled results during StrictMode cleanup and the next setup', async () => {
    const a = setup(); const first = new AbortController();
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => new Promise<Response>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(Response.json(a.view));
    const abandoned = resumeRoom({ ...a, id, token, fetcher, signal: first.signal });
    const rejected = expect(abandoned).rejects.toThrow();
    first.abort();
    await expect(resumeRoom({ ...a, id, token, fetcher })).resolves.toEqual(a.view);
    finish(Response.json({ error: 'late forbidden' }, { status: 403 }));
    await rejected;
    expect(readRoomMembership(a.storage, id)?.id).toBe(id);
  });

  it('does not remove a newer room when a former room reply arrives late', async () => {
    const a = setup();
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(async () => new Promise<Response>(resolve => { finish = resolve; }));
    const old = resumeRoom({ ...a, id, token, fetcher });
    const rejected = expect(old).rejects.toMatchObject({ status: 403 });
    rememberRoomMembership(a.storage, { id: other, expiresAt: 600001 });
    finish(Response.json({ error: 'old room forbidden' }, { status: 403 }));
    await rejected;
    expect(readRoomMembership(a.storage, other)).toEqual({ id: other, expiresAt: 600001 });
  });

  it('rejects malformed or mismatched snapshots rather than letting the screen dereference them', async () => {
    const a = setup();
    for (const value of [null, {}, { ...a.view, players: null }, { ...a.view, cards: [{}] }, { ...a.view, id: other }]) {
      const fetcher = vi.fn<typeof fetch>(async () => Response.json(value));
      await expect(resumeRoom({ ...a, id, token, fetcher })).rejects.toMatchObject({ status: 502 });
      expect(readRoomMembership(a.storage, id)).toBeDefined();
    }
    const expired = { ...a.view, serverNow: a.view.expiresAt };
    await expect(resumeRoom({ ...a, id, token, fetcher: async () => Response.json(expired) })).rejects.toMatchObject({ status: 410 });
    expect(readRoomMembership(a.storage, id)).toBeUndefined();
  });

  it('tolerates blocked or corrupt session storage and only removes the requested membership', () => {
    const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); }, removeItem: () => { throw Error('blocked'); } };
    expect(readRoomMembership(blocked, id)).toBeUndefined();
    expect(() => rememberRoomMembership(blocked, { id, expiresAt: 600000 })).not.toThrow();
    expect(() => forgetRoomMembership(blocked, id)).not.toThrow();
    const storage = session();
    for (const raw of ['{broken', 'null', 'x'.repeat(301), JSON.stringify({ id, expiresAt: 'later' })]) {
      storage.setItem(ROOM_MEMBERSHIP_KEY, raw);
      expect(readRoomMembership(storage, id)).toBeUndefined();
    }
    rememberRoomMembership(storage, { id, expiresAt: 600000 });
    forgetRoomMembership(storage, other);
    expect(readRoomMembership(storage, id)).toBeDefined();
    forgetRoomMembership(storage, id);
    expect(storage.getItem(ROOM_MEMBERSHIP_KEY)).toBeNull();
  });

  it('accepts the engine snapshots at each phase including private votes and ties', () => {
    const room = newRoom(id, 'Host', token, 0);
    changeRoom(room, { type: 'join', name: 'Friend' }, guest, 1);
    expect(parseRoomSnapshot(roomView(room, token, 2)).phase).toBe('waiting');
    for (const player of [token, guest]) changeRoom(room, { type: 'ready', ready: true }, player, 3);
    changeRoom(room, { type: 'start' }, token, 4);
    changeRoom(room, { type: 'propose', id: '10', name: 'Game' }, token, 5);
    expect(parseRoomSnapshot(roomView(room, token, 5)).phase).toBe('proposing');
    changeRoom(room, { type: 'vote', id: '10', selected: true }, token, 40004);
    expect(parseRoomSnapshot(roomView(room, guest, 40004)).cards[0]?.votes).toEqual([]);
    expect(parseRoomSnapshot(roomView(room, guest, 60004)).winners).toEqual(['10']);
  });
});
