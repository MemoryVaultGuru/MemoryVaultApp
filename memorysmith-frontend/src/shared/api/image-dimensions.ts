/**
 * The pipe inside the alt text of an image, which separates the description
 * from the dimensions (§3.14, RN-DSC-048).
 *
 * `![Engelbart|100x145](engelbart.jpg)` is 100 by 145 CSS pixels and
 * `![Engelbart|100](…)` is 100 wide with the aspect ratio kept. What precedes
 * the pipe is the **description** and is never dropped — it is what a person
 * gets when the image does not load, and it is what a screen reader says.
 *
 * **A value that is neither form is not a dimension.** `![Engelbart|large](…)`
 * keeps `Engelbart|large` as the whole description, because deleting what an
 * author wrote into an accessibility label is the worse of the two failures.
 * Until the specification declared this form, an imported note displayed the
 * pipe and the digits on screen and mandated the whole string as the label.
 */

export interface ImageAlt {
  /** What a reader hears, and sees when the image does not load. */
  readonly description: string;
  readonly width: number | null;
  readonly height: number | null;
}

/** `100` or `100x145`, and nothing else. */
const DIMENSIONS = /^(\d{1,5})(?:x(\d{1,5}))?$/;

export function readImageAlt(alt: string): ImageAlt {
  const at = alt.lastIndexOf('|');
  if (at === -1) return { description: alt, width: null, height: null };

  const measured = DIMENSIONS.exec(alt.slice(at + 1).trim());
  if (!measured) return { description: alt, width: null, height: null };

  return {
    description: alt.slice(0, at).trim(),
    width: Number(measured[1]),
    height: measured[2] === undefined ? null : Number(measured[2]),
  };
}
