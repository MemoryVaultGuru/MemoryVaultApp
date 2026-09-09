/**
 * Entrypoint of the link reprojection (#102), run AFTER 0.6.0 is deployed.
 *
 * The fourth entrypoint on this bundle, next to `recount.ts`, and for the same
 * reason they are separate: it is triggered by an operator rather than by a
 * request or a stream, and it needs no session at all. Run it with
 * `deploy-aws/reproject-links.ps1`, as the third step of:
 *
 *   1. `deploy-aws/retitle-vaults.ps1`, against the version in production
 *   2. the deploy of 0.6.0
 *   3. this
 *
 * The projection in the table was built by the rule that just retired, so it is
 * rebuilt rather than repaired: an edge exists because the current rule says
 * so, and not because an old projection said so. What the rebuild does, and why
 * the check after it is "no edge is lost" rather than "the same edges", is in
 * `services/discovery/src/adapters/reprojection.ts`.
 *
 * It reports before it writes and writes only with `--apply`, because a job
 * that silently replaces a graph nobody looked at is how a wrong graph becomes
 * the new truth.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { SubscriptionId } from '@memorysmith/kernel';
import { DynamoLinkGraph } from '@memorysmith/svc-discovery/adapters/aws';
import {
  LinkReprojection,
  type PlannedEdge,
  type VaultPlan,
} from '@memorysmith/svc-discovery/adapters/reprojection';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** A note as a person reads it in the report, never as the table stores it. */
function naming(plan: VaultPlan): (noteId: string) => string {
  const titles = new Map(plan.notes.map((note) => [note.noteId, note.title]));
  return (noteId) => titles.get(noteId) || `(untitled ${noteId.slice(-6)})`;
}

function describe(edge: PlannedEdge, name: (noteId: string) => string): string {
  const because = edge.by === 'alias' ? `alias "${edge.target}"` : `title "${edge.target}"`;
  return `${name(edge.from)} -> ${name(edge.to)}  (${because})`;
}

function print(plan: VaultPlan): void {
  const name = naming(plan);
  console.log('');
  console.log(`  vault ${plan.vaultId}  (${plan.notes.length} notes)`);
  console.log(`    edges before          ${plan.before}`);
  console.log(`    edges after           ${plan.after.length}`);
  console.log(`    links left pending    ${plan.pending}`);

  if (plan.gained.length > 0) {
    console.log('    edges the current rule finds and the old projection did not:');
    for (const edge of plan.gained) console.log(`      ${describe(edge, name)}`);
  }
  if (plan.lost.length > 0) {
    // Not a warning that can be waved through: the retitling migration exists
    // precisely so this list is empty, and an entry in it is a link that stopped
    // resolving.
    console.log('    EDGES LOST, which the migration was supposed to prevent:');
    for (const edge of plan.lost) console.log(`      ${name(edge.from)} -> ${name(edge.to)}`);
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const write = argv.includes('--apply');
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const s3 = new S3Client({});
  const discoveryTable = required('DISCOVERY_TABLE');
  const bucket = required('CONTENT_BUCKET');

  const reprojection = new LinkReprojection({
    db,
    knowledgeTable: required('KNOWLEDGE_TABLE'),
    graphFor: (subscriptionId: SubscriptionId) =>
      new DynamoLinkGraph(subscriptionId, db, discoveryTable),
    contentFor: (subscriptionId: SubscriptionId) => ({
      read: async (ref) => {
        const response = await s3.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: `s/${subscriptionId.value}/c/${ref.contentId}.md`,
            VersionId: ref.versionId,
          }),
        );
        return (await response.Body?.transformToString('utf-8')) ?? '';
      },
    }),
  });

  const plans = await reprojection.plan();
  if (plans.length === 0) {
    console.log('No vault holds a note yet: there is no graph to rebuild.');
    return 0;
  }

  for (const plan of plans) print(plan);

  const lost = plans.reduce((total, plan) => total + plan.lost.length, 0);
  const gained = plans.reduce((total, plan) => total + plan.gained.length, 0);
  console.log('');
  console.log(`${plans.length} vault(s): ${gained} edge(s) gained, ${lost} lost.`);

  if (!write) {
    console.log('\nDry run: nothing was written. Pass --apply to rebuild these graphs.');
    return 0;
  }

  for (const plan of plans) await reprojection.apply(plan);
  console.log(`\nRebuilt the link projection of ${plans.length} vault(s).`);
  // A lost edge is not a reason to refuse the rebuild — the projection was
  // already wrong — but it IS the one number whoever ran the release has to
  // look at, so it decides the exit code.
  return lost > 0 ? 2 : 0;
}

const invokedDirectly = process.argv[1]?.endsWith('reproject.ts') === true;
if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
