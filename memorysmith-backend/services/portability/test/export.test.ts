/**
 * A vault leaves as ONE DOCUMENT (RN-PRT-009).
 *
 * It used to leave as a tree of `.md` files, and that was a one-way door:
 * everything a folder of files cannot hold was dropped at it — the identity of
 * a note, its fractional position, the description of a folder, the Guidance,
 * the Template, when each thing was written. What is asserted here is the
 * opposite property: the document holds exactly what the vault holds, and
 * **nothing the vault does not** (RN-PRT-010).
 */

import { describe, expect, it } from 'vitest';
import {
  archiveNameOf,
  buildVaultDocument,
  VAULT_DOCUMENT_VERSION,
  type ExportInput,
} from '../src/domain/VaultDocumentBuilder.js';
import { createZip } from '../src/adapters/zip.js';

const vault: ExportInput = {
  vaultName: 'Normas e Legislacao',
  vaultDescription: 'Texto normativo por artigo.',
  guidance: '# Proposito\n\nUma norma por nota.',
  folders: [
    {
      folderId: 'f1',
      parentFolderId: null,
      name: 'Normas',
      description: 'Texto normativo por artigo.',
      position: 'a0',
      templateContent: '# {{titulo}}\n\n## Vigencia',
    },
    {
      folderId: 'f2',
      parentFolderId: null,
      name: 'Achados',
      description: 'Achados de auditoria.',
      position: 'a1',
      templateContent: null,
    },
    {
      folderId: 'f3',
      parentFolderId: 'f2',
      name: '2026',
      description: 'Emitidos neste exercicio.',
      position: 'a0',
      templateContent: null,
    },
  ],
  notes: [
    {
      noteId: 'n1',
      folderId: 'f1',
      position: 'a0',
      createdAt: '2026-01-12T10:00:00.000Z',
      updatedAt: '2026-02-19T08:30:00.000Z',
      content: '---\ntitle: Lei 14.133\n---\n\n# A geral\n\nArt. 75.',
    },
    {
      noteId: 'n2',
      folderId: 'f1',
      position: 'a1',
      createdAt: '2026-01-13T10:00:00.000Z',
      updatedAt: '2026-01-13T10:00:00.000Z',
      content: 'Fundamento em [[Lei 14.133]].',
    },
  ],
};

const NOW = '2026-09-09T12:00:00.000Z';
const document = buildVaultDocument(vault, NOW, '0.6.0');

describe('the document carries the vault whole', () => {
  it('says what shape it is, and which specification wrote it', () => {
    // The one field an importer reads before anything else.
    expect(document.documentVersion).toBe(VAULT_DOCUMENT_VERSION);
    expect(document.specVersion).toBe('0.6.0');
    expect(document.exportedAt).toBe(NOW);
  });

  it('carries the vault, its guidance and every folder with its parent and position', () => {
    expect(document.vault).toEqual({
      name: 'Normas e Legislacao',
      description: 'Texto normativo por artigo.',
      guidance: '# Proposito\n\nUma norma por nota.',
    });
    expect(document.folders.map((folder) => [folder.folderId, folder.parentFolderId])).toEqual([
      ['f1', null],
      ['f2', null],
      ['f3', 'f2'],
    ]);
    // The order is a FIELD, not a numeric prefix in a file name: the fractional
    // key comes out exactly as it went in (RN-PRT-002, removed).
    expect(document.folders.map((folder) => folder.position)).toEqual(['a0', 'a1', 'a0']);
    expect(document.folders[0]?.template).toBe('# {{titulo}}\n\n## Vigencia');
    expect(document.folders[1]?.template).toBeNull();
  });

  it('carries every body byte for byte, frontmatter included', () => {
    expect(document.notes.map((note) => note.body)).toEqual(
      vault.notes.map((note) => note.content),
    );
  });

  it('never rewrites a link, because the body is copied and not processed', () => {
    // Rewriting destinations was correct while a link addressed a file, and it
    // is corruption now that it addresses a title (RN-PRT-004).
    expect(document.notes[1]?.body).toContain('[[Lei 14.133]]');
  });

  it('stores nothing derived: no title, no slug, no file name', () => {
    // RN-PRT-010. The title of `n1` is stated in its frontmatter and differs
    // from its heading, which is exactly the case a stored title would get
    // wrong the moment somebody edited one of the two.
    const serialised = JSON.stringify(document);
    for (const note of document.notes) {
      expect(Object.keys(note).sort()).toEqual([
        'body',
        'createdAt',
        'folderId',
        'noteId',
        'position',
        'updatedAt',
      ]);
    }
    expect(serialised).not.toContain('"title"');
    expect(serialised).not.toContain('"slug"');
    expect(serialised).not.toContain('.md');
  });

  it('keeps the dates each note states about itself', () => {
    expect(document.notes[0]?.createdAt).toBe('2026-01-12T10:00:00.000Z');
    expect(document.notes[0]?.updatedAt).toBe('2026-02-19T08:30:00.000Z');
  });
});

describe('the archive is one document with the extension of the format', () => {
  it('is named after the vault and ends in .vault', () => {
    expect(archiveNameOf('Normas e Legislacao')).toBe('Normas e Legislacao.vault');
    expect(archiveNameOf('a/b:c')).toBe('a-b-c.vault');
    expect(archiveNameOf('   ')).toBe('vault.vault');
  });

  it('zips into a container that is a real zip', () => {
    const archive = createZip(
      [{ path: 'vault.json', content: JSON.stringify(document) }],
      new Date(NOW),
    );
    expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(archive.includes(Buffer.from('vault.json'))).toBe(true);
  });
});
