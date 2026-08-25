// => models/Classes/adminClassSessionModel.js
// => Pure SQL layer for the Class Sessions feature - the scheduling side of
//    the Classes page, distinct from adminFacilityModel.js which only
//    handles facility CRUD. Every query takes `pool` as first param, same
//    convention as adminFacilityModel.js.

// => Facility picker list for the Class Sessions tab landing view - one row
//    per active, non-deleted facility, with its allowed course titles
//    already aggregated so the frontend doesn't need N+1 requests.
// => ASSUMPTION: only status = 'active' facilities are offered here, since
//    an inactive facility shouldn't be booked for a  session. 
export const getFacilitiesForSessionPicker = async (pool) => {
  const result = await pool.query(
    `SELECT
        f.facility_id,
        f.public_id,
        f.name,
        f.capacity,
        f.status,
        f.allows_all_courses,
        COALESCE(
          ARRAY_AGG(DISTINCT tc.title) FILTER (WHERE tc.title IS NOT NULL),
          ARRAY[]::text[]
        ) AS tesda_course_titles,
        COALESCE(
          ARRAY_AGG(DISTINCT sc.title) FILTER (WHERE sc.title IS NOT NULL),
          ARRAY[]::text[]
        ) AS shs_course_titles
       FROM facilities f
       LEFT JOIN facility_tesda_courses ftc ON ftc.facility_id = f.facility_id
       LEFT JOIN tesda_courses tc ON tc.course_id = ftc.course_id
       LEFT JOIN facility_shs_courses fsc ON fsc.facility_id = f.facility_id
       LEFT JOIN shs_courses sc ON sc.course_id = fsc.course_id
      WHERE f.deleted_at IS NULL AND f.status = 'active'
      GROUP BY f.facility_id
      ORDER BY f.name ASC`
  );
  return result.rows;
};

// => Basic facility header info for the calendar page - name + its
//    restriction ids, so the service layer can validate/filter batches
//    against it. Keyed by public_id since that's what the frontend route holds.
export const getFacilityForSessionPage = async (pool, facilityPublicId) => {
  const facilityResult = await pool.query(
    `SELECT facility_id, public_id, name, capacity, allows_all_courses, status
       FROM facilities
      WHERE public_id = $1 AND deleted_at IS NULL`,
    [facilityPublicId]
  );
  if (facilityResult.rows.length === 0) return null;
  const facility = facilityResult.rows[0];

  const [tesdaRows, shsRows] = await Promise.all([
    pool.query(`SELECT course_id FROM facility_tesda_courses WHERE facility_id = $1`, [facility.facility_id]),
    pool.query(`SELECT course_id FROM facility_shs_courses WHERE facility_id = $1`, [facility.facility_id]),
  ]);

  return {
    ...facility,
    tesda_course_ids: tesdaRows.rows.map(r => r.course_id),
    shs_course_ids: shsRows.rows.map(r => r.course_id),
  };
};

// => Every TESDA batch that's currently Pending or Ongoing, with its
//    course title and current trainer - unfiltered by facility here, the
//    service layer filters against the facility's allowed course ids
//    (or leaves it unfiltered for Mobile/Online sessions).
export const getActiveTesdaBatches = async (pool) => {
  const result = await pool.query(
    // => max_students added so the service layer can flag a batch as too
    //    large for a given facility's capacity.
    `SELECT tb.batch_id, tb.public_id, tb.status, tb.course_id, tb.max_students,
            tc.title AS course_title, nct.certification_type,
            tb.trainer_id, tr.trainer_full_name AS trainer_name
       FROM tesda_batches tb
       JOIN tesda_courses tc ON tc.course_id = tb.course_id
       LEFT JOIN national_certification_types nct ON tc.certification_id = nct.certification_id
       LEFT JOIN trainers tr ON tr.trainer_id = tb.trainer_id
      WHERE tb.status IN ('Pending', 'Ongoing')
      ORDER BY tc.title ASC, tb.batch_id ASC`
  );
  return result.rows;
};

// => Every SHS batch that's currently Pending or Ongoing, with its trainer
//    slots resolved. Courses are fetched separately below and grouped in
//    JS, since a cluster can hold more than one course per grade level -
//    joining courses directly onto this query produced a cross-join
//    duplicate row per Grade11-course x Grade12-course combination
//    whenever a cluster had more than one course on either side.
export const getActiveShsBatches = async (pool) => {
  const batchesResult = await pool.query(
    // => max_students added, same reason as getActiveTesdaBatches above.
    // => grade11_trainer_id/grade12_trainer_id dropped from this SELECT -
    //    those columns are no longer written to anywhere (see the comment
    //    on getShsBatchByPublicId in adminBatchModel.js). Trainer is now
    //    resolved per course below, from shs_batch_course_trainers.
    `SELECT sb.batch_id, sb.public_id, sb.status, sb.cluster, sb.school_year,
            sb.grade11_completed, sb.max_students,
            cl.cluster_id, cl.name AS cluster_name
       FROM shs_batches sb
       JOIN shs_clusters cl ON cl.name = sb.cluster
      WHERE sb.status IN ('Pending', 'Ongoing')
      ORDER BY cl.name ASC, sb.batch_id ASC`
  );
  const batches = batchesResult.rows;
  if (batches.length === 0) return [];

  const clusterIds = [...new Set(batches.map(b => b.cluster_id))];
  const batchIds = batches.map(b => b.batch_id);

  const [coursesResult, courseTrainersResult] = await Promise.all([
    pool.query(
      `SELECT course_id, cluster_id, grade_level, title
         FROM shs_courses
        WHERE cluster_id = ANY($1::int[])
        ORDER BY title ASC`,
      [clusterIds]
    ),
    // => Per-batch, per-course trainer assignment - a cluster can staff the
    //    same course with a different trainer in two different batch
    //    instances, so this is keyed by (batch_id, course_id), never just
    //    course_id alone.
    pool.query(
      `SELECT bct.batch_id, bct.course_id, bct.trainer_id, t.trainer_full_name AS trainer_name
         FROM shs_batch_course_trainers bct
         LEFT JOIN trainers t ON t.trainer_id = bct.trainer_id
        WHERE bct.batch_id = ANY($1::int[])`,
      [batchIds]
    ),
  ]);

  // => Lookup keyed by "batch_id-course_id" so each batch's own trainer
  //    assignment gets attached to its own copy of the course, not a
  //    shared one - two batches in the same cluster can have two
  //    different trainers on the exact same course.
  const trainerMap = new Map(
    courseTrainersResult.rows.map(r => [`${r.batch_id}-${r.course_id}`, { trainer_id: r.trainer_id, trainer_name: r.trainer_name }])
  );

  return batches.map(b => {
    // => Attaches this batch's trainer_id/trainer_name onto a course row -
    //    null/null if that course hasn't had a trainer assigned yet
    //    ("Assign later"), matching the batch detail page's behavior.
    const attachTrainer = (c) => {
      const t = trainerMap.get(`${b.batch_id}-${c.course_id}`);
      return { ...c, trainer_id: t?.trainer_id ?? null, trainer_name: t?.trainer_name ?? null };
    };
    return {
      ...b,
      grade11_courses: coursesResult.rows.filter(c => c.cluster_id === b.cluster_id && c.grade_level === 'Grade 11').map(attachTrainer),
      grade12_courses: coursesResult.rows.filter(c => c.cluster_id === b.cluster_id && c.grade_level === 'Grade 12').map(attachTrainer),
    };
  });
};

// => All sessions booked at one facility within a date range - powers the
//    calendar grid. Only ever Local sessions, since Mobile/Online have no
//    facility_id to match against.
export const getSessionsForFacility = async (pool, facilityId, startDate, endDate) => {
  const result = await pool.query(
    // => LOWER() here since the DB stores batch_type as 'TESDA'/'SHS' but
    //    the rest of the app (frontend state, badge classes, eventPropGetter)
    //    works with lowercase 'tesda'/'shs' - converted once here instead of
    //    touching every consumer.
    `SELECT cs.session_id, cs.public_id, LOWER(cs.batch_type) AS batch_type, cs.batch_id,
            cs.session_type, cs.session_date, cs.start_time, cs.end_time,
            cs.trainer_id, tr.trainer_full_name AS trainer_name,
            cs.shs_course_id, cs.mobile_location, cs.meeting_link, cs.remarks,
            cs.recurrence_group_id
       FROM class_sessions cs
       LEFT JOIN trainers tr ON tr.trainer_id = cs.trainer_id
      WHERE cs.facility_id = $1
        AND cs.session_date BETWEEN $2 AND $3
        AND cs.deleted_at IS NULL
      ORDER BY cs.session_date ASC, cs.start_time ASC`,
    [facilityId, startDate, endDate]
  );
  return result.rows;
};

// =>  - every Mobile/Online session within a date range, for the
//    "Mobile & Online" subsection table in Classes.jsx. No facility_id to
//    filter on, this is a flat list across the whole institution.
export const getRemoteSessions = async (pool, startDate, endDate) => {
  const result = await pool.query(
    `SELECT cs.session_id, cs.public_id, LOWER(cs.batch_type) AS batch_type, cs.batch_id,
            cs.session_type, cs.session_date, cs.start_time, cs.end_time,
            cs.trainer_id, tr.trainer_full_name AS trainer_name,
            cs.shs_course_id, cs.mobile_location, cs.meeting_link, cs.remarks,
            cs.recurrence_group_id
       FROM class_sessions cs
       LEFT JOIN trainers tr ON tr.trainer_id = cs.trainer_id
      WHERE cs.session_type IN ('Mobile', 'Online')
        AND cs.session_date BETWEEN $1 AND $2
        AND cs.deleted_at IS NULL
      ORDER BY cs.session_date ASC, cs.start_time ASC`,
    [startDate, endDate]
  );
  return result.rows;
};

// => Resolves a batch's integer batch_id from its public_id. Table name is
//    interpolated, not parameterized, but batchType is validated against a
//    fixed enum ('tesda' | 'shs') by the service before this ever runs, so
//    it's never raw user input reaching the query string.
export const getBatchIdFromPublicId = async (pool, batchType, batchPublicId) => {
  const table = batchType === 'shs' ? 'shs_batches' : 'tesda_batches';
  const result = await pool.query(`SELECT batch_id FROM ${table} WHERE public_id = $1`, [batchPublicId]);
  return result.rows[0]?.batch_id ?? null;
};

// => UPDATED - capacity is now checked against actual approved enrollment
//    headcount, not the batch's max_students ceiling. A batch capped at 30
//    but sitting at 20 Approved enrollees should still fit a 25-capacity
//    facility, checking max_students alone would have blocked that
//    unnecessarily.
// => Single-batch approved-enrollment count, used at save time by
//    addClassSession/addRecurringClassSessions to check facility capacity.
//    Table name interpolated same as getBatchIdFromPublicId above, same
//    justification - batchType is enum-checked by the service first.
export const getApprovedEnrollmentCount = async (pool, batchType, batchId) => {
  const table = batchType === 'shs' ? 'shs_enrollments' : 'tesda_enrollments';
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ${table} WHERE batch_id = $1 AND status = 'Approved'`,
    [batchId]
  );
  return result.rows[0]?.count ?? 0;
};

// => NEW - approved-enrollment counts for every batch of one type, grouped
//    by batch_id in a single query. Used by fetchEligibleBatchesForFacility
//    so the eligible-batches list isn't running one COUNT query per batch
//    (N+1) just to flag which ones are over capacity.
export const getApprovedEnrollmentCountsByType = async (pool, batchType) => {
  const table = batchType === 'shs' ? 'shs_enrollments' : 'tesda_enrollments';
  const result = await pool.query(
    `SELECT batch_id, COUNT(*)::int AS count
       FROM ${table}
      WHERE batch_id IS NOT NULL AND status = 'Approved'
      GROUP BY batch_id`
  );
  // => Map for O(1) lookup by batch_id when annotating the batch list.
  return new Map(result.rows.map(r => [r.batch_id, r.count]));
};

// => Every session (Local, Mobile, or Online) booked for one specific
//    batch, across all facilities - powers the Class Sessions section on
//    the batch detail pages. facility_public_id is included so a Local
//    row can link out to that facility's calendar page.
export const getSessionsForBatch = async (pool, batchTypeUpper, batchId) => {
  const result = await pool.query(
    `SELECT cs.session_id, cs.public_id, cs.session_type, cs.session_date,
            cs.start_time, cs.end_time, cs.remarks,
            cs.trainer_id, tr.trainer_full_name AS trainer_name,
            cs.facility_id, f.name AS facility_name, f.public_id AS facility_public_id,
            cs.mobile_location, cs.meeting_link, cs.recurrence_group_id
       FROM class_sessions cs
       LEFT JOIN trainers tr ON tr.trainer_id = cs.trainer_id
       LEFT JOIN facilities f ON f.facility_id = cs.facility_id
      WHERE cs.batch_type = $1 AND cs.batch_id = $2
        AND cs.deleted_at IS NULL
      ORDER BY cs.session_date ASC, cs.start_time ASC`,
    [batchTypeUpper, batchId]
  );
  return result.rows;
};


// => Course title lookup for a specific SHS course_id - used by the
//    service layer to label an SHS session with "Grade 11" or "Grade 12"
//    plus its course title.
export const getShsCourseById = async (pool, courseId) => {
  const result = await pool.query(
    `SELECT course_id, title, grade_level, cluster_id FROM shs_courses WHERE course_id = $1`,
    [courseId]
  );
  return result.rows[0] ?? null;
};

// => Facility overlap check - only meaningful for Local sessions, since
//    those are the only ones with a non-null facility_id to collide on.
export const findConflictingSession = async (pool, { facilityId, sessionDate, startTime, endTime, excludeSessionId }) => {
  const result = await pool.query(
    // => deleted_at IS NULL added - a cancelled session frees up its slot,
    //    it shouldn't keep blocking  bookings at that time.
    `SELECT session_id FROM class_sessions
      WHERE facility_id = $1
        AND session_date = $2
        AND start_time < $4
        AND end_time > $3
        AND deleted_at IS NULL
        AND ($5::int IS NULL OR session_id != $5)`,
    [facilityId, sessionDate, startTime, endTime, excludeSessionId ?? null]
  );
  return result.rows[0] ?? null;
};

// =>  - trainer overlap check, universal across ALL session types
//    (Local, Mobile, Online). Deliberately does NOT filter by facility_id -
//    a trainer physically can't be in two sessions at once no matter where
//    either one happens.
export const findConflictingTrainerSession = async (pool, { trainerId, sessionDate, startTime, endTime, excludeSessionId }) => {
  const result = await pool.query(
    `SELECT session_id FROM class_sessions
      WHERE trainer_id = $1
        AND session_date = $2
        AND start_time < $4
        AND end_time > $3
        AND deleted_at IS NULL
        AND ($5::int IS NULL OR session_id != $5)`,
    [trainerId, sessionDate, startTime, endTime, excludeSessionId ?? null]
  );
  return result.rows[0] ?? null;
};

// => Plain insert - all validation (weekday/hour window, conflict checks,
//    facility restriction check) already done by the service before this
//    runs. facility_id/mobile_location/meeting_link are mutually exclusive
//    depending on session_type, service passes null for whichever don't apply.
export const insertClassSession = async (pool, {
  batch_type, batch_id, session_type, facility_id, mobile_location, meeting_link,
  session_date, start_time, end_time, trainer_id, shs_course_id, created_by, remarks,
  recurrence_group_id, // =>  - null for a one-off session, shared UUID for every
                        //    occurrence in a repeating series so they can be traced
                        //    back to each other later if you ever need "cancel series"
}) => {
  const result = await pool.query(
    // => batch_type.toUpperCase() converts the app's lowercase 'tesda'/'shs'
    //    to whatever case the check constraint requires. RETURNING lowers it
    //    straight back so the object handed back to the service/controller
    //    still reads lowercase like everywhere else in the codebase.
    `INSERT INTO class_sessions
       (batch_type, batch_id, session_type, facility_id, mobile_location, meeting_link,
        session_date, start_time, end_time, trainer_id, shs_course_id, created_by, remarks,
        recurrence_group_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING session_id, public_id, LOWER(batch_type) AS batch_type, batch_id, session_type,
               facility_id, mobile_location, meeting_link, session_date, start_time, end_time,
               trainer_id, shs_course_id, remarks, created_at, recurrence_group_id`,
    [batch_type.toUpperCase(), batch_id, session_type, facility_id ?? null, mobile_location ?? null, meeting_link ?? null,
     session_date, start_time, end_time, trainer_id ?? null, shs_course_id ?? null, created_by, remarks ?? null,
     recurrence_group_id ?? null]
  );
  return result.rows[0];
};

// =>  - fetches one session by its public_id, used by update/cancel to
//    resolve the integer session_id and grab enough context (session_type,
//    facility_id, batch info) to re-run the same validation rules that
//    applied at creation time.
export const getSessionByPublicId = async (pool, sessionPublicId) => {
  const result = await pool.query(
    `SELECT session_id, public_id, LOWER(batch_type) AS batch_type, batch_id, session_type,
            facility_id, mobile_location, meeting_link, session_date, start_time, end_time,
            trainer_id, shs_course_id, remarks, deleted_at, recurrence_group_id
       FROM class_sessions
      WHERE public_id = $1`,
    [sessionPublicId]
  );
  return result.rows[0] ?? null;
};

// =>  - count of still-active (non-cancelled) sessions in a recurring
//    series, used to label the "Cancel Entire Series" button and to word
//    the confirm prompt before anything is actually cancelled.
export const countActiveSessionsByRecurrenceGroup = async (pool, recurrenceGroupId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM class_sessions
      WHERE recurrence_group_id = $1 AND deleted_at IS NULL`,
    [recurrenceGroupId]
  );
  return result.rows[0]?.count ?? 0;
};

// =>  - bulk soft delete for an entire recurring series in one
//    statement, rather than looping single-row updates. RETURNING gives
//    back enough to describe the cancelled range in one activity log entry.
export const softDeleteSessionsByRecurrenceGroup = async (pool, recurrenceGroupId) => {
  const result = await pool.query(
    `UPDATE class_sessions
        SET deleted_at = NOW()
      WHERE recurrence_group_id = $1 AND deleted_at IS NULL
      RETURNING session_id, public_id, session_date, start_time, end_time`,
    [recurrenceGroupId]
  );
  return result.rows;
};

// =>  - partial update for Edit. Only the fields a session's edit form
//    actually exposes - batch/course/session_type are intentionally not
//    editable here, changing those is a cancel-and-rebook, not an edit.
export const updateClassSessionRow = async (pool, sessionId, {
  session_date, start_time, end_time, trainer_id, mobile_location, meeting_link, remarks,
}) => {
  const result = await pool.query(
    `UPDATE class_sessions
        SET session_date = $2,
            start_time = $3,
            end_time = $4,
            trainer_id = $5,
            mobile_location = $6,
            meeting_link = $7,
            remarks = $8
      WHERE session_id = $1 AND deleted_at IS NULL
      RETURNING session_id, public_id, LOWER(batch_type) AS batch_type, batch_id, session_type,
                facility_id, mobile_location, meeting_link, session_date, start_time, end_time,
                trainer_id, shs_course_id, remarks, updated_at`,
    [sessionId, session_date, start_time, end_time, trainer_id ?? null, mobile_location ?? null, meeting_link ?? null, remarks ?? null]
  );
  return result.rows[0] ?? null;
};

// =>  - soft delete. Sets deleted_at instead of removing the row, so the
//    activity log entry created for this session still points at
//    something real, and the session's own creation/edit history in the
//    log stays intact for audit purposes.
export const softDeleteClassSessionRow = async (pool, sessionId) => {
  const result = await pool.query(
    `UPDATE class_sessions
        SET deleted_at = NOW()
      WHERE session_id = $1 AND deleted_at IS NULL
      RETURNING session_id, public_id`,
    [sessionId]
  );
  return result.rows[0] ?? null;
};

// =>  - every still-active session in a series dated today or later,
//    used both to run the conflict check before a series-wide time change
//    and to know which rows are actually eligible to be touched (past
//    occurrences in the series are left alone).
export const getUpcomingSessionsByRecurrenceGroup = async (pool, recurrenceGroupId, todayStr) => {
  const result = await pool.query(
    `SELECT session_id, session_date, facility_id, trainer_id, session_type
       FROM class_sessions
      WHERE recurrence_group_id = $1
        AND deleted_at IS NULL
        AND session_date >= $2
      ORDER BY session_date ASC`,
    [recurrenceGroupId, todayStr]
  );
  return result.rows;
};

// =>  - bulk time/trainer/notes update across every upcoming session in
//    a series. session_date is deliberately NOT in the SET list - each
//    occurrence keeps its own date, only these shared fields move together.
export const updateSessionsByRecurrenceGroupRow = async (pool, recurrenceGroupId, todayStr, {
  start_time, end_time, trainer_id, mobile_location, meeting_link, remarks,
}) => {
  const result = await pool.query(
    `UPDATE class_sessions
        SET start_time = $3,
            end_time = $4,
            trainer_id = $5,
            mobile_location = $6,
            meeting_link = $7,
            remarks = $8
      WHERE recurrence_group_id = $1
        AND deleted_at IS NULL
        AND session_date >= $2
      RETURNING session_id, public_id, session_date, start_time, end_time`,
    [recurrenceGroupId, todayStr, start_time, end_time, trainer_id ?? null, mobile_location ?? null, meeting_link ?? null, remarks ?? null]
  );
  return result.rows;
};