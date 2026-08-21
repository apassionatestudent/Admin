// => admin/services/Students/adminPasswordTokenService.js
// => Issues a password RESET token when an admin clicks "Reset Password"
//    on a student's detail page. Mirrors Site backend's
//    passwordTokenService.js issuePasswordToken function, purpose is
//    always 'reset' here since this is always an admin-triggered reset,
//    never a first-time account setup.

import crypto from 'crypto';

import {
  insertPasswordToken,
  deleteExpiredTokens,
} from '../../models/Students/adminPasswordTokenModel.js';

import { sendStudentPasswordResetEmail } from '../../utils/sendStudentPasswordResetEmail.js';

// => Same 10 minute window as the Site backend's own token issuing,
//    keep these two in sync if the TTL policy ever changes
const TOKEN_TTL_MS = 10 * 60 * 1000;

// => Not bcrypt here on purpose, same reasoning as the Site backend:
//    this is a 32-byte random value with no brute-force risk, SHA-256
//    just needs to be irreversible and fast for an exact-match lookup
const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

// => Called by adminStudentService.sendPasswordResetLink after it has
//    already resolved the student row, studentId/email/studentName are
//    passed in so this file never has to look the student up itself
export const issuePasswordResetToken = async (pool, { studentId, email, studentName }) => {
  // => Opportunistic cleanup, wrapped separately so a cleanup failure
  //    never blocks the actual token this function was called to create
  try {
    await deleteExpiredTokens(pool);
  } catch (err) {
    console.error('Password token cleanup failed:', err);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await insertPasswordToken(pool, { studentId, tokenHash, purpose: 'reset', expiresAt });

  await sendStudentPasswordResetEmail({ toEmail: email, studentName, rawToken });
};