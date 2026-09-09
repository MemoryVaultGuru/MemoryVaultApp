/**
 * A target that names a file rather than a note: an attachment, addressed by
 * its whole name, extension included (§5.8).
 *
 * **This product stores no attachment**, so the reference resolves to nothing.
 * That is not an error and the specification says exactly what it is: reported
 * the way a pending link is (RN-DSC-049). What it must not be is what it was —
 * a `![[diagram.png]]` fell through the wikilink path and was drawn as a link
 * to a note nobody will ever write, telling the reader the wrong thing about
 * their own vault.
 *
 * The extension is what tells a file from a title, and a title may carry a
 * dot: this is the list of what a vault actually keeps beside its notes, so
 * `Lei 14.133` is a note and `engelbart.jpg` is not.
 */
const ATTACHMENT =
  /\.(png|jpe?g|gif|webp|svg|bmp|ico|pdf|mp4|webm|mov|mp3|wav|ogg|csv|xlsx?|docx?|pptx?|zip|txt|json|ya?ml)$/i;

export function isAttachmentName(target: string): boolean {
  return ATTACHMENT.test(target.trim());
}
