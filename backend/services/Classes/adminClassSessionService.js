// => services/Classes/adminClassSessionService.js
// => Validation + orchestration for the Class Sessions feature. Controller
//    stays req/res-only, model stays pure SQL, all the "is this allowed"
//    logic lives here - same layering as adminFacilityService.js.

import { pool } from '../../config/db.js';
// => randomUUID tags every session created in one recurring batch with the
//    same recurrence_group_id, done in Node rather than a DB round trip
//    since we need the same value for every INSERT in the loop below.
import { randomUUID } from 'crypto';
import {
  getFacilitiesForSessionPicker,
  getFacilityForSessionPage,
  getActiveTesdaBatches,
  getActiveShsBatches,
  getSessionsForFacility,
  getRemoteSessions,
  getBatchIdFromPublicId,
  getApprovedEnrollmentCount, 
  getApprovedEnrollmentCountsByType, 
  getSessionsForBatch,
  getShsCourseById,
  findConflictingSession,
  findConflictingTrainerSession,
  insertClassSession,
  getSessionByPublicId,
  updateClassSessionRow,
  softDeleteClassSessionRow,
  countActiveSessionsByRecurrenceGroup,
  softDeleteSessionsByRecurrenceGroup,
  getUpcomingSessionsByRecurrenceGroup,
  updateSessionsByRecurrenceGroupRow,
} from '../../models/Classes/adminClassSessionModel.js';
import { logActivity, getActivityLogsForFacilityPaginated } from '../../models/adminActivityLogModel.js';
// => Canonical action taxonomy - keeps this file's logActivity calls from
//    drifting off the activity_logs_action_check constraint in Neon
import { ACTIVITY_ACTIONS } from '../../constants/activityActions.js';

// => Booking window - weekdays only, 8AM to 5PM. Applies ONLY to Local
//    (facility-based) sessions, per your scope doc's own wording that
//    Mobile is "not subject for time scheduling constraint" and Online
//    "can be anytime". Trainer conflict checking (below) is the only rule
//    that stays universal across all three types.
const BOOKING_START_TIME = '08:00';
const BOOKING_END_TIME = '17:00';

// => Cap on how many sessions a single "repeat weekly" request can generate,
//    purely a sanity guard against a mistyped end date creating thousands
//    of rows in one shot.
const MAX_RECURRING_SESSIONS = 60;

// => Day-of-week check happens in Manila local time, not server/UTC time -
//    the server can run anywhere, but "today" for booking purposes always
//    means today in Cebu. en-CA locale gives a plain YYYY-MM-DD string,
//    which is what session_date is stored/compared as everywhere else.
const getManilaNow = () => {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date());
  return { dateStr, timeStr };
};

// => Shared past-date/past-time guard, used by both single and recurring
//    creation, and by update. A date before today is always rejected. A
//    date equal to today with a start time that's already elapsed is
//    rejected too - "today at 8am" booked at 2pm is still backward.
const assertNotInPast = (sessionDate, startTime) => {
  const { dateStr: todayStr, timeStr: nowStr } = getManilaNow();
  if (sessionDate < todayStr) {
    throw new Error('Sessions cannot be scheduled in the past.');
  }
  if (sessionDate === todayStr && startTime < nowStr) {
    throw new Error('That start time has already passed today.');
  }
};

// => UPDATED - checks against actual Approved-enrollment headcount rather
//    than the batch's max_students ceiling. A batch capped at 30 but only
//    20 Approved enrollees fits a 25-capacity facility just fine, checking
//    max_students alone would have blocked that unnecessarily.
// => Only applies to Local sessions since Mobile/Online have no
//    facility_id and therefore no capacity ceiling. A null facility.capacity
//    means "no limit set", so it always passes. Message deliberately
//    contains "above the" - already whitelisted in
//    adminClassSessionController.js's KNOWN_VALIDATION_MESSAGES so this
//    surfaces as a 400 with the real message instead of a generic 500.
const assertFacilityCapacity = async (facility, batchType, batchId) => {
  if (facility.capacity == null) return;
  const approvedCount = await getApprovedEnrollmentCount(pool, batchType, batchId);
  if (approvedCount > facility.capacity) {
    throw new Error(
      `This batch's approved enrollees (${approvedCount}) is above the "${facility.name}" facility's capacity (${facility.capacity}). Book this as a Mobile session instead.`
    );
  }
};

// GET FACILITY PICKER LIST (Class Sessions tab landing view)
export const fetchFacilitiesForSessionPicker = async () => {
  return await getFacilitiesForSessionPicker(pool);
};

// GET FACILITY CALENDAR PAGE HEADER + SESSIONS FOR A DATE RANGE
export const fetchFacilitySessionPage = async (facilityPublicId, { from, to }) => {
  const facility = await getFacilityForSessionPage(pool, facilityPublicId);
  if (!facility) return null;

  const rawSessions = await getSessionsForFacility(pool, facility.facility_id, from, to);
  const sessions = await enrichSessionsWithBatchLabel(rawSessions);

  return { facility, sessions };
};

// GET MOBILE/ONLINE SESSIONS FOR A DATE RANGE (Mobile & Online subsection table)
export const fetchRemoteSessions = async ({ from, to }) => {
  const rawSessions = await getRemoteSessions(pool, from, to);
  return await enrichSessionsWithBatchLabel(rawSessions);
};

// GET ALL SESSIONS FOR ONE BATCH (Class Sessions section on the batch detail pages)
export const fetchSessionsForBatch = async (batchType, batchPublicId) => {
  if (!batchType || !['tesda', 'shs'].includes(batchType)) return null;

  const batchId = await getBatchIdFromPublicId(pool, batchType, batchPublicId);
  if (!batchId) return null;

  // => batch_type is stored uppercase in the DB (class_sessions_batch_type_check
  //    constraint requires 'TESDA'/'SHS'), same conversion applied on insert
  return await getSessionsForBatch(pool, batchType.toUpperCase(), batchId);
};

// => Attaches a human-readable label to each session (course/cluster title,
//    plus Grade 11/12 for SHS) - batch_type/batch_id is polymorphic so this
//    can't be done in one SQL join, done here instead with two batch lookups.
const enrichSessionsWithBatchLabel = async (sessions) => {
  if (sessions.length === 0) return [];

  const [tesdaBatches, shsBatches] = await Promise.all([
    getActiveTesdaBatches(pool),
    getActiveShsBatches(pool),
  ]);
  // => NOTE: only Pending/Ongoing batches resolve here. A session tied to a
  //    since-Concluded/Dissolved batch falls through to "Unknown batch".
  //    Fine for now, flag if past-session history needs concluded batches too.
  const tesdaMap = new Map(tesdaBatches.map(b => [b.batch_id, b]));
  const shsMap = new Map(shsBatches.map(b => [b.batch_id, b]));

  return sessions.map(s => {
    if (s.batch_type === 'tesda') {
      const batch = tesdaMap.get(s.batch_id);
      return {
        ...s,
        batch_label: batch
          ? `${batch.course_title}${batch.certification_type ? ` (${batch.certification_type})` : ''}`
          : 'Unknown batch',
      };
    }
    if (s.batch_type === 'shs') {
      const batch = shsMap.get(s.batch_id);
      if (!batch) return { ...s, batch_label: 'Unknown batch' };
      const g12Match = batch.grade12_courses.find(c => c.course_id === s.shs_course_id);
      const g11Match = batch.grade11_courses.find(c => c.course_id === s.shs_course_id);
      const matched = g12Match || g11Match;
      const gradeLabel = g12Match ? 'Grade 12' : 'Grade 11';
      return { ...s, batch_label: `${batch.cluster_name}${matched ? ` - ${matched.title}` : ''} (${gradeLabel})` };
    }
    return { ...s, batch_label: 'Unknown batch' };
  });
};

// GET ELIGIBLE BATCHES FOR A FACILITY (Add Session modal, Local mode)
export const fetchEligibleBatchesForFacility = async (facilityPublicId) => {
  const facility = await getFacilityForSessionPage(pool, facilityPublicId);
  if (!facility) return null;

  // => UPDATED - approved-enrollment counts fetched alongside the batch
  //    lists, one grouped query per batch type rather than per-batch, then
  //    looked up by batch_id below when flagging capacity_exceeded.
  const [tesdaBatches, shsBatches, tesdaApprovedCounts, shsApprovedCounts] = await Promise.all([
    getActiveTesdaBatches(pool),
    getActiveShsBatches(pool),
    getApprovedEnrollmentCountsByType(pool, 'tesda'),
    getApprovedEnrollmentCountsByType(pool, 'shs'),
  ]);

  // => UPDATED - flags each TESDA batch as too large for this facility
  //    based on actual Approved-enrollment headcount, not max_students.
  //    Still annotated rather than filtered out, so it shows in the
  //    dropdown but the modal can warn on selection instead of hiding it.
  const eligibleTesda = (facility.allows_all_courses
    ? tesdaBatches
    : tesdaBatches.filter(b => facility.tesda_course_ids.includes(b.course_id))
  ).map(b => {
    const approvedCount = tesdaApprovedCounts.get(b.batch_id) ?? 0;
    return {
      ...b,
      approved_count: approvedCount,
      capacity_exceeded: facility.capacity != null && approvedCount > facility.capacity,
    };
  });

  // => Only one grade is ever "live" for a batch at a time - Grade 11 until
  //    grade11_completed flips true, Grade 12 afterward. Resolved here into
  //    a single active_grade + active_courses per batch, so the frontend
  //    never has to juggle two grade slots or decide which one to show -
  //    it just gets the one course list that's actually bookable right now.
  const eligibleShs = shsBatches
    .map(b => {
      const activeGrade = b.grade11_completed ? 'Grade 12' : 'Grade 11';
      const rawCourses = activeGrade === 'Grade 12' ? b.grade12_courses : b.grade11_courses;
      const activeCourses = rawCourses.filter(c => facility.allows_all_courses || facility.shs_course_ids.includes(c.course_id));
      // => UPDATED - same approved-enrollment-based capacity flag as TESDA above.
      const approvedCount = shsApprovedCounts.get(b.batch_id) ?? 0;
      return {
        ...b,
        active_grade: activeGrade,
        // => active_trainer_id/active_trainer_name removed - trainer is now
        //    per course (see attachTrainer in getActiveShsBatches), not a
        //    single value per grade. Each entry in active_courses already
        //    carries its own trainer_id/trainer_name.
        active_courses: activeCourses,
        approved_count: approvedCount,
        capacity_exceeded: facility.capacity != null && approvedCount > facility.capacity,
      };
    })
    .filter(b => b.active_courses.length > 0);

  return { tesda: eligibleTesda, shs: eligibleShs };
};

// GET ALL ACTIVE BATCHES, UNFILTERED (Add Session modal, Mobile/Online mode)
// => Mobile/Online sessions have no facility, so there's no restriction to
//    filter against - every active batch is eligible, both grade levels
//    always offered for SHS.
export const fetchAllActiveBatchesForRemote = async () => {
  const [tesdaBatches, shsBatches] = await Promise.all([
    getActiveTesdaBatches(pool),
    getActiveShsBatches(pool),
  ]);
  const shsWithAvailability = shsBatches
    .map(b => {
      const activeGrade = b.grade11_completed ? 'Grade 12' : 'Grade 11';
      const activeCourses = activeGrade === 'Grade 12' ? b.grade12_courses : b.grade11_courses;
      return {
        ...b,
        active_grade: activeGrade,
        // => same removal as fetchEligibleBatchesForFacility above - trainer
        //    now lives on each course inside active_courses.
        active_courses: activeCourses,
      };
    })
    .filter(b => b.active_courses.length > 0);
  return { tesda: tesdaBatches, shs: shsWithAvailability };
};

// CREATE A CLASS SESSION (Local, Mobile, or Online)
export const addClassSession = async (data, actor) => {
  const {
    session_type, // => 'Local' | 'Mobile' | 'Online'
    facility_public_id, batch_type, batch_id, session_date,
    start_time, end_time, trainer_id, shs_course_id, remarks,
    mobile_location, meeting_link,
  } = data;

  if (!session_type || !['Local', 'Mobile', 'Online'].includes(session_type)) {
    throw new Error('A valid session type is required.');
  }
  if (!batch_type || !['tesda', 'shs'].includes(batch_type)) throw new Error('A valid batch type is required.');
  if (!batch_id) throw new Error('A batch is required.');
  if (!session_date) throw new Error('Session date is required.');
  if (!start_time || !end_time) throw new Error('Start and end time are required.');
  if (start_time >= end_time) throw new Error('End time must be after start time.');
  assertNotInPast(session_date, start_time);

  let facility = null;

  if (session_type === 'Local') {
    // => Weekday + 8AM-5PM window - Local only. session_date arrives as
    //    'YYYY-MM-DD', parsed as UTC midnight so getDay() isn't shifted by
    //    the server's local timezone.
    const dayOfWeek = new Date(`${session_date}T00:00:00Z`).getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      throw new Error('Facility-based sessions can only be booked on weekdays.');
    }
    if (start_time < BOOKING_START_TIME || end_time > BOOKING_END_TIME) {
      throw new Error('Facility-based sessions can only be booked between 8:00 AM and 5:00 PM.');
    }

    if (!facility_public_id) throw new Error('Facility is required for a facility-based session.');
    facility = await getFacilityForSessionPage(pool, facility_public_id);
    if (!facility) throw new Error('Facility not found.');

    if (!facility.allows_all_courses && batch_type === 'shs') {
      if (!shs_course_id) throw new Error('A course is required for an SHS session.');
      if (!facility.shs_course_ids.includes(shs_course_id)) {
        throw new Error('This facility is not allowed for the selected course.');
      }
    }
    // => TESDA restriction check happens implicitly via the frontend's
    //    already-filtered eligible-batches dropdown. 

    // => NEW - facility capacity check, re-run here server-side even
    //    though the modal already warns on this, since the frontend flag
    //    is advisory only and never trusted on its own.
    await assertFacilityCapacity(facility, batch_type, batch_id);

    const conflict = await findConflictingSession(pool, {
      facilityId: facility.facility_id,
      sessionDate: session_date,
      startTime: start_time,
      endTime: end_time,
    });
    if (conflict) throw new Error('This facility is already booked during that time.');
  }

  // => Trainer conflict check - universal across Local/Mobile/Online.
  if (trainer_id) {
    const trainerConflict = await findConflictingTrainerSession(pool, {
      trainerId: trainer_id,
      sessionDate: session_date,
      startTime: start_time,
      endTime: end_time,
    });
    if (trainerConflict) throw new Error('This trainer is already assigned to another session at that time.');
  }

  let shsCourseInfo = null;
  if (batch_type === 'shs' && shs_course_id) {
    shsCourseInfo = await getShsCourseById(pool, shs_course_id);
  }

  const created = await insertClassSession(pool, {
    batch_type,
    batch_id,
    session_type,
    facility_id: facility ? facility.facility_id : null,
    mobile_location: session_type === 'Mobile' ? (mobile_location?.trim() || null) : null,
    meeting_link: session_type === 'Online' ? (meeting_link?.trim() || null) : null,
    session_date,
    start_time,
    end_time,
    trainer_id: trainer_id || null,
    shs_course_id: batch_type === 'shs' ? shs_course_id : null,
    created_by: actor?.admin_id,
    remarks: remarks?.trim() || null,
    recurrence_group_id: null, // => single, non-repeating session
  });

  // => FIX: actor_type was 'Admin' (invalid - constraint only allows
  //    Staff/Student/System) and action was a dynamic string (invalid -
  //    action must be one of the fixed ACTIVITY_ACTIONS values). Both
  //    silently failed the INSERT before this fix.
  await logActivity(pool, {
    entity_type: 'class_session',
    entity_id: created.session_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.CREATE,
    action_detail: `${session_type} session for batch #${batch_id} on ${session_date} from ${start_time} to ${end_time}.` +
      (facility ? ` At "${facility.name}".` : '') +
      (shsCourseInfo ? ` (${shsCourseInfo.grade_level})` : ''),
  });

  return created;
};

// GET PAGINATED ACTIVITY LOGS FOR ONE FACILITY (below the calendar on FacilitySessionCalendar)
// => Always newest-first, independent of whatever date range the calendar
//    grid currently has visible - a log history and a booking grid answer
//    different questions, so they're deliberately not tied together.
export const fetchFacilityActivityLogs = async (facilityPublicId, page = 1) => {
  const facility = await getFacilityForSessionPage(pool, facilityPublicId);
  if (!facility) return null;
  return await getActivityLogsForFacilityPaginated(pool, facility.facility_id, page, 10);
};

// UPDATE A CLASS SESSION (date, time, trainer, location/link, remarks only)
// => Re-runs the same weekday/window/conflict rules addClassSession applies,
//    scoped to this session's own type - a Local session edited to a new
//    time still can't leave the 8AM-5PM weekday window, a Mobile/Online one
//    still isn't restricted.
export const updateClassSession = async (sessionPublicId, data, actor) => {
  const existing = await getSessionByPublicId(pool, sessionPublicId);
  if (!existing || existing.deleted_at) throw new Error('Class session not found.');

  const { session_date, start_time, end_time, trainer_id, mobile_location, meeting_link, remarks } = data;
  if (!session_date) throw new Error('Session date is required.');
  if (!start_time || !end_time) throw new Error('Start and end time are required.');
  if (start_time >= end_time) throw new Error('End time must be after start time.');
  assertNotInPast(session_date, start_time);

  if (existing.session_type === 'Local') {
    const dayOfWeek = new Date(`${session_date}T00:00:00Z`).getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      throw new Error('Facility-based sessions can only be booked on weekdays.');
    }
    if (start_time < BOOKING_START_TIME || end_time > BOOKING_END_TIME) {
      throw new Error('Facility-based sessions can only be booked between 8:00 AM and 5:00 PM.');
    }
    const conflict = await findConflictingSession(pool, {
      facilityId: existing.facility_id,
      sessionDate: session_date,
      startTime: start_time,
      endTime: end_time,
      excludeSessionId: existing.session_id,
    });
    if (conflict) throw new Error('This facility is already booked during that time.');
  }

  if (trainer_id) {
    const trainerConflict = await findConflictingTrainerSession(pool, {
      trainerId: trainer_id,
      sessionDate: session_date,
      startTime: start_time,
      endTime: end_time,
      excludeSessionId: existing.session_id,
    });
    if (trainerConflict) throw new Error('This trainer is already assigned to another session at that time.');
  }

  const updated = await updateClassSessionRow(pool, existing.session_id, {
    session_date,
    start_time,
    end_time,
    trainer_id: trainer_id || null,
    mobile_location: existing.session_type === 'Mobile' ? (mobile_location?.trim() || null) : null,
    meeting_link: existing.session_type === 'Online' ? (meeting_link?.trim() || null) : null,
    remarks: remarks?.trim() || null,
  });

  // => Plain before/after description rather than a shared diff utility -
  //    swap this for buildFieldDiff/formatDiffDetail if you'd rather keep
  //    the log format identical to your other UPDATE actions.
  await logActivity(pool, {
    entity_type: 'class_session',
    entity_id: existing.session_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Session rescheduled from ${existing.session_date} ${existing.start_time}-${existing.end_time} to ${session_date} ${start_time}-${end_time}.`,
  });

  return updated;
};

// CANCEL A CLASS SESSION (soft delete)
// => Always allowed regardless of date - cancelling a session that already
//    happened is a legitimate record correction, only CREATING/EDITING
//    into the past is blocked.
export const cancelClassSession = async (sessionPublicId, actor) => {
  const existing = await getSessionByPublicId(pool, sessionPublicId);
  if (!existing || existing.deleted_at) throw new Error('Class session not found.');

  const cancelled = await softDeleteClassSessionRow(pool, existing.session_id);
  if (!cancelled) throw new Error('Class session not found.');

  await logActivity(pool, {
    entity_type: 'class_session',
    entity_id: existing.session_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.SOFT_DELETE,
    action_detail: `${existing.session_type} session on ${existing.session_date} from ${existing.start_time} to ${existing.end_time} was cancelled.`,
  });

  return cancelled;
};

// CREATE A WEEKLY RECURRING SERIES OF CLASS SESSIONS
// => Body carries the same fields as addClassSession, plus:
//      start_date   - first possible occurrence (inclusive)
//      until_date   - last possible occurrence (inclusive)
//      repeat_days  - array of JS getUTCDay() values, 0=Sun..6=Sat
//    All-or-nothing: every generated date is validated and conflict-checked
//    up front. If ANY date fails, nothing is inserted and the error lists
//    which dates were the problem.
export const addRecurringClassSessions = async (data, actor) => {
  const {
    session_type, facility_public_id, batch_type, batch_id,
    start_date, until_date, repeat_days,
    start_time, end_time, trainer_id, shs_course_id, remarks,
    mobile_location, meeting_link,
  } = data;

  if (!session_type || !['Local', 'Mobile', 'Online'].includes(session_type)) {
    throw new Error('A valid session type is required.');
  }
  if (!batch_type || !['tesda', 'shs'].includes(batch_type)) throw new Error('A valid batch type is required.');
  if (!batch_id) throw new Error('A batch is required.');
  if (!start_date || !until_date) throw new Error('A start date and an end date are required.');
  if (until_date < start_date) throw new Error('The repeat-until date must be after the start date.');
  if (!Array.isArray(repeat_days) || repeat_days.length === 0) throw new Error('Select at least one day of the week to repeat on.');
  if (!start_time || !end_time) throw new Error('Start and end time are required.');
  if (start_time >= end_time) throw new Error('End time must be after start time.');
  assertNotInPast(start_date, start_time);

  if (session_type === 'Local') {
    if (start_time < BOOKING_START_TIME || end_time > BOOKING_END_TIME) {
      throw new Error('Facility-based sessions can only be booked between 8:00 AM and 5:00 PM.');
    }
    if (repeat_days.some(d => d === 0 || d === 6)) {
      throw new Error('Facility-based sessions can only repeat on weekdays.');
    }
  }

  let facility = null;
  if (session_type === 'Local') {
    if (!facility_public_id) throw new Error('Facility is required for a facility-based session.');
    facility = await getFacilityForSessionPage(pool, facility_public_id);
    if (!facility) throw new Error('Facility not found.');
    if (!facility.allows_all_courses && batch_type === 'shs') {
      if (!shs_course_id) throw new Error('A course is required for an SHS session.');
      if (!facility.shs_course_ids.includes(shs_course_id)) {
        throw new Error('This facility is not allowed for the selected course.');
      }
    }
    // => NEW - same capacity check as addClassSession, run once up front
    //    for the whole series rather than once per generated date, since
    //    the batch/facility pairing itself never changes across dates.
    await assertFacilityCapacity(facility, batch_type, batch_id);
  }

  // => Walk every calendar date in the range, keep the ones matching a
  //    selected weekday. UTC-parsed same as the single-session weekday
  //    check, so DST/timezone quirks never shift which day a date lands on.
  const dates = [];
  const cursor = new Date(`${start_date}T00:00:00Z`);
  const end = new Date(`${until_date}T00:00:00Z`);
  while (cursor <= end) {
    if (repeat_days.includes(cursor.getUTCDay())) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (dates.length === 0) throw new Error('No matching dates fall within that range.');
  if (dates.length > MAX_RECURRING_SESSIONS) {
    throw new Error(`That range produces ${dates.length} sessions, which is above the ${MAX_RECURRING_SESSIONS}-session limit. Shorten the range.`);
  }

  // => Conflict pass BEFORE any insert - collects every problem date so the
  //    admin sees the whole picture at once instead of discovering
  //    conflicts one submission at a time.
  const conflictDates = [];
  for (const d of dates) {
    if (session_type === 'Local') {
      const facilityConflict = await findConflictingSession(pool, {
        facilityId: facility.facility_id, sessionDate: d, startTime: start_time, endTime: end_time,
      });
      if (facilityConflict) { conflictDates.push(d); continue; }
    }
    if (trainer_id) {
      const trainerConflict = await findConflictingTrainerSession(pool, {
        trainerId: trainer_id, sessionDate: d, startTime: start_time, endTime: end_time,
      });
      if (trainerConflict) conflictDates.push(d);
    }
  }
  if (conflictDates.length > 0) {
    const shown = conflictDates.slice(0, 5).join(', ');
    const extra = conflictDates.length > 5 ? ` and ${conflictDates.length - 5} more` : '';
    throw new Error(`This schedule already has a conflict on: ${shown}${extra}. No sessions were created.`);
  }

  let shsCourseInfo = null;
  if (batch_type === 'shs' && shs_course_id) {
    shsCourseInfo = await getShsCourseById(pool, shs_course_id);
  }

  const recurrenceGroupId = randomUUID();
  const created = [];
  for (const d of dates) {
    const session = await insertClassSession(pool, {
      batch_type,
      batch_id,
      session_type,
      facility_id: facility ? facility.facility_id : null,
      mobile_location: session_type === 'Mobile' ? (mobile_location?.trim() || null) : null,
      meeting_link: session_type === 'Online' ? (meeting_link?.trim() || null) : null,
      session_date: d,
      start_time,
      end_time,
      trainer_id: trainer_id || null,
      shs_course_id: batch_type === 'shs' ? shs_course_id : null,
      created_by: actor?.admin_id,
      remarks: remarks?.trim() || null,
      recurrence_group_id: recurrenceGroupId,
    });
    created.push(session);
  }

  // => ONE log entry for the whole series, not one per session - keeps the
  //    activity log readable instead of flooding it with 20 near-identical rows.
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayLabel = repeat_days.slice().sort().map(d => dayNames[d]).join('/');
  await logActivity(pool, {
    entity_type: 'class_session',
    entity_id: created[0].session_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.CREATE,
    action_detail: `${session_type} weekly series for batch #${batch_id} created: ${dayLabel} ${start_time}-${end_time}, ${start_date} to ${until_date} (${created.length} sessions).` +
      (facility ? ` At "${facility.name}".` : '') +
      (shsCourseInfo ? ` (${shsCourseInfo.grade_level})` : ''),
  });

  return { sessions: created, count: created.length };
};

// GET COUNT OF STILL-ACTIVE SESSIONS IN A RECURRING SERIES
// => Powers the "Cancel Entire Series (N)" button label on the edit modal.
export const fetchSeriesSessionCount = async (recurrenceGroupId) => {
  return await countActiveSessionsByRecurrenceGroup(pool, recurrenceGroupId);
};

// CANCEL AN ENTIRE RECURRING SERIES (bulk soft delete)
// => Distinct from cancelClassSession above - that one cancels a single
//    row by its own public_id, this one cancels every still-active row
//    sharing a recurrence_group_id in one statement. Both are soft delete,
//    same audit-trail reasoning applies.
export const cancelClassSessionSeries = async (recurrenceGroupId, actor) => {
  if (!recurrenceGroupId) throw new Error('This session is not part of a recurring series.');

  const cancelled = await softDeleteSessionsByRecurrenceGroup(pool, recurrenceGroupId);
  if (cancelled.length === 0) throw new Error('No active sessions found in this series.');

  const dates = cancelled.map(s => String(s.session_date).slice(0, 10)).sort();
  const first = cancelled[0];

  await logActivity(pool, {
    entity_type: 'class_session',
    entity_id: first.session_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.SOFT_DELETE,
    action_detail: `Entire weekly series cancelled: ${cancelled.length} session(s) from ${dates[0]} to ${dates[dates.length - 1]}.`,
  });

  return { count: cancelled.length };
};

// UPDATE AN ENTIRE RECURRING SERIES (time/trainer/notes only, all upcoming occurrences)
// => Distinct from updateClassSession above - that one edits a single
//    occurrence's date AND time. This one never touches session_date,
//    it only moves the shared fields across every session in the series
//    that hasn't happened yet, in one all-or-nothing pass.
export const updateClassSessionSeries = async (recurrenceGroupId, data, actor) => {
  if (!recurrenceGroupId) throw new Error('This session is not part of a recurring series.');

  const { start_time, end_time, trainer_id, mobile_location, meeting_link, remarks } = data;
  if (!start_time || !end_time) throw new Error('Start and end time are required.');
  if (start_time >= end_time) throw new Error('End time must be after start time.');

  const { dateStr: todayStr } = getManilaNow();
  const upcoming = await getUpcomingSessionsByRecurrenceGroup(pool, recurrenceGroupId, todayStr);
  if (upcoming.length === 0) throw new Error('No upcoming sessions in this series to update.');

  // => Every session in a series shares the same facility/session_type -
  //    set at creation time and never changed by a per-session edit - so
  //    the first row is representative of the whole group.
  const sessionType = upcoming[0].session_type;
  const facilityId = upcoming[0].facility_id;

  if (sessionType === 'Local' && (start_time < BOOKING_START_TIME || end_time > BOOKING_END_TIME)) {
    throw new Error('Facility-based sessions can only be booked between 8:00 AM and 5:00 PM.');
  }

  // => Conflict pass across every upcoming occurrence before touching any
  //    row - same all-or-nothing guarantee as creating a series.
  const conflictDates = [];
  for (const s of upcoming) {
    const dateStr = String(s.session_date).slice(0, 10);
    if (sessionType === 'Local') {
      const facilityConflict = await findConflictingSession(pool, {
        facilityId, sessionDate: dateStr, startTime: start_time, endTime: end_time, excludeSessionId: s.session_id,
      });
      if (facilityConflict) { conflictDates.push(dateStr); continue; }
    }
    if (trainer_id) {
      const trainerConflict = await findConflictingTrainerSession(pool, {
        trainerId: trainer_id, sessionDate: dateStr, startTime: start_time, endTime: end_time, excludeSessionId: s.session_id,
      });
      if (trainerConflict) conflictDates.push(dateStr);
    }
  }
  if (conflictDates.length > 0) {
    const shown = conflictDates.slice(0, 5).join(', ');
    const extra = conflictDates.length > 5 ? ` and ${conflictDates.length - 5} more` : '';
    throw new Error(`The new time conflicts with an existing booking on: ${shown}${extra}. No sessions were updated.`);
  }

  const updated = await updateSessionsByRecurrenceGroupRow(pool, recurrenceGroupId, todayStr, {
    start_time, end_time, trainer_id: trainer_id || null,
    mobile_location: sessionType === 'Mobile' ? (mobile_location?.trim() || null) : null,
    meeting_link: sessionType === 'Online' ? (meeting_link?.trim() || null) : null,
    remarks: remarks?.trim() || null,
  });

  await logActivity(pool, {
    entity_type: 'class_session',
    entity_id: updated[0].session_id,
    actor_type: 'Staff',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: ACTIVITY_ACTIONS.UPDATE,
    action_detail: `Entire series updated: ${updated.length} upcoming session(s) rescheduled to ${start_time}-${end_time}.`,
  });

  return { sessions: updated, count: updated.length };
};