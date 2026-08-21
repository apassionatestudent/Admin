// => admin/models/Students/adminPasswordTokenModel.js
// => Handles password_setup_tokens from the Admin side, insert only.
//    Admin never validates or consumes a token, that only happens on
//    the Site backend's setPassword flow. This file only ever writes
//    a new row so the Reset Password button can trigger an email.
// => Mirrors adminStudentModel.js pattern, pool passed in as a param.

// => Insert a new token row - token_hash is the SHA-256 hash of the raw
//    token, never the raw token itself, same principle as password_hash
export const insertPasswordToken = async (pool, { studentId, tokenHash, purpose, expiresAt }) => {
  const result = await pool.query(
    `INSERT INTO password_setup_tokens (student_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING token_id`,
    [studentId, tokenHash, purpose, expiresAt]
  );
  return result.rows[0] ?? null;
};

// => Opportunistic cleanup - deletes rows whose 10-minute window closed
//    more than 7 days ago. Called as a side effect of issuing a new
//    token, never on its own schedule. Condition is against expires_at,
//    not created_at, so a currently valid token can never be caught.
export const deleteExpiredTokens = async (pool) => {
  await pool.query(
    `DELETE FROM password_setup_tokens
     WHERE expires_at < NOW() - INTERVAL '7 days'`
  );
};