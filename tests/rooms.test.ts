import { describe, expect, it } from 'vitest';
import { changeRoom, newRoom, phase, roomView } from '../src/rooms/engine.js';

const host = 'aaaaaaaa-0000-4000-8000-000000000000';
const friend = 'bbbbbbbb-0000-4000-8000-000000000000';
const guest = 'cccccccc-0000-4000-8000-000000000000';
const fourth = 'dddddddd-0000-4000-8000-000000000000';
const fifth = 'eeeeeeee-0000-4000-8000-000000000000';
function setup() {
  const r = newRoom('room', 'Host', host, 0);
  changeRoom(r, { type: 'join', name: 'Friend' }, friend, 0);
  for (const t of [host, friend]) changeRoom(r, { type: 'ready', ready: true }, t, 0);
  changeRoom(r, { type: 'start' }, host, 100);
  return r;
}
describe('shared room rules', () => {
  it('requires authenticated members, host and at least two ready players', () => {
    const r = newRoom('room', 'Host', host, 0);
    expect(() => changeRoom(r, { type: 'start' }, host, 0)).toThrow();
    expect(() => roomView(r, friend, 0)).toThrow();
    changeRoom(r, { type: 'join', name: 'Friend' }, friend, 0);
    expect(() => changeRoom(r, { type: 'start' }, friend, 0)).toThrow();
    expect(() => changeRoom(r, { type: 'vote', id: '1', selected: true }, friend, 0)).toThrow();
  });
  it('limits capacity to four and rejoins idempotently', () => {
    const r = newRoom('room', 'Host', host, 0);
    for (const t of [friend, guest, fourth]) changeRoom(r, { type: 'join', name: 'Guest' }, t, 0);
    changeRoom(r, { type: 'join', name: 'Again' }, friend, 0);
    expect(r.players).toHaveLength(4);
    expect(() => changeRoom(r, { type: 'join', name: 'Fifth' }, fifth, 0)).toThrow('房間已滿');
  });
  it('merges duplicate proposals, limits two per person and withdraws only own card', () => {
    const r = setup();
    for (const t of [host, friend]) changeRoom(r, { type: 'propose', id: '1', name: 'Game' }, t, 200);
    expect(r.cards).toHaveLength(1); expect(r.cards[0]?.owners).toHaveLength(2);
    changeRoom(r, { type: 'propose', id: '2', name: 'Game 2' }, host, 200);
    expect(() => changeRoom(r, { type: 'propose', id: '3', name: 'Game 3' }, host, 200)).toThrow();
    changeRoom(r, { type: 'withdraw', id: '1' }, host, 200);
    expect(r.cards[0]?.owners).toEqual(['p2']);
  });
  it('uses exact server deadlines and rejects late votes and joining mid-round', () => {
    const r = setup();
    expect(phase(r, 40099)).toBe('proposing'); expect(phase(r, 40100)).toBe('voting'); expect(phase(r, 60100)).toBe('finished');
    expect(() => changeRoom(r, { type: 'propose', id: '1', name: 'Game' }, host, 40100)).toThrow();
    expect(() => changeRoom(r, { type: 'vote', id: '1', selected: true }, host, 60100)).toThrow();
    expect(() => changeRoom(r, { type: 'join', name: 'Late' }, guest, 200)).toThrow('這一輪已開始');
  });
  it('keeps votes private until reveal, supports changing votes and reports ties', () => {
    const r = setup();
    for (const id of ['1', '2']) changeRoom(r, { type: 'propose', id, name: 'Game' }, host, 200);
    changeRoom(r, { type: 'vote', id: '1', selected: true }, host, 40100);
    changeRoom(r, { type: 'vote', id: '1', selected: true }, host, 40101);
    expect(roomView(r, friend, 40101).cards[0]?.votes).toHaveLength(0);
    changeRoom(r, { type: 'vote', id: '2', selected: true }, friend, 40102);
    expect(roomView(r, host, 60100).winners).toEqual(['1', '2']);
    expect(JSON.stringify(roomView(r, host, 60100))).not.toContain(host);
    changeRoom(r, { type: 'vote', id: '2', selected: false }, friend, 40103);
    expect(roomView(r, host, 60100).winners).toEqual(['1']);
  });
  it('has no invented winner and expires exactly ten minutes after creation', () => {
    const r = setup(); expect(roomView(r, host, 60100).winners).toEqual([]);
    expect(roomView(r, host, 599_999).phase).toBe('finished');
    expect(() => roomView(r, host, 600_000)).toThrow('房間已到期');
    expect(() => changeRoom(r, { type: 'vote', id: '1', selected: true }, host, 600_000)).toThrow('房間已到期');
  });
  it('transfers host on waiting-room departure', () => {
    const r = newRoom('room', 'Host', host, 0);
    changeRoom(r, { type: 'join', name: 'Friend' }, friend, 0);
    changeRoom(r, { type: 'leave' }, host, 0);
    expect(roomView(r, friend, 0).host).toBe('p2');
  });
});
