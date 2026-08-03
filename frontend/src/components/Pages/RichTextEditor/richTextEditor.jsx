// => components/Pages/RichTextEditor/richTextEditor.jsx
// => Shared WYSIWYG core used by all three Pages editors (Announcements,
//    Privacy Policy, FAQ answers). Custom-built - contentEditable + our
//    own toolbar, no external rich-text library.
// => Toolbar is intentionally limited to what Pages needs: Bold, Italic,
//    Underline, Ordered/Unordered list, Insert Image (jpg/png only,
//    stored as inline base64 - see MAX_IMAGE_BYTES below).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import './richTextEditor.css';

import boldIcon from '../../../assets/icons/bold.png';
import italicIcon from '../../../assets/icons/italic.png';
import underlineIcon from '../../../assets/icons/underline.png';
import listOrderedIcon from '../../../assets/icons/list-ordered.png';
import listUnorderedIcon from '../../../assets/icons/list-unordered.png';
import imageIcon from '../../../assets/icons/image.png';
import warningIcon from '../../../assets/icons/warning.png';

// => 500KB cap per image - base64 inflates this by ~33% once embedded in
//    the saved HTML, and these pages don't need per-student-document-grade
//    file sizes, just logos/screenshots/small graphics
const MAX_IMAGE_BYTES = 500 * 1024;

// => Preset widths for the floating image toolbar - typed px value in the
//    input covers the "dynamic sizes" requirement, these are just shortcuts
const IMAGE_SIZE_PRESETS = [
  { label: 'S', width: 200 },
  { label: 'M', width: 400 },
  { label: 'L', width: 600 },
  { label: 'Full', width: null }, // => null => 100% width, resizes with the container
];

// => Chrome/Edge/Brave's execCommand wraps Bold/Italic in <b>/<i> by
//    default - visually identical to <strong>/<em> but not semantic, and
//    critically NOT in the server's sanitize-html whitelist (see
//    services/Pages/htmlSanitizer.js on the backend), which only allows
//    the semantic tags for screen-reader correctness. Without this,
//    sanitizeEditorHtml() strips <b>/<i> entirely on save - the tag is
//    discarded but the plain text survives, which is exactly why Bold and
//    Italic formatting silently vanished after saving while Underline
//    (already <u>, already whitelisted) didn't.
const normalizeSemanticTags = (html) =>
  html
    .replace(/<b(\s[^>]*)?>/gi, '<strong$1>')
    .replace(/<\/b>/gi, '</strong>')
    .replace(/<i(\s[^>]*)?>/gi, '<em$1>')
    .replace(/<\/i>/gi, '</em>');

export default function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);

  // => Starts as undefined (not `value`) on purpose - that forces the
  //    very first effect run below to actually sync the initial content
  //    into the DOM, instead of skipping it because "nothing changed"
  const lastExternalValue = useRef(undefined);

  // => Chrome/Edge/Brave default to wrapping each new line in <div> on
  //    Enter - 'div' isn't in the sanitizer's whitelist (only 'p' is), so
  //    without this, every line break silently disappeared on save,
  //    concatenating separate lines into one. This forces Enter to
  //    produce <p> instead, matching what the server already allows.
  //    Non-standard but supported in Chrome/Edge/Brave/Firefox; Safari
  //    ignores it and keeps using <div> regardless (see the sanitizer's
  //    'div' fallback below for that case).
  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  }, []);

  const [activeFormats, setActiveFormats] = useState({
    bold: false, italic: false, underline: false,
    insertOrderedList: false, insertUnorderedList: false,
  });
  const [selectedImage, setSelectedImage] = useState(null); // => the actual <img> DOM node currently selected, or null
  const [imageError, setImageError] = useState(null);
  const fileInputRef = useRef(null);

  // => Only re-sync the DOM when `value` changed from OUTSIDE this
  //    component (initial load, or the parent resetting the field) -
  //    never on our own onInput-triggered onChange, or every keystroke
  //    would blow away the cursor position
  useEffect(() => {
    if (editorRef.current && value !== lastExternalValue.current) {
      editorRef.current.innerHTML = value || '';
      lastExternalValue.current = value;
    }
  }, [value]);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const html = normalizeSemanticTags(editorRef.current.innerHTML);
    lastExternalValue.current = html; 
    onChange(html);
  }, [onChange]);

  // => Refreshes which toolbar buttons show as "active" based on the
  //    current cursor position / selection
  const refreshActiveFormats = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActiveFormats);
    return () => document.removeEventListener('selectionchange', refreshActiveFormats);
  }, [refreshActiveFormats]);

  const runCommand = (command) => {
    editorRef.current?.focus();
    document.execCommand(command, false, null);
    emitChange();
    refreshActiveFormats();
  };

  // => Opens the hidden file input - kept separate from the input itself
  //    so the visible toolbar button can be styled like the other buttons
  const handleImageButtonClick = () => {
    setImageError(null);
    fileInputRef.current?.click();
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // => allows picking the same file twice in a row
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setImageError('Only JPG and PNG images are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Image is too large - max 500KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      editorRef.current?.focus();
      // => data-resizable marks this img as one our floating toolbar can
      //    grab onto - insertHTML (not insertImage) so we control the tag
      document.execCommand(
        'insertHTML',
        false,
        `<img src="${reader.result}" data-resizable="true" style="width:400px;max-width:100%;" alt="" />`
      );
      emitChange();
    };
    reader.onerror = () => setImageError('Could not read that image file.');
    reader.readAsDataURL(file);
  };

  // => Clicking an inserted image selects it and shows the resize
  //    mini-toolbar; clicking anywhere else in the editor deselects
  const handleEditorClick = (e) => {
    if (e.target.tagName === 'IMG' && e.target.dataset.resizable) {
      setSelectedImage(e.target);
    } else {
      setSelectedImage(null);
    }
  };

  const handleSetImageWidth = (widthPx) => {
    if (!selectedImage) return;
    selectedImage.style.width = widthPx ? `${widthPx}px` : '100%';
    emitChange();
  };

  const handleImageWidthInput = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (!raw) return;
    handleSetImageWidth(Number(raw));
  };

  const handleDeleteImage = () => {
    if (!selectedImage) return;
    selectedImage.remove();
    setSelectedImage(null);
    emitChange();
  };

  return (
    <div className="rte-wrap">

      {/* ════════════════════════════════════
          TOOLBAR
          ════════════════════════════════════ */}
      <div className="rte-toolbar">
        <button
          type="button"
          className={`rte-toolbar-btn ${activeFormats.bold ? 'rte-toolbar-btn--active' : ''}`}
          onMouseDown={(e) => e.preventDefault()} // => stops the button click from stealing focus away from the editor before execCommand runs
          onClick={() => runCommand('bold')}
          title="Bold"
        >
          <img src={boldIcon} alt="Bold" />
        </button>
        <button
          type="button"
          className={`rte-toolbar-btn ${activeFormats.italic ? 'rte-toolbar-btn--active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('italic')}
          title="Italic"
        >
          <img src={italicIcon} alt="Italic" />
        </button>
        <button
          type="button"
          className={`rte-toolbar-btn ${activeFormats.underline ? 'rte-toolbar-btn--active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('underline')}
          title="Underline"
        >
          <img src={underlineIcon} alt="Underline" />
        </button>

        <span className="rte-toolbar-divider" />

        <button
          type="button"
          className={`rte-toolbar-btn ${activeFormats.insertOrderedList ? 'rte-toolbar-btn--active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('insertOrderedList')}
          title="Numbered list"
        >
          <img src={listOrderedIcon} alt="Numbered list" />
        </button>
        <button
          type="button"
          className={`rte-toolbar-btn ${activeFormats.insertUnorderedList ? 'rte-toolbar-btn--active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('insertUnorderedList')}
          title="Bulleted list"
        >
          <img src={listUnorderedIcon} alt="Bulleted list" />
        </button>

        <span className="rte-toolbar-divider" />

        <button
          type="button"
          className="rte-toolbar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleImageButtonClick}
          title="Insert image (JPG/PNG)"
        >
          <img src={imageIcon} alt="Insert image" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          style={{ display: 'none' }}
          onChange={handleImageFileChange}
        />
      </div>

      {imageError && (
        <p className="rte-error"><img className="rte-error-icon" src={warningIcon} alt="" /> {imageError}</p>
      )}

      {/* ════════════════════════════════════
          FLOATING IMAGE RESIZE TOOLBAR
          => Only shows while an inserted image is selected
          ════════════════════════════════════ */}
      {selectedImage && (
        <div className="rte-image-toolbar">
          <span className="rte-image-toolbar-label">Image width</span>
          {IMAGE_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="rte-image-preset-btn"
              onClick={() => handleSetImageWidth(preset.width)}
            >
              {preset.label}
            </button>
          ))}
          <input
            type="text"
            className="rte-image-width-input"
            placeholder="px"
            onChange={handleImageWidthInput}
          />
          <button type="button" className="rte-image-delete-btn" onClick={handleDeleteImage}>
            Remove image
          </button>
        </div>
      )}

      {/* ════════════════════════════════════
          EDITABLE CONTENT AREA
          ════════════════════════════════════ */}
      <div
        ref={editorRef}
        className="rte-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || ''}
        onInput={emitChange}
        onClick={handleEditorClick}
        onKeyUp={refreshActiveFormats}
      />
    </div>
  );
}