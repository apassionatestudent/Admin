// => components/FormActions/FormActions.jsx
// => Reusable Cancel/Save button pair for edit-mode sections. This exact
//    pairing (btn-secondary Cancel + btn-primary Save) was duplicated
//    across TesdaCourseDetail.jsx's per-section edit rows and
//    FacilityDetail.jsx's form footer - centralized here instead.
//
// => Props:
//    - onCancel      : fn, called on Cancel click
//    - onSave        : fn (sync or async), called on Save click
//    - saving        : bool - shows savingLabel and disables both buttons
//    - saveLabel     : text when idle (default "Save")
//    - savingLabel   : text while saving (default "Saving…")
//    - cancelLabel   : text for Cancel (default "Cancel")
//    - saveDisabled  : bool - additional disable condition for Save only,
//                       e.g. a required field being empty. Cancel stays
//                       enabled even when this is true, since backing out
//                       of an invalid edit should always be possible.

import React from 'react';
import './FormActions.css';

export default function FormActions({
  onCancel,
  onSave,
  saving = false,
  saveLabel = 'Save',
  savingLabel = 'Saving…',
  cancelLabel = 'Cancel',
  saveDisabled = false,
}) {
  return (
    <div className="form-actions-row">
      <button
        className="btn-secondary"
        onClick={onCancel}
        disabled={saving}
      >
        {cancelLabel}
      </button>
      <button
        className="btn-primary"
        onClick={onSave}
        disabled={saving || saveDisabled}
      >
        {saving ? savingLabel : saveLabel}
      </button>
    </div>
  );
}
