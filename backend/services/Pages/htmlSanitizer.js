// => services/Pages/htmlSanitizer.js
// => Shared server-side sanitizer for anything saved from RichTextEditor.jsx
//    (announcements.message, later cms_pages.content and faqs.answer).
//    Whitelist matches exactly what the editor produces after the
//    b/i -> strong/em normalization on the frontend - nothing else gets
//    through, scripts/event handlers/iframes/unlisted tags are stripped.

import sanitizeHtml from 'sanitize-html';

// => 'div' included alongside 'p' as a cross-browser fallback - Safari
//    doesn't support the defaultParagraphSeparator override in
//    richTextEditor.jsx and always uses <div> for Enter regardless, so
//    without this a Safari-typed line break would still get silently
//    stripped on save the same way this whole bug started.
const ALLOWED_TAGS = ['strong', 'em', 'u', 'ol', 'ul', 'li', 'p', 'div', 'br', 'img'];

const ALLOWED_ATTRIBUTES = {
  img: ['src', 'style', 'alt'],
};

// => Only width/max-width in px or % - blocks position/behavior-altering styles
const ALLOWED_STYLES = {
  img: {
    width: [/^\d+(\.\d+)?(px|%)$/],
    'max-width': [/^\d+(\.\d+)?(px|%)$/],
  },
};

export function sanitizeEditorHtml(rawHtml) {
  if (!rawHtml) return '';
  return sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,
    // => Inserted images are base64 data URLs, not hosted files - the
    //    data: scheme is only opened up for <img src>, nowhere else
    allowedSchemesByTag: { img: ['data', 'http', 'https'] },
    allowVulnerableTags: false,
  });
}

// => Strips all tags to check if content is genuinely empty - an empty
//    contentEditable saves as "<p><br></p>", not ""
export function isEffectivelyEmptyHtml(html) {
  const stripped = sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, '')
    .trim();
  return stripped.length === 0;
}