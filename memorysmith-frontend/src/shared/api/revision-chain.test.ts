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

/**
 * A landed write is announced, so the surface can drop what it holds (#79).
 *
 * The screen used to keep showing the content it was rendered with: with
 * `staleTime: Infinity` a query is never refetched on its own, and only a
 * conflict invalidated anything. Leaving a note after ticking a box and
 * coming back showed the state from before the edit, while the server had
 * had the new one all along.
 *
 * The announcement is what the surface listens to, and this is the shape of
 * it: it happens after the write resolves, and never after one that failed.
 */
describe('a write that lands is announced, and one that fails is not', () => {
  it('announces once per landed write, after it resolved', async () => {
    const order: string[] = [];
    const api = server();
    const chain = revisionChain(
      async (input) => {
        order.push('write');
        return api.write(input);
      },
      'rev-0',
      () => order.push('announce'),
    );

    await chain.write('one');
    await chain.write('two');

    expect(order).toEqual(['write', 'announce', 'write', 'announce']);
  });

  it('does not announce a write that never landed', async () => {
    // Nothing landed, so there is nothing for the surface to read back, and
    // announcing would make it drop the draft in favour of stale content.
    const announced = vi.fn();
    const chain = revisionChain(
      vi.fn().mockRejectedValue(new Error('refused')),
      'rev-0',
      announced,
    );

    await expect(chain.write('x')).rejects.toThrow('refused');

    expect(announced).not.toHaveBeenCalled();
  });

  it('works without an announcement, for a caller that does not need one', () => {
    expect(() => revisionChain(vi.fn(), 'rev-0')).not.toThrow();
  });
});

/**
 * A write made on the way out (#81).
 *
 * The pending flush ran in the cleanup of a React effect, and `F5`, a closed
 * tab and a switched-away app are none of those: the browser leaves, the
 * effect never runs, and the click is gone. Which made reloading to check
 * whether it saved a gamble — the reload used to find out could be what
 * destroyed it.
 */
describe('a write on the way out is made so the browser can finish it', () => {
  it('carries keepalive through to the request', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const chain = revisionChain(async (input) => {
      sent.push({ ...input });
      return 'rev-1';
    }, 'rev-0');

    await chain.write('leaving now', { keepalive: true });

    expect(sent[0]).toMatchObject({ baseRevision: 'rev-0', keepalive: true });
  });

  it('does not set it on an ordinary write', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const chain = revisionChain(async (input) => {
      sent.push({ ...input });
      return 'rev-1';
    }, 'rev-0');

    await chain.write('an ordinary tick');

    expect(sent[0]).not.toHaveProperty('keepalive');
  });

  it('still advances the revision, so a write on the way out is a write', async () => {
    const chain = revisionChain(async () => 'rev-1', 'rev-0');

    await chain.write('leaving', { keepalive: true });

    expect(chain.current).toBe('rev-1');
  });
});
