// => utils/buildPartialUpdate.js
// => Generic helper for building a safe, whitelisted partial UPDATE query.
// => Column names can NEVER be parameterized with $1, $2... placeholders in
// => PostgreSQL - only VALUES can. That means every column name used here
// => MUST come from the caller's allowedColumns whitelist. Never build this
// => from raw, unvalidated request body keys.
//
// => Same pattern as your existing buildPartialUpdate used for enrollment
// => PATCH endpoints (ALLOWED_COLUMNS whitelist) - have a
// => shared version of this file, delete this copy and import that one
// => instead in tesdaCourseModel.js / shsCourseModel.js.

export function buildPartialUpdate({ table, idColumn, idValue, fields, allowedColumns }) {
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(fields || {})) {
    if (!allowedColumns.has(key)) continue; // => silently drop anything not whitelisted
    setClauses.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  if (setClauses.length === 0) {
    return null; // => nothing valid to update
  }

  values.push(idValue);

  const text = `
    UPDATE ${table}
    SET ${setClauses.join(', ')}, updated_at = NOW()
    WHERE ${idColumn} = $${paramIndex}
    RETURNING *
  `;

  return { text, values };
}
