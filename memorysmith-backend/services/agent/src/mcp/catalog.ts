/**
 * THE TOOL CATALOG IS THE PUBLIC CONTRACT OF THE PRODUCT
 * (software-vision.md, section 9.1). The internal API exists to serve the UI;
 * it is this surface that external clients consume, and it is this surface the
 * versioning policy protects.
 *
 * Two rules shape every entry here, and they are not stylistic:
 *
 *  - RN-AGT-009: every tool declares a human-readable title and a read-only or
 *    destructive hint. Those hints are what decide whether a client runs the
 *    call outright or asks the user first, so a tool without them costs
 *    friction on every single invocation.
 *  - RN-AGT-010: reading and writing never share a tool. There is no generic
 *    tool parameterized by operation, and the catalog is built so that it
 *    stays that way as the surface grows.
 */

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: {
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
    readonly idempotentHint?: boolean;
    readonly openWorldHint?: boolean;
  };
}

const vaultArgument = {
  type: 'string',
  description: 'Identifier of the vault, as returned by list_vaults.',
};

/**
 * Where the identifier comes from is part of the argument (RN-AGT-020). It is
 * printed next to the name of every folder in the vault context, so an agent
 * that created nothing addresses the tree just as well as the one that built it.
 */
const folderArgument = {
  type: 'string',
  description: 'Folder identifier, as get_vault_context prints it next to the folder name.',
};

const baseRevisionArgument = {
  type: ['string', 'null'],
  description:
    'The revision this write is based on, exactly as the matching read returned it, or null ' +
    'when nothing has been written to this slot yet. A divergence answers CONFLICT with the ' +
    'current content, so an edit is never lost in silence.',
};

function object(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}

export const TOOL_CATALOG: readonly ToolDefinition[] = [
  {
    name: 'whoami',
    title: 'Who you are, and how to write here',
    description:
      'Answers two questions at once: who this connection acts as, and how this product ' +
      'expects to be used. It names the person who authorized the connector, the connector ' +
      'itself, the subscription the token is fixed to and the vaults within reach, and then ' +
      'it lays out the reading path: the guidance of a vault, the folder tree with the ' +
      'purpose of each folder, and the template of the folder you are about to write in. ' +
      'Call it first when you do not know this vault yet.',
    inputSchema: object({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_skill',
    title: 'Read a skill: the method for a task',
    description:
      'Returns the written method for one task, by name. The names come from whoami, which ' +
      'indexes them, and a skill is meant to be read BEFORE the task, not after it went ' +
      'wrong. It teaches: it never validates and never writes anything.',
    inputSchema: object(
      {
        name: {
          type: 'string',
          description: 'Name of the skill, as whoami lists it. For example: design-vault.',
        },
      },
      ['name'],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_vaults',
    title: 'List vaults',
    description:
      'Lists the vaults this connector can reach, with their description and note count. ' +
      'Start here: every other tool takes a vault identifier from this list.',
    inputSchema: object({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_vault',
    title: 'Create a vault',
    description:
      'Creates a vault in this subscription. Write its guidance right after, with set_guidance: ' +
      'a vault without guidance tells the next agent nothing about how it wants to be written. ' +
      'If a vault with the same name already exists, this fails with ALREADY_EXISTS and returns ' +
      'the identifier of the existing one: no second vault is created and no suffix is invented, ' +
      'so a retry is safe.',
    inputSchema: object(
      {
        name: { type: 'string', description: 'Name of the vault; the slug is derived from it.' },
        description: {
          type: 'string',
          description: 'What this vault is for, in one line. It is shown wherever it is listed.',
        },
      },
      ['name', 'description'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'delete_vault',
    title: 'Delete a vault',
    description:
      'Removes a vault from every listing. It is REVERSIBLE and destroys nothing: the folders, ' +
      'the notes and every past revision stay exactly where they are, and the history remains ' +
      'readable. Only the owner of the subscription may do this, and it takes the whole vault ' +
      'out of reach at once, so confirm with the person before calling it.',
    inputSchema: object({ vault: vaultArgument }, ['vault']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: 'get_vault_context',
    title: 'Read the vault context',
    description:
      'THE MAIN CALL. Returns the guidance of the vault in full, followed by its folder tree ' +
      'with the identifier of each folder, its description, the defined order, the note count ' +
      'and which folders carry a template. Read this before writing anything: the guidance ' +
      'declares the conventions of this vault, the folder descriptions say what belongs where, ' +
      'and the identifiers are what you pass to get_template, create_note and list_notes.',
    inputSchema: object({ vault: vaultArgument }, ['vault']),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_guidance',
    title: 'Read the guidance of a vault, with its revision',
    description:
      'The guidance as it is stored, plus the revision to pass back as baseRevision when you ' +
      'replace it. get_vault_context shows the guidance inside a composed document, which is ' +
      'what you read to understand the vault; this is what you read to WRITE it.',
    inputSchema: object({ vault: vaultArgument }, ['vault']),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'set_guidance',
    title: 'Write the guidance of a vault',
    description:
      'Replaces the guidance of a vault, which is the document that declares how THIS vault ' +
      'wants to be written: its conventions, its vocabulary, what belongs in it and what does ' +
      'not. It is read by every agent that writes here, so write it for one, in Markdown, and ' +
      'read the current one with get_guidance, which also gives you the baseRevision.',
    inputSchema: object(
      {
        vault: vaultArgument,
        content: { type: 'string', description: 'The complete guidance, in Markdown.' },
        baseRevision: baseRevisionArgument,
      },
      ['vault', 'content', 'baseRevision'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: 'create_folder',
    title: 'Create a folder',
    description:
      'Creates a folder in a vault. The description is REQUIRED and is not decoration: it is ' +
      'what tells the next agent what belongs in this folder, and it travels in every reading ' +
      'of the vault context. Pass parent to nest it under another folder.',
    inputSchema: object(
      {
        vault: vaultArgument,
        name: { type: 'string', description: 'Name of the folder.' },
        description: {
          type: 'string',
          description: 'What belongs in this folder. Required, and read by whoever writes here.',
        },
        parent: {
          type: 'string',
          description:
            'Optional: identifier of the folder this one goes under, as get_vault_context ' +
            'prints it next to the folder name.',
        },
      },
      ['vault', 'name', 'description'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'delete_folder',
    title: 'Delete a folder',
    description:
      'Removes a folder from the tree of a vault. There is NO implicit policy: with ' +
      'REJECT_IF_NOT_EMPTY a folder that holds subfolders or notes is refused, and with CASCADE ' +
      'the whole subtree goes. Call get_vault_context first to see what the folder holds, and ' +
      'confirm with the person before cascading.',
    inputSchema: object(
      {
        vault: vaultArgument,
        folder: folderArgument,
        policy: {
          type: 'string',
          enum: ['REJECT_IF_NOT_EMPTY', 'CASCADE'],
          description: 'Required. What to do when the folder is not empty.',
        },
      },
      ['vault', 'folder', 'policy'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: 'get_template',
    title: 'Read the folder template',
    description:
      'Returns the template of a folder, which is the suggested layout of the notes kept ' +
      'there. Call this before create_note whenever the folder has one; the server does not ' +
      'validate content against it, so following it is what keeps the vault coherent.',
    inputSchema: object({ vault: vaultArgument, folder: folderArgument }, ['vault', 'folder']),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'set_template',
    title: 'Write the template of a folder',
    description:
      'Replaces the template of a folder, which is the suggested layout of the notes kept there. ' +
      'The server does not validate any note against it, so what it buys is coherence, not ' +
      'enforcement: write the skeleton a good note in this folder would follow.',
    inputSchema: object(
      {
        vault: vaultArgument,
        folder: folderArgument,
        content: { type: 'string', description: 'The template, in Markdown.' },
        baseRevision: baseRevisionArgument,
      },
      ['vault', 'folder', 'content', 'baseRevision'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: 'list_notes',
    title: 'List notes',
    description:
      'Index of the notes of a vault, or of a single folder, in the ORDER DEFINED by whoever ' +
      'authored the vault. The order is content, not decoration: it says where to start.',
    inputSchema: object(
      {
        vault: vaultArgument,
        folder: {
          type: 'string',
          description:
            'Optional: restrict to one folder, by the identifier get_vault_context prints.',
        },
      },
      ['vault'],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'read_note',
    title: 'Read a note',
    description:
      'Returns the complete Markdown of a note and its current revision. With asOf, returns ' +
      'the revision that was in force on that date, rebuilt from the audit trail, which is ' +
      'what lets a past piece of work be redone against the base as it stood then.',
    inputSchema: object(
      {
        vault: vaultArgument,
        note: { type: 'string', description: 'Note identifier.' },
        asOf: {
          type: 'string',
          description: 'Optional ISO 8601 date. Returns the revision in force at that moment.',
        },
      },
      ['vault', 'note'],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_note',
    title: 'Create a note',
    description:
      'Creates a note in a folder. Read get_template for that folder first. There is no title ' +
      'argument: the title is what the content says, read from `title:` in the frontmatter and ' +
      'otherwise from the first level-1 heading. State it in the frontmatter rather than ' +
      'leaving it to a heading you may not write. THIS TOOL ALWAYS CREATES: calling it twice ' +
      'writes two notes, because a vault may hold two notes with one title, so a retry after a ' +
      'transport failure is NOT safe. Read the note back before retrying.',
    inputSchema: object(
      {
        vault: vaultArgument,
        folder: {
          type: 'string',
          description:
            'Folder that will hold the note, by the identifier get_vault_context prints ' +
            'next to its name.',
        },
        content: { type: 'string', description: 'The Markdown body of the note.' },
      },
      ['vault', 'folder', 'content'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'update_note',
    title: 'Update a note',
    description:
      'Replaces the body of a note. baseRevision is REQUIRED and must be the revision you read: ' +
      'if the note changed meanwhile, this fails with CONFLICT and returns the current content, ' +
      'so you can choose between redoing and merging. Blind overwrite is not accepted. This is ' +
      'also how a note is retitled: the title is read from the content, so changing `title:` in ' +
      'the frontmatter, or the first level-1 heading, is what renames it.',
    inputSchema: object(
      {
        vault: vaultArgument,
        note: { type: 'string', description: 'Note identifier.' },
        content: { type: 'string', description: 'The new Markdown body.' },
        baseRevision: {
          type: 'string',
          description: 'The revision this edit is based on, as returned by read_note.',
        },
      },
      ['vault', 'note', 'content', 'baseRevision'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: 'delete_note',
    title: 'Delete a note',
    description:
      'Removes a note from the listings and from the search. It is REVERSIBLE and destroys no ' +
      'byte: the history of the note stays readable by its identifier, and the links that ' +
      'pointed at it become pending rather than lost.',
    inputSchema: object(
      { vault: vaultArgument, note: { type: 'string', description: 'Note identifier.' } },
      ['vault', 'note'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: 'search_notes',
    title: 'Search notes by text',
    description:
      'Searches the text of a vault: the body of every note, its title, its folder and its ' +
      'headings. Matching is literal and by substring, accents and case ignored, so a term ' +
      'written once inside one note is found by typing part of it. It does NOT search by ' +
      'meaning: a note that discusses a subject in other words will not come back. ' +
      'The query accepts: several terms (all must match), "an exact phrase", -exclusion, ' +
      'OR, parentheses, and the fields title:, folder:, content: and section:. ' +
      'Any other prefix is read as a frontmatter attribute of the vault, so maturity:evergreen ' +
      'or tags:audit work when the vault writes them; call get_vault_context to learn which ' +
      'attributes this vault actually uses.',
    inputSchema: object(
      {
        vault: vaultArgument,
        query: {
          type: 'string',
          description: 'What to look for. Supports fields, quotes, -exclusion, OR and groups.',
        },
      },
      ['vault', 'query'],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'related_notes',
    title: 'Read the dependency tree of a note',
    description:
      'Walks the link graph from a note and returns the tree of notes it depends on. In a ' +
      'regulated vault this is the trail of grounding: which norms a finding rests on. Depth ' +
      'is capped at 3 and the traversal at 200 nodes.',
    inputSchema: object(
      {
        vault: vaultArgument,
        note: { type: 'string', description: 'Note to start from.' },
        depth: { type: 'number', description: 'How many hops to follow, 1 to 3. Default 2.' },
      },
      ['vault', 'note'],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'backlinks',
    title: 'List what points at a note',
    description:
      'Returns the notes that link to this one, which is how a vault says what a note is used for.',
    inputSchema: object(
      { vault: vaultArgument, note: { type: 'string', description: 'Note identifier.' } },
      ['vault', 'note'],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'note_history',
    title: 'Read the history of a note',
    description:
      'The timeline of a note: who changed it, when, and with which agent. It survives the ' +
      'note changing folder and vault, because it is keyed by the note identifier.',
    inputSchema: object(
      { vault: vaultArgument, note: { type: 'string', description: 'Note identifier.' } },
      ['vault', 'note'],
    ),
    annotations: { readOnlyHint: true },
  },
];

/**
 * The reading path this product is built around, as tool names.
 *
 * It is declared here, next to the catalog, because `whoami` narrates it and a
 * narration that names a tool nobody implements is worse than no help at all.
 * `catalogIsWellFormed` checks that every step exists, so a rename breaks the
 * build instead of shipping a lie.
 */
export const READING_PATH = [
  'list_vaults',
  'get_vault_context',
  'get_template',
  'create_note',
] as const;

/** No tool enters the catalog without a title and a hint (RN-AGT-009). */
export function catalogIsWellFormed(): boolean {
  const named = new Set(TOOL_CATALOG.map((tool) => tool.name));
  return (
    TOOL_CATALOG.every(
      (tool) =>
        tool.title.length > 0 &&
        (tool.annotations.readOnlyHint !== undefined ||
          tool.annotations.destructiveHint !== undefined),
    ) && READING_PATH.every((step) => named.has(step))
  );
}
