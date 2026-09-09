/**
 * The two lists this repository keeps beside the profile, and the invariants
 * that keep them from becoming lies.
 *
 * Until specification v0.4.0 neither existed: the scope of the two hand-written
 * guards was read from `entry.ring`, and what the product deliberately does
 * not read was read from `entry.recognised`. Both fields are gone, both
 * decisions survived them, and both are now written here — which means both
 * can now drift from the profile in a way a field never could.
 *
 * That is what this file is for. A list transcribed from a specification is
 * exactly the failure `markdown.ts` exists to avoid, so the two that had to be
 * written by hand are pinned to the profile by assertion instead.
 */

import { describe, expect, it } from 'vitest';
import {
  DECLARED_SILENCE,
  DELEGATED_TO_THE_BASE_PARSER,
  MARKDOWN_SPEC_SOURCES,
  MARKDOWN_SPEC_VERSION,
  RECOGNISED_NOTATION,
} from '../src/markdown.js';

const DECLARED = new Set(RECOGNISED_NOTATION.map((entry) => entry.id));

describe('the profile, as this build reads it', () => {
  it('carries a version, an address and a notation', () => {
    expect(MARKDOWN_SPEC_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(RECOGNISED_NOTATION.length).toBeGreaterThan(0);
  });

  it('credits every source, and admits one without a version', () => {
    // Obsidian publishes documentation rather than a versioned specification,
    // and the schema made `version` optional in v0.4.0 to say so. Reading it
    // as required is how `Obsidian undefined` reached the skill.
    expect(MARKDOWN_SPEC_SOURCES.length).toBeGreaterThan(0);
    for (const source of MARKDOWN_SPEC_SOURCES) {
      expect(source.name, JSON.stringify(source)).toBeTruthy();
      expect(source.url, source.name).toMatch(/^https?:\/\//);
      if (source.version !== undefined) expect(source.version).toBeTruthy();
    }
  });
});

describe('the notation delegated to the base parser', () => {
  it('names only forms the profile actually declares', () => {
    // A stale id excludes nothing and looks like it excludes something, which
    // is the quiet way this list stops matching the profile: the entry is
    // renamed upstream, the guards start demanding it, and the reason it is
    // exempt is still sitting here saying otherwise.
    const unknown = [...DELEGATED_TO_THE_BASE_PARSER].filter((id) => !DECLARED.has(id));
    expect(unknown).toEqual([]);
  });

  it('leaves something for the two scoped guards to prove', () => {
    // If a later profile moved everything under this list, both guards would
    // pass by having nothing to check. They are asked for what the profile
    // ADDS, and a version where it adds nothing is not one to fail silently on.
    expect(DELEGATED_TO_THE_BASE_PARSER.size).toBeLessThan(RECOGNISED_NOTATION.length);
  });
});

describe('the forms this product is silent about', () => {
  it('is not silent about anything the profile declares', () => {
    // The one way these two lists can contradict each other. If a later
    // version of the profile declares `#subject` or a subscript, this list is
    // what has to change — and it says so out loud rather than serving an
    // agent a rejection the specification no longer makes.
    const contradicted = DECLARED_SILENCE.filter((entry) => DECLARED.has(entry.id));
    expect(contradicted.map((entry) => entry.id)).toEqual([]);
  });

  it('says what to write instead, because a rejection alone teaches nothing', () => {
    // Each effect is served to an agent verbatim. A prohibition with no
    // alternative beside it is where an agent invents one.
    for (const entry of DECLARED_SILENCE) {
      expect(entry.syntax, entry.id).toBeTruthy();
      expect(entry.example, entry.id).toBeTruthy();
      expect(entry.effect.length, entry.id).toBeGreaterThan(80);
    }
  });

  it('exercises its own form in its own example', () => {
    // The examples are used verbatim by the reading-surface guard, so an
    // example that does not contain the form would assert nothing at all.
    const carries: Record<string, RegExp> = {
      'inline-tag': /(^|\s)#[a-z]/m,
      'sub-sup': /~[^~\s]+~|\^[^\s^]+\^/,
    };

    for (const entry of DECLARED_SILENCE) {
      const pattern = carries[entry.id];
      expect(pattern, `no shape written for the silence "${entry.id}"`).toBeDefined();
      expect(pattern?.test(entry.example), entry.id).toBe(true);
    }
  });
});
