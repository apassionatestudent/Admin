// => services/Classes/adminClassSessionService.js
// => Validation + orchestration for the Class Sessions feature. Controller
//    stays req/res-only, model stays pure SQL, all the "is this allowed"
//    logic lives here - same layering as adminFacilityService.js.

import { pool } from '../../config/db.js';
import {
  getFacilitiesForSessionPicker,
  getFacilityForSessionPage,
  getActiveTesdaBatches,
  getActiveShsBatches,
  getSessionsForFacility,
  getRemoteSessions,
  getBatchIdFromPublicId,
  getSessionsForBatch,
  getShsCourseById,
  findConflictingSession,
  findConflictingTrainerSession,
  insertClassSession,
} from '../../models/Classes/adminClassSessionModel.js';
import { logActivity } from '../../models/adminActivityLogModel.js';

// => Booking window - weekdays only, 8AM to 5PM. Applies ONLY to Local
//    (facility-based) sessions, per your scope doc's own wording that
//    Mobile is "not subject for time scheduling constraint" and Online
//    "can be anytime". Trainer conflict checking (below) is the only rule
//    that stays universal across all three types.
const BOOKING_START_TIME = '08:00';
const BOOKING_END_TIME = '17:00';

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

  const [tesdaBatches, shsBatches] = await Promise.all([
    getActiveTesdaBatches(pool),
    getActiveShsBatches(pool),
  ]);

  const eligibleTesda = facility.allows_all_courses
    ? tesdaBatches
    : tesdaBatches.filter(b => facility.tesda_course_ids.includes(b.course_id));

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
      return {
        ...b,
        active_grade: activeGrade,
        active_courses: activeCourses,
        active_trainer_id: activeGrade === 'Grade 12' ? b.grade12_trainer_id : b.grade11_trainer_id,
        active_trainer_name: activeGrade === 'Grade 12' ? b.grade12_trainer_name : b.grade11_trainer_name,
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
        active_courses: activeCourses,
        active_trainer_id: activeGrade === 'Grade 12' ? b.grade12_trainer_id : b.grade11_trainer_id,
        active_trainer_name: activeGrade === 'Grade 12' ? b.grade12_trainer_name : b.grade11_trainer_name,
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
  });

  await logActivity(pool, {
    entity_type: 'class_session',
    entity_id: created.session_id,
    actor_type: 'Admin',
    actor_id: actor?.admin_id,
    actor_name: actor?.full_name,
    action: 'Class Session Created',
    action_detail: `${session_type} session for batch #${batch_id} on ${session_date} from ${start_time} to ${end_time}.` +
      (facility ? ` At "${facility.name}".` : '') +
      (shsCourseInfo ? ` (${shsCourseInfo.grade_level})` : ''),
  });

  return created;
};