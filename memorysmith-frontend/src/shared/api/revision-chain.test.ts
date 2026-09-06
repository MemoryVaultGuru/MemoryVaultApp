/**
 * A write retires the revision it was based on (#77).
 *
 * The sequence that failed in production is the first test here, and it is
 * the ordinary use of a checklist: tick something, tick something else a
 * moment later. It never ran before, because a second write could only happen
 * once the box toggled (#71) and the first write was accepted (#75). Each fix
 * uncovered the next, and this is the last of the three.
 */

import { describe, expect, it, vi } from 'vitest';
import { revisionChain } from './revision-chain';

/** A server that moves to a new revision on every accepted write. */
function server(from = 0) {
  const seen: Array<string | null> = [];
  let n = from;
  return {
    seen,
    write: async (input: { raw: string; baseRevision: string | null }): Promise<string> => {
      seen.push(input.baseRevision);
      n += 1;
      return `rev-${n}`;
    },
  };
}

describe('the revision advances with every write', () => {
  it('bases the second write on what the first one produced', async () => {
    // The whole defect, in three lines: this used to send `rev-0` twice.
    const api = server();
    const chain = revisionChain(api.write, 'rev-0');

    await chain.write('- [x] one');
    await chain.write('- [x] one\n- [x] two');

    expect(api.seen).toEqual(['rev-0', 'rev-1']);
    expect(chain.current).toBe('rev-2');
  });

  it('keeps advancing over a long checklist', async () => {
    const api = server();
    const chain = revisionChain(api.write, 'rev-0');

    for (let i = 0; i < 5; i++) await chain.write(`tick ${i}`);

    expect(api.seen).toEqual(['rev-0', 'rev-1', 'rev-2', 'rev-3', 'rev-4']);
  });

  it('starts from nothing when the slot has never been written', async () => {
    // A Guidance or a Template that does not exist yet is based on null.
    const api = server();
    const chain = revisionChain(api.write, null);

    await chain.write('the first content');

    expect(api.seen).toEqual([null]);
    expect(chain.current).toBe('rev-1');
  });
});

describe('a failed write retires nothing', () => {
  it('keeps the revision in hand, so a retry is based on the right one', async () => {
    const refuse = vi.fn().mockRejectedValue(new Error('refused'));
    const chain = revisionChain(refuse, 'rev-0');

    await expect(chain.write('- [x] one')).rejects.toThrow('refused');

    // Adopting on failure would base the retry on a revision that was never
    // created, and every later write would conflict for good.
    expect(chain.current).toBe('rev-0');
  });

  it('recovers on the next successful write', async () => {
    const attempts: Array<string | null> = [];
    let first = true;
    const flaky = async (input: { raw: string; baseRevision: string | null }): Promise<string> => {
      attempts.push(input.baseRevision);
      if (first) {
        first = false;
        throw new Error('offline');
      }
      return 'rev-1';
    };
    const chain = revisionChain(flaky, 'rev-0');

    await expect(chain.write('x')).rejects.toThrow('offline');
    await chain.write('x');

    expect(attempts).toEqual(['rev-0', 'rev-0']);
    expect(chain.current).toBe('rev-1');
  });
});

describe('a reload wins over what this session wrote', () => {
  it('takes the revision the server states', async () => {
    const api = server();
    const chain = revisionChain(api.write, 'rev-0');
    await chain.write('mine');

    // Somebody else wrote, the document was reloaded, and the revision that
    // comes with it is the truth.
    chain.reset('rev-from-somebody-else');
    await chain.write('mine again');

    expect(api.seen).toEqual(['rev-0', 'rev-from-somebody-else']);
  });
});
