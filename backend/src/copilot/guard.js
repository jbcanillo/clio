const escapeText = (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Wraps note text so the model sees it as quoted data. Every `<` and `>` in the
 * text is escaped, so a note can never close the wrapper or open a fake one.
 */
export function wrapNoteContent(hit, text) {
  return `<note_content source="${escapeAttr(hit.path)}" private="${hit.private ? 'true' : 'false'}">${escapeText(text)}</note_content>`;
}
