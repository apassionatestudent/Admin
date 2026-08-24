// => admin/services/Students/adminStudentService.js
// => Mirrors adminClassService.js pattern
// => pool is imported here so controllers stay thin

import { pool } from '../../config/db.js';

// => Activity logging - same logActivity/getActivityLogsForEntity helpers
//    used by every other module in this campaign (Support Tickets, etc.)
import { logActivity, getActivityLogsForStudentPaginated } from '../../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';

import {
  getPaginatedStudents,
  searchStudents,
  getStudentByPublicId,
  getStudentEnrollmentHistory,
  toggleStudentActive,
  updateStudentProfile,
  updateStudentAccount,
} from '../../models/Students/adminStudentModel.js';

// => Reset Password button - issues a password reset token and emails
//    the student a set-password link, purpose is always 'reset' here
import { issuePasswordResetToken } from './adminPasswordTokenService.js';

// => Payment History section pulls from both Payments and Refunds -
//    same merge-in-the-service pattern as tesdaEnrollmentService.js.
//    Each model stays strictly single-table, the merge happens here.
import * as paymentsModel from '../../models/Payments/paymentsModel.js';
import * as refundsModel from '../../models/Payments/refundsModel.js';

// => entity_type value written to activity_logs for every Student action.
//    entity_id is always the internal student_id (integer), same
//    convention as class_session/support_ticket logging.
const ENTITY_TYPE = 'student';

// => Maps raw column names to the human-readable labels shown in the
//    Activity Log detail text. Own copy, not shared with any other file,
//    per the no-shared-code convention.
const FIELD_LABELS = {
  last_name:               'Last Name',
  first_name:              'First Name',
  middle_name:             'Middle Name',
  name_extension:          'Name Extension',
  birth_date:              'Birthdate',
  birthplace_region:       'Region',
  birthplace_province:     'Province',
  birthplace_city:         'City',
  nationality:             'Nationality',
  sex:                     'Sex',
  civil_status:            'Civil Status',
  highest_educ_attainment: 'Highest Educational Attainment',
  employment_status:       'Employment Status',
  facebook_link:           'Facebook Link',
  email:                   'Email',
  contact_no:              'Contact Number',
  religion:                'Religion',
  religion_others:         'Religion (Others)',
  username:                'Username',
};

// => Builds a readable action_detail string listing only the fields that
//    actually changed, e.g. Email: "old@x.com" -> "new@x.com"; Sex: "Male" -> "Female"
//    Returns null if nothing tracked actually changed value.
const buildStudentUpdateDetail = (beforeRow, submittedFields) => {
  const changes = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    if (submittedFields[key] === undefined) continue; // => field wasn't part of this save
    const before = beforeRow[key] ?? null;
    const after  = submittedFields[key] ?? null;
    // => Loose string comparison since dates/booleans can differ in type
    //    between the DB row and the submitted body but mean the same thing
    if (String(before ?? '') === String(after ?? '')) continue;
    changes.push(`${FIELD_LABELS[key]}: "${before ?? '-'}" -> "${after ?? '-'}"`);
  }
  return changes.length ? changes.join('; ') : null;
};

// => onlyActive defaults true so the list view hides inactive students
// => Search calls this with onlyActive=false so inactive students surface
export const fetchStudents = async (page = 1, onlyActive = true) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  return await getPaginatedStudents(pool, pageNum, onlyActive);
};

// SEARCH STUDENTS (paginated)
export const searchStudentsService = async (filters, page = 1) => {
  // => Require at least one non-empty filter
  const hasFilter = Object.values(filters).some(v => v && String(v).trim());
  if (!hasFilter) throw new Error('At least one search field is required.');

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  return await searchStudents(pool, filters, pageNum);
};

// FETCH STUDENT DETAIL
// => Returns account + profile bundle; null if not found
export const fetchStudentDetail = async (publicId) => {
  const studentRow = await getStudentByPublicId(pool, publicId);
  if (!studentRow) return null;

  // => Fetch enrollment history in parallel with any future sub-queries
  const [enrollments] = await Promise.all([
    getStudentEnrollmentHistory(pool, studentRow.student_id),
  ]);

  return { studentRow, enrollments };
};

// TOGGLE STUDENT ACTIVE STATUS
// => actor is { admin_id, full_name } of the admin performing this action,
//    required for activity logging (actor_id/actor_name columns)
export const toggleActiveStatus = async (publicId, isActive, actor) => {
  if (typeof isActive !== 'boolean') {
    throw new Error('is_active must be a boolean.');
  }
  const updated = await toggleStudentActive(pool, publicId, isActive);
  if (!updated) throw new Error('Student not found.');

  // => SUSPEND / REACTIVATE chosen over a generic UPDATE since is_active
  //    is specifically an account suspension flag
  await logActivity(pool, {
    entity_type: ENTITY_TYPE,
    entity_id: updated.student_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: isActive ? ACTIVITY_ACTIONS.REACTIVATE : ACTIVITY_ACTIONS.SUSPEND,
    action_detail: isActive
      ? 'Student account reactivated.'
      : 'Student account suspended.',
  });

  return updated;
};

// SEND PASSWORD RESET LINK
// => actor is { admin_id, full_name } of the admin performing this action,
//    required for activity logging. Sends to studentRow.username since
//    that is the actual login credential, not the profile's contact email
//    which can differ or be blank.
export const sendPasswordResetLink = async (publicId, actor) => {
  const studentRow = await getStudentByPublicId(pool, publicId);
  if (!studentRow) throw new Error('Student not found.');

  await issuePasswordResetToken(pool, {
    studentId: studentRow.student_id,
    email: studentRow.username,
    studentName: [studentRow.first_name, studentRow.last_name].filter(Boolean).join(' ') || studentRow.username,
  });

  await logActivity(pool, {
    entity_type: ENTITY_TYPE,
    entity_id: studentRow.student_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.RESET_PASSWORD,
    action_detail: `Password reset link sent to ${studentRow.username}.`,
  });

  return { email: studentRow.username };
};

// UPDATE STUDENT RECORD (profile + account fields)

// UPDATE STUDENT RECORD (profile + account fields)
// => Runs profile upsert and account update in parallel
// => Both are independent so Promise.all is safe here
// => actor is { admin_id, full_name } of the admin performing this action
export const updateStudentRecord = async (publicId, body, actor) => {
  // => First resolve the student_id from the public_id
  const studentRow = await getStudentByPublicId(pool, publicId);
  if (!studentRow) throw new Error('Student not found.');

  const {
    // => Profile fields - matches latest student_profile schema, no alias
    last_name, first_name, middle_name, name_extension,
    birth_date,
    birthplace_region, birthplace_province, birthplace_city,
    nationality, sex, civil_status,
    highest_educ_attainment, employment_status,
    facebook_link, email, contact_no, religion, religion_others,
    // => Account fields
    username, is_email_confirmed,
  } = body;

  // => Business rule: student_accounts.username IS the student's login
  //    email, so whenever student_profile.email changes, username must
  //    change with it. This is enforced here in the service, not just
  //    the frontend, so it holds no matter what the Username field on
  //    the form was left as. Without this, Reset Password kept emailing
  //    the OLD address after an admin updated the contact email.
  const emailChanged  = String(studentRow.email ?? '') !== String(email ?? '');
  const usernameToSave = emailChanged ? email : username;

  // => Validate required profile fields before hitting DB
  // => Mirrors the NOT NULL constraints on the latest student_profile table
  if (!last_name)          throw new Error('last_name is required.');
  if (!first_name)        throw new Error('first_name is required.');
  if (!birthplace_region) throw new Error('birthplace_region is required.');
  
  if (!nationality)       throw new Error('nationality is required.');
  if (!sex)                throw new Error('sex is required.');
  if (!facebook_link)     throw new Error('facebook_link is required.');
  if (!email)              throw new Error('email is required.');
  if (!contact_no)         throw new Error('contact_no is required.');

  // => Build the log detail BEFORE saving, off the fresh studentRow that
  //    still holds pre-save values. Uses usernameToSave (not the raw
  //    body) so an auto-synced username change actually shows up in the
  //    Activity Log instead of happening silently.
  const logDetail = buildStudentUpdateDetail(studentRow, { ...body, username: usernameToSave });

  // => Run profile upsert and account update in parallel
  const [updatedProfile, updatedAccount] = await Promise.all([
    updateStudentProfile(pool, studentRow.student_id, {
      last_name, first_name, middle_name, name_extension,
      birth_date,
      birthplace_region, birthplace_province, birthplace_city,
      nationality, sex, civil_status,
      highest_educ_attainment, employment_status,
      facebook_link, email, contact_no, religion, religion_others,
    }),
    // => Only pass account fields that were actually provided
    // => usernameToSave covers both cases: admin edited Username
    //    directly, or the email-changed auto-sync above kicked in
    (usernameToSave !== undefined || is_email_confirmed !== undefined)
      ? updateStudentAccount(pool, studentRow.student_id, { username: usernameToSave, is_email_confirmed })
      : Promise.resolve(null),
  ]);

  // => Always writes one UPDATE row per save, same as the remarks-only
  //    save case on Support Tickets - falls back to a generic message if
  //    no tracked field actually changed value
  await logActivity(pool, {
    entity_type: ENTITY_TYPE,
    entity_id: studentRow.student_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: logDetail || 'Saved profile/account with no field value changes.',
  });

  return { updatedProfile, updatedAccount };
};

// FETCH STUDENT ACTIVITY LOGS
// => Fetch-all-at-once, no pagination - same pattern as Facilities/
//    Trainers/Support Tickets. Returns null if the student doesn't exist
//    so the controller can 404 instead of returning an empty log list.
export const fetchStudentLogs = async (publicId, page = 1) => {
  const studentRow = await getStudentByPublicId(pool, publicId);
  if (!studentRow) return null;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  // => Combined timeline: admin-initiated changes on this student's record
  //    PLUS the student's own self-initiated actions (logins, ticket
  //    submissions, password changes) from the student portal.
  //    Paginated at the DB level, 10 per page, always the latest first.
  return await getActivityLogsForStudentPaginated(pool, studentRow.student_id, pageNum);
};

//
// PAYMENT & REFUND HISTORY
// => Resolves publicId to student_id, then fetches Payments and Refunds
//    across BOTH TESDA and SHS enrollments in parallel, tags each row
//    with record_type and program_type, and merges into one sorted
//    timeline. Mirrors tesdaEnrollmentService's fetchTesdaPaymentHistory.
//
export const fetchStudentPaymentHistory = async (publicId) => {
  const studentRow = await getStudentByPublicId(pool, publicId);
  if (!studentRow) return null;

  const [payments, refunds] = await Promise.all([
    paymentsModel.findPaymentsForStudent(studentRow.student_id),
    refundsModel.findRefundsForStudent(studentRow.student_id),
  ]);

  const records = [
    ...payments.map(p => ({
      public_id: p.public_id,
      reference_number: p.or_number,
      amount: Number(p.amount),
      record_date: p.payment_date,
      status: p.status,
      record_type: 'Payment',
      program_type: p.program_type,
    })),
    ...refunds.map(r => ({
      public_id: r.public_id,
      reference_number: r.refund_number,
      amount: Number(r.amount),
      record_date: r.created_at,
      status: r.status,
      record_type: 'Refund',
      program_type: r.program_type,
    })),
  ].sort((a, b) => new Date(b.record_date) - new Date(a.record_date));

  return { records };
};
