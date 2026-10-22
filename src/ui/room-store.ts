import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { assertSafePlaycisionPath } from '../config/load.js';
import { roomTokenSchema, type RoomState } from '../rooms/engine.js';

const storedRoom = z.object({
  id: z.string().uuid(), nextPlayerId: z.number().int().positive(), expiresAt: z.number().finite(), startedAt: z.number().finite().nullable(),
  players: z.array(z.object({ id: z.string().max(20), token: roomTokenSchema, name: z.string().max(24), ready: z.boolean() })).max(4),
  cards: z.array(z.object({ id: z.string().regex(/^\d{1,10}$/), name: z.string().max(160), owners: z.array(z.string()).max(4), votes: z.array(z.string()).max(4) })).max(8),
});
const snapshot = z.array(storedRoom).max(100);

/** One process only. Transactions commit to disk before becoming visible. */
export class RoomStore {
  private queue: Promise<unknown> = Promise.resolve();
  private rooms: Map<string, RoomState> | undefined;
  constructor(private cwd?: string) {}
  run<T>(change: (rooms: Map<string, RoomState>) => T, now = Date.now()): Promise<T> {
    const result = this.queue.then(async () => {
      let recoveryContents: string | undefined;
      const directory = this.cwd ? path.join(this.cwd, '.playcision') : undefined;
      const file = directory ? path.join(directory, 'rooms.json') : undefined;
      let current = this.rooms;
      if (!current) {
        current = new Map();
        if (directory && file) {
          await assertSafePlaycisionPath(directory, { allowMissing: true }); await mkdir(directory, { recursive: true });
          await assertSafePlaycisionPath(file, { allowMissing: true });
          try {
            const contents = await readFile(file, 'utf8');
            if (contents.length > 1_000_000) throw new Error('Invalid room store size');
            const decoded: unknown = JSON.parse(contents);
            const valid = snapshot.safeParse(decoded);
            if (valid.success) current = new Map(valid.data.map(r => [r.id, r]));
            else {
              if (!Array.isArray(decoded) || decoded.length > 100) throw new Error('Invalid room store format; original file retained.');
              // Quarantine the complete original before replacing any invalid entries.
              const recovered = decoded.flatMap((entry: unknown) => {
                const parsed = storedRoom.safeParse(entry); return parsed.success ? [parsed.data] : [];
              });
              current = new Map(recovered.map(r => [r.id, r]));
              recoveryContents = contents;
            }
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; current = new Map(); }
        }
      }
      const next = new Map([...current].filter(([, r]) => r.expiresAt > now).map(([id, r]) => [id, structuredClone(r)]));
      const value = change(next);
      // Validate before any disk replacement or in-memory publication.
      snapshot.parse([...next.values()]);
      if (file && (recoveryContents !== undefined || JSON.stringify([...next.values()]) !== JSON.stringify([...current.values()]))) {
        const temp = `${file}.tmp`;
        await assertSafePlaycisionPath(directory!); await assertSafePlaycisionPath(file, { allowMissing: true }); await assertSafePlaycisionPath(temp, { allowMissing: true });
        if (recoveryContents !== undefined) {
          const backup = path.join(directory!, `rooms.quarantine-${randomUUID()}.json`);
          await assertSafePlaycisionPath(backup, { allowMissing: true });
          await writeFile(backup, recoveryContents, { mode: 0o600, flag: 'wx' });
          process.stderr.write('room_store_recovery: invalid rooms quarantined; original snapshot retained in a private quarantine file.\n');
        }
        await writeFile(temp, JSON.stringify([...next.values()]), { mode: 0o600 }); await rename(temp, file);
      }
      this.rooms = next; return value;
    });
    this.queue = result.catch(() => {}); return result;
  }
}
