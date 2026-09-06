/**
 * The reading surface classifies a frontmatter value by the SAME rule the
 * facet projector does: the form the author wrote, never the number of values
 * that form happens to hold (RN-DSC-020).
 *
 * The two implementations are separate on purpose — the frontend may not
 * import a service, and `splitFrontmatter` is a display reader while
 * `FacetExtractor` is a projection reader — so what keeps them honest is that
 * both are pinned to the same cases. A list of one item drawn as chips here
 * and counted as an enum there is one attribute with two identities, which is
 * exactly the defect this pins down.
 */

import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from './markdown';
import { propertyType } from '../components/PropertyValue';

const doc = (frontmatter: string): string => `---\n${frontmatter}\n---\n\nBody.\n`;

describe('a frontmatter value is classified by the form it was written in', () => {
  it('reads an inline list of one item as a list', () => {
    const { frontmatter, lists } = splitFrontmatter(doc('tags: [contracts]'));
    expect(lists.has('tags')).toBe(true);
    expect(propertyType(frontmatter['tags'] ?? '', lists.has('tags'))).toBe('list');
  });

  it('reads a dash list of one item as a list', () => {
    const { lists } = splitFrontmatter(doc('tags:\n  - contracts'));
    expect(lists.has('tags')).toBe(true);
  });

  it('keeps a scalar out of the lists, so it is not drawn as chips', () => {
    const { frontmatter, lists } = splitFrontmatter(doc('tags: contracts'));
    expect(lists.has('tags')).toBe(false);
    expect(propertyType(frontmatter['tags'] ?? '', false)).toBe('text');
  });

  it('does not change what an attribute is when a second value arrives', () => {
    const one = splitFrontmatter(doc('tags: [contracts]'));
    const two = splitFrontmatter(doc('tags: [contracts, budget]'));
    expect(one.lists.has('tags')).toBe(two.lists.has('tags'));
  });

  it('still tells a date and a boolean apart by their shape', () => {
    expect(propertyType('2026-09-06', false)).toBe('date');
    expect(propertyType('true', false)).toBe('checkbox');
  });
});
