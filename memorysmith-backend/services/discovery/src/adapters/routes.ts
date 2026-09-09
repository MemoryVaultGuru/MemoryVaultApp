/**
 * HTTP surface of svc-discovery (architecture-guide.md, section 14.1):
 *
 *   GET  /vaults/:v/graph
 *   GET  /vaults/:v/notes/:n/graph?depth=
 *   GET  /vaults/:v/notes/:n/backlinks
 *   GET  /vaults/:v/links/:target      what one wikilink target resolves to
 *   GET  /vaults/:v/health
 *   GET  /vaults/:v/facets
 *   POST /vaults/:v/search   { query }   lexical, over titles and folders
 *
 * Every route reads a projection. None of them touches a note, and none of
 * them is consulted by the Knowledge context (RN-DSC-017).
 */

import { Hono, type Context } from 'hono';
import {
  DomainError,
  httpStatusFor,
  type Result,
  type SubscriptionContext,
} from '@memorysmith/kernel';
import type {
  Backlinks,
  GetFacetStats,
  RelatedNotes,
  ResolveLinkTarget,
  SearchNotes,
  VaultGraphQuery,
  VaultHealth,
} from '../application/queries.js';

export interface DiscoveryRequest {
  readonly subscription: SubscriptionContext;
  /**
   * Whether the caller may read that vault. Discovery holds no vault, so the
   * decision belongs to the context that owns it, and it arrives as a
   * question this request can ask (section 14.2).
   */
  readonly canRead: (vaultId: string) => Promise<boolean>;
}

export interface DiscoveryUseCases {
  readonly related: (request: DiscoveryRequest) => RelatedNotes;
  readonly backlinks: (request: DiscoveryRequest) => Backlinks;
  readonly resolveLinkTarget: (request: DiscoveryRequest) => ResolveLinkTarget;
  readonly health: (request: DiscoveryRequest) => VaultHealth;
  readonly graph: (request: DiscoveryRequest) => VaultGraphQuery;
  readonly search: (request: DiscoveryRequest) => SearchNotes;
  readonly facets: (request: DiscoveryRequest) => GetFacetStats;
}

type Variables = { discovery: DiscoveryRequest };

function fail(c: Context, error: DomainError): Response {
  return c.json({ code: error.code, message: error.message }, httpStatusFor(error) as 400);
}

function present<T, U>(c: Context, result: Result<T, DomainError>, map: (value: T) => U): Response {
  return result.ok ? c.json(map(result.value) as object, 200) : fail(c, result.error);
}

/** A vault the caller cannot read is indistinguishable from a missing one. */
async function guard(request: DiscoveryRequest, vaultId: string): Promise<DomainError | null> {
  return (await request.canRead(vaultId)) ? null : DomainError.forbidden('Vault not found');
}

export function createDiscoveryRoutes(useCases: DiscoveryUseCases): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();

  /**
   * The whole link graph of the vault. It is a different question from the
   * route below, which walks OUT from one note under a depth ceiling: here
   * there is no root, and the ceiling is on how many notes come back.
   */
  app.get('/vaults/:v/graph', async (c) => {
    const request = c.get('discovery');
    const vaultId = c.req.param('v') ?? '';
    const denied = await guard(request, vaultId);
    if (denied) return fail(c, denied);

    const graph = await useCases.graph(request).execute({ vaultId });
    return present(c, graph, (value) => value);
  });

  app.get('/vaults/:v/notes/:n/graph', async (c) => {
    const request = c.get('discovery');
    const vaultId = c.req.param('v') ?? '';
    const denied = await guard(request, vaultId);
    if (denied) return fail(c, denied);

    const depth = Number(c.req.query('depth') ?? '2');
    const tree = await useCases.related(request).execute({
      vaultId,
      noteId: c.req.param('n') ?? '',
      ...(Number.isFinite(depth) ? { depth } : {}),
    });
    return present(c, tree, (node) => node);
  });

  app.get('/vaults/:v/notes/:n/backlinks', async (c) => {
    const request = c.get('discovery');
    const vaultId = c.req.param('v') ?? '';
    const denied = await guard(request, vaultId);
    if (denied) return fail(c, denied);

    const found = await useCases
      .backlinks(request)
      .execute({ vaultId, noteId: c.req.param('n') ?? '' });
    return present(c, found, (backlinks) => ({ backlinks }));
  });

  /**
   * The target is percent-decoded by the router before it reaches here, which
   * is the first of the three steps §5.2 fixes; the other two — NFC and
   * case-exact — belong to the resolver, so both surfaces compare the same
   * way (RN-DSC-056).
   */
  app.get('/vaults/:v/links/:target', async (c) => {
    const request = c.get('discovery');
    const vaultId = c.req.param('v') ?? '';
    const denied = await guard(request, vaultId);
    if (denied) return fail(c, denied);

    const resolved = await useCases
      .resolveLinkTarget(request)
      .execute({ vaultId, target: c.req.param('target') ?? '' });
    return present(c, resolved, (answer) => answer);
  });

  app.get('/vaults/:v/health', async (c) => {
    const request = c.get('discovery');
    const vaultId = c.req.param('v') ?? '';
    const denied = await guard(request, vaultId);
    if (denied) return fail(c, denied);

    const health = await useCases.health(request).execute({ vaultId });
    return present(c, health, (value) => ({
      brokenLinks: value.broken,
      orphans: value.orphans,
      pendingLinks: value.broken,
    }));
  });

  app.get('/vaults/:v/facets', async (c) => {
    const request = c.get('discovery');
    const vaultId = c.req.param('v') ?? '';
    const denied = await guard(request, vaultId);
    if (denied) return fail(c, denied);

    const stats = await useCases.facets(request).execute({ vaultId });
    return present(c, stats, (value) => value);
  });

  app.post('/vaults/:v/search', async (c) => {
    const request = c.get('discovery');
    const vaultId = c.req.param('v') ?? '';
    const denied = await guard(request, vaultId);
    if (denied) return fail(c, denied);

    const body = (await c.req.json().catch(() => ({}))) as {
      query?: string;
      k?: number;
    };
    const found = await useCases.search(request).execute({
      vaultId,
      query: String(body.query ?? ''),
      ...(typeof body.k === 'number' ? { k: body.k } : {}),
    });
    return present(c, found, (hits) => ({ mode: 'lexical', hits }));
  });

  return app;
}
