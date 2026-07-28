// => components/DeleteButton/DeleteButton.jsx
// => Reusable delete button with a built-in confirmation step. Callers just
//    pass onDelete + a message - this component owns the ConfirmModal
//    wiring itself, so no detail page has to manually manage
//    showDeleteConfirm/deleting state every single time (that pattern was
//    duplicated across TesdaCourseDetail.jsx and FacilityDetail.jsx before this).
//
// => Two variants:
//    - variant="button" (default): full "Delete" text button, red outline.
//      Matches TesdaCourseDetail.css's .btn-delete - use for page-level
//      deletes (e.g. "Delete Course", "Delete Facility").
//    - variant="icon": small trash-icon-only button, for inline row-level
//      deletes (e.g. a competency table row). Matches TesdaCourseDetail's
//      .icon-btn + trash-icon pattern.
//
// => Props:
//    - onDelete       : async fn, called AFTER the admin confirms. Throw
//                        inside it to surface an error (caught below).
//    - confirmMessage  : string shown in the ConfirmModal
//    - label           : button text for variant="button" (default "Delete")
//    - disabled        : bool
//
// => REQUIRED IMPORT you'll need to add for the icon variant: a trash icon
//    image asset, e.g. import trashIcon from '../../assets/icons/trash.png'
//    (per your no-text-icons rule - swap the path below to your actual asset)

import React, { useState } from 'react';
import ConfirmModal from '../ConfirmModal/ConfirmModal.jsx';
import trashIcon from '../../assets/icons/trash.png'; 
import './DeleteButton.css';

export default function DeleteButton({
  onDelete,
  confirmMessage = 'Are you sure you want to delete this? This action can be undone later if the item supports restoring.',
  label = 'Delete',
  variant = 'button', // => 'button' | 'icon'
  disabled = false,
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  // => Runs after the admin clicks "Yes" in the ConfirmModal
  const handleConfirm = async () => {
    setError(null);
    setDeleting(true);
    try {
      await onDelete();
      // => On success, the parent is expected to navigate away or remove
      //    the deleted row from its own list - this component doesn't
      //    assume what happens next, it just closes itself
      setShowConfirm(false);
    } catch (err) {
      // => Keep the modal open-adjacent error visible rather than closing
      //    silently on failure - the admin needs to see why it didn't work
      setError(err?.response?.data?.error || err?.message || 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {variant === 'icon' ? (
        <button
          className="icon-btn"
          onClick={() => setShowConfirm(true)}
          disabled={disabled || deleting}
          title={label}
          aria-label={label}
        >
          <img className="trash-icon" src={trashIcon} alt="" />
        </button>
      ) : (
        <button
          className="btn-delete"
          onClick={() => setShowConfirm(true)}
          disabled={disabled || deleting}
        >
          {deleting ? 'Deleting…' : label}
        </button>
      )}

      {/* => Rendered inline next to the button rather than deep in a parent
             layout - keeps this component fully self-contained, no portal
             needed since ConfirmModal already handles its own fixed overlay.
             => If a delete attempt failed, the modal stays open showing the
             error instead of the original question - ConfirmModal renders
             `message` as a plain <p>, so concatenating with \n wouldn't
             actually produce a line break; swapping the text entirely reads
             more clearly anyway ("Yes" becomes an implicit retry). */}
      <ConfirmModal
        isOpen={showConfirm}
        message={error || confirmMessage}
        onConfirm={handleConfirm}
        onCancel={() => { setShowConfirm(false); setError(null); }}
      />
    </>
  );
}
