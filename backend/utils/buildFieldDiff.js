// => admin/utils/buildFieldDiff.js
// => Compares an existing DB record against submitted fields and builds a
//    human-readable "field: old -> new" diff for activity log
//    action_detail. Only fields that actually changed are included -
//    unchanged fields (the majority of any partial-update payload) are
//    silently skipped rather than padding the log with noise.
// => Values are normalized before comparing: null/undefined/empty string
//    are all treated as the same "blank" value, so switching between
//    them doesn't falsely register as a change.
// => labels lets callers show a friendlier name than the raw column name
//    (e.g. { contact_no: 'Contact No.' }) - falls back to the raw key
//    when no label is given.

const normalize = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

export const buildFieldDiff = (oldRecord, newFields, labels = {}) => {
  const changes = [];

  for (const key of Object.keys(newFields)) {
    const oldValue = normalize(oldRecord?.[key]);
    const newValue = normalize(newFields[key]);
    if (oldValue === newValue) continue;

    const label = labels[key] || key;
    changes.push(`${label}: "${oldValue || '-'}" => "${newValue || '-'}"`);
  }

  return changes;
};

// => Joins a diff array into the final action_detail string, with a
//    fallback for the case where a Save produced no actual value changes
export const formatDiffDetail = (sectionLabel, changes) => {
  if (changes.length === 0) {
    return `${sectionLabel} section saved with no field changes.`;
  }
  return `Updated ${sectionLabel} section - ${changes.join('; ')}`;
};