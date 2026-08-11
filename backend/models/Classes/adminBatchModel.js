// => admin/models/Classes/adminBatchModel.js
// => All queries receive `pool` as a param - mirrors adminFacilityModel.js /
//    adminTrainerModel.js pattern
// => Split into per-program-type functions where the data shape differs
//    (detail, create, status, enrollment assignment); combined UNION ALL
//    functions kept for the shared list/search views
// => shs_batches now has grade11_trainer_id/grade12_trainer_id instead of a
//    single instructor_id - one SHS batch spans both grade levels at once,
//    so a single trainer slot can't represent it. TESDA keeps a single
//    trainer_id since a tesda_batches row is already scoped to one course.

// ════════════════════════════════════════════
// LIST + SEARCH (combined TESDA + SHS)
// ════════════════════════════════════════════

// GET ACTIVE BATCHES (LIST VIEW)
// => Returns only 'Ongoing' and 'Pending' batches, combining TESDA + SHS
export const getActiveBatches = async (pool) => {
  const result = await pool.query(
    `SELECT * FROM (
      SELECT
        b.public_id,
        b.batch_id,
        'TESDA'::text            AS program_type,
        b.status,
        b.start_date,
        b.end_date,
        b.required_number_of_students,
        b.max_students,
        b.remarks,
        b.batch_sequence         AS batch_sequence,
        c.title                  AS course_name,
        nct.certification_type   AS certification_type,
        s.sector                 AS sector,
        NULL::text                AS cluster,
        i.trainer_full_name   AS trainer_name,
        -- => enrolled_count now reflects only Approved enrollments, since
        --    that is the real slot-consuming status per the new business
        --    rule - Pending/Reviewed/Reserved no longer count as filled
        COUNT(e.enrollment_id) FILTER (
          WHERE e.status = 'Approved'
        )::int                   AS enrolled_count
      FROM tesda_batches b
      LEFT JOIN tesda_courses c ON b.course_id     = c.course_id
      LEFT JOIN national_certification_types nct ON c.certification_id = nct.certification_id
      LEFT JOIN sectors      s ON c.sector_id      = s.sector_id
      LEFT JOIN trainers  i ON b.trainer_id  = i.trainer_id
      LEFT JOIN tesda_enrollments e ON e.batch_id  = b.batch_id
      WHERE b.status IN ('Ongoing', 'Pending')
      GROUP BY
        b.public_id, b.batch_id, b.status,
        b.start_date, b.end_date,
        b.required_number_of_students, b.max_students, b.remarks, b.batch_sequence,
        c.title, nct.certification_type, s.sector, i.trainer_full_name

      UNION ALL

      SELECT
        b.public_id,
        b.batch_id,
        'SHS'::text               AS program_type,
        b.status,
        b.start_date,
        b.end_date,
        b.required_number_of_students,
        b.max_students,
        b.remarks,
        b.batch_sequence           AS batch_sequence,
        NULL::text                 AS course_name,
        NULL::text                 AS certification_type,
        NULL::text                 AS sector,
        sc.name                    AS cluster,
        -- => No single trainer_name for SHS - two slots don't collapse
        --    into one column cleanly, list view leaves it blank same as before
        NULL::text                 AS trainer_name,
        -- => enrolled_count now reflects only Approved enrollments, same
        --    reasoning as the TESDA branch above
        COUNT(e.enrollment_id) FILTER (
          WHERE e.status = 'Approved'
        )::int                    AS enrolled_count
      FROM shs_batches b
      LEFT JOIN shs_clusters sc   ON sc.cluster_id = b.cluster_id
      LEFT JOIN shs_enrollments e ON e.batch_id = b.batch_id
      WHERE b.status IN ('Ongoing', 'Pending')
      GROUP BY
        b.public_id, b.batch_id, b.status,
        b.start_date, b.end_date, b.required_number_of_students,
        b.max_students, b.remarks, b.batch_sequence, sc.name
    ) combined
      ORDER BY
        -- => CASE in ORDER BY isn't allowed directly after a UNION -
        --    wrapping it in a subquery (above) sidesteps that
        CASE status WHEN 'Ongoing' THEN 1 WHEN 'Pending' THEN 2 ELSE 3 END,
        start_date ASC`
  );
  return result.rows;
};

// SEARCH BATCHES
// => Searches across all statuses, combining TESDA + SHS
// => batch_name (renamed from course_name) matches TESDA course title OR
//    SHS cluster name via $2 - it's the Batch Name search box value, not
//    a TESDA-only "course" field
// => trainer_id replaces the old free-text trainer_name for TESDA - exact
//    match on the dropdown selection instead of ILIKE fuzzy matching
// => grade_level is SHS-only: filters to batches that currently have at
//    least one enrolled student in that grade (via shs_enrollments joined
//    through shs_courses.grade_level), since a batch itself isn't scoped
//    to one grade the way it is scoped to one cluster
export const searchBatches = async (pool, {
  batch_name,
  trainer_id,
  status,
  sector,
  program_type,
  cluster,
  grade_level,
  start_date_from,
  start_date_to,
}) => {
  const client = await pool.connect();
  try {
    const rows = await client.query(`
      SELECT * FROM (
        SELECT
          b.public_id,
          b.batch_id,
          'TESDA'::text            AS program_type,
          b.status,
          b.start_date,
          b.end_date,
          b.required_number_of_students,
          b.max_students,
          c.title                  AS course_name,
          nct.certification_type   AS certification_type,
          s.sector                 AS sector,
          NULL::text                AS cluster,
          i.trainer_full_name   AS trainer_name,
          -- => enrolled_count now reflects only Approved enrollments
          COUNT(e.enrollment_id) FILTER (
            WHERE e.status = 'Approved'
          )::int                   AS enrolled_count
        FROM tesda_batches b
        LEFT JOIN tesda_courses c ON b.course_id     = c.course_id
        LEFT JOIN national_certification_types nct ON c.certification_id = nct.certification_id
        LEFT JOIN sectors      s ON c.sector_id      = s.sector_id
        LEFT JOIN trainers  i ON b.trainer_id  = i.trainer_id
        LEFT JOIN tesda_enrollments e ON e.batch_id  = b.batch_id
        WHERE
          -- => Was inverted ($1 = 'SHS' let SHS-typed searches leak TESDA
          --    rows in, and excluded TESDA rows whenever TESDA was
          --    selected) - now correctly includes this branch when no
          --    type is chosen, or when TESDA specifically is chosen
          ($1::text IS NULL OR $1 = 'TESDA')
          AND ($2::text IS NULL OR c.title      ILIKE '%' || $2 || '%')
          AND ($3::int  IS NULL OR b.trainer_id = $3)
          AND ($4::text IS NULL OR b.status     = $4)
          AND ($5::text IS NULL OR s.sector      ILIKE '%' || $5 || '%')
          AND ($6::date IS NULL OR b.start_date  >= $6::date)
          AND ($7::date IS NULL OR b.start_date  <= $7::date)
        GROUP BY
          b.public_id, b.batch_id, b.status,
          b.start_date, b.end_date,
          b.required_number_of_students, b.max_students,
          c.title, nct.certification_type, s.sector, i.trainer_full_name

        UNION ALL

        SELECT
          b.public_id,
          b.batch_id,
          'SHS'::text               AS program_type,
          b.status,
          b.start_date,
          b.end_date,
          b.required_number_of_students,
          b.max_students,
          NULL::text                 AS course_name,
          NULL::text                 AS certification_type,
          NULL::text                 AS sector,
          sc.name                    AS cluster,
          NULL::text                 AS trainer_name,
          -- => enrolled_count now reflects only Approved enrollments
          COUNT(e.enrollment_id) FILTER (
            WHERE e.status = 'Approved'
          )::int                    AS enrolled_count
        FROM shs_batches b
        LEFT JOIN shs_clusters sc   ON sc.cluster_id = b.cluster_id
        LEFT JOIN shs_enrollments e ON e.batch_id = b.batch_id
        WHERE
          -- => Was inverted, same bug as the TESDA branch above - now
          --    correctly includes this branch when no type is chosen, or
          --    when SHS specifically is chosen
          ($1::text IS NULL OR $1 = 'SHS')
          -- => The Batch Name search box now also matches SHS batches by
          --    cluster name, sharing the same $2 param as TESDA's course
          --    title - matched against the joined shs_clusters.name now
          --    instead of the old denormalized text column
          AND ($2::text IS NULL OR sc.name ILIKE '%' || $2 || '%')
          AND ($8::text IS NULL OR sc.name ILIKE '%' || $8 || '%')
          AND ($4::text IS NULL OR b.status  = $4)
          AND ($6::date IS NULL OR b.start_date >= $6::date)
          AND ($7::date IS NULL OR b.start_date <= $7::date)
          -- => Grade Level: batch must have >=1 enrollment in that grade,
          --    checked via a correlated EXISTS rather than a join, since a
          --    join here would duplicate/break the enrolled_count aggregate
          AND ($9::text IS NULL OR EXISTS (
            SELECT 1 FROM shs_enrollments ge
            JOIN shs_courses gc ON ge.course_id = gc.course_id
            WHERE ge.batch_id = b.batch_id AND gc.grade_level = $9
          ))
        GROUP BY
          b.public_id, b.batch_id, b.status,
          b.start_date, b.end_date, b.required_number_of_students, b.max_students, sc.name
      ) combined
      ORDER BY
        CASE status WHEN 'Ongoing' THEN 1 WHEN 'Pending' THEN 2 ELSE 3 END,
        start_date DESC
      LIMIT 100
    `, [
      program_type     || null,
      batch_name       || null,
      trainer_id       || null,
      status           || null,
      sector           || null,
      start_date_from  || null,
      start_date_to    || null,
      cluster          || null,
      grade_level      || null,
    ]);
    return rows.rows;
  } finally {
    client.release();
  }
};

// => Looks up an admin's current display name for activity-log actor_name.
//    Duplicated here rather than importing a shared admin model, per the
//    project's "duplication over abstraction" convention.
export const getAdminNameById = async (pool, adminId) => {
  if (!adminId) return null;
  const result = await pool.query(
    `SELECT full_name FROM admins WHERE admin_id = $1`,
    [adminId]
  );
  return result.rows[0]?.full_name ?? null;
};

// GET DROPDOWN DATA FOR ADD BATCH MODAL
export const getBatchFormOptions = async (pool) => {
  const [courses, trainers, sectors, clusters, shsCourses, trainerShsCourses, trainerTesdaCourses] = await Promise.all([
    // => Joined to national_certification_types so the dropdown can show
    //    "Computer System Servicing (NC II)" instead of just the bare title
    pool.query(
      `SELECT c.course_id, c.title, c.hours, nct.certification_type
         FROM tesda_courses c
         LEFT JOIN national_certification_types nct ON c.certification_id = nct.certification_id
         WHERE c.deleted_at IS NULL
         ORDER BY c.title ASC`
    ),
    pool.query(
      `SELECT trainer_id, trainer_full_name, handles_tesda, handles_shs
         FROM trainers
         WHERE deleted_at IS NULL
         ORDER BY trainer_full_name ASC`
    ),
    pool.query(
      `SELECT sector_id, sector
         FROM sectors
         WHERE deleted_at IS NULL
         ORDER BY sector ASC`
    ),
    pool.query(
      `SELECT cluster_id, name
         FROM shs_clusters
         WHERE deleted_at IS NULL
         ORDER BY name ASC`
    ),
    // => Used to show "Courses under this Cluster, split by Grade Level"
    //    as a read-only reference once a cluster is selected/locked -
    //    replaces the School Year field entirely
    pool.query(
      `SELECT course_id, title, cluster_id, grade_level
         FROM shs_courses
         WHERE deleted_at IS NULL
         ORDER BY grade_level ASC, title ASC`
    ),
    // => Raw (trainer_id, course_id) pairs - lets the frontend hard-filter
    //    the Grade 11/Grade 12 Trainer dropdowns to only actually-qualified
    //    trainers, not just anyone with handles_shs = true
    pool.query(`SELECT trainer_id, course_id FROM trainer_shs_courses`),
    // => Same idea for TESDA - lets the Trainer dropdown hard-filter to
    //    only trainers accredited for the specific course being assigned,
    //    not just anyone with handles_tesda = true
    pool.query(`SELECT trainer_id, course_id FROM trainer_tesda_courses`),
  ]);

  return {
    courses:             courses.rows,
    trainers:            trainers.rows,
    sectors:             sectors.rows,
    clusters:            clusters.rows,
    shsCourses:          shsCourses.rows,
    trainerShsCourses:   trainerShsCourses.rows,
    trainerTesdaCourses: trainerTesdaCourses.rows,
  };
};

// ════════════════════════════════════════════
// TRAINER QUALIFICATION CHECKS
// => TESDA: hard-blocked at the service layer, no override - mirrors the
//    real TESDA accreditation form (a trainer either is or isn't accredited
//    for a course, no substitute path)
// => SHS: soft-checked - the service layer allows a confirmed override,
//    since a substitute trainer covering a batch is a legitimate scenario
// ════════════════════════════════════════════

// => Returns true if the trainer has a row in trainer_tesda_courses for
//    this exact course
export const isTrainerQualifiedForTesdaCourse = async (pool, trainerId, courseId) => {
  if (!trainerId) return true; // => No trainer assigned yet - nothing to check
  const result = await pool.query(
    `SELECT 1 FROM trainer_tesda_courses WHERE trainer_id = $1 AND course_id = $2`,
    [trainerId, courseId]
  );
  return result.rows.length > 0;
};

// => Returns true if the trainer has a row in trainer_shs_courses for this
//    exact course_id - qualification is now checked per course, not per
//    grade level, since a cluster can have multiple courses per grade,
//    each potentially needing a different qualified trainer
export const isTrainerQualifiedForShsCourse = async (pool, trainerId, courseId) => {
  if (!trainerId) return true; // => No trainer assigned yet - nothing to check
  const result = await pool.query(
    `SELECT 1 FROM trainer_shs_courses WHERE trainer_id = $1 AND course_id = $2`,
    [trainerId, courseId]
  );
  return result.rows.length > 0;
};

// ════════════════════════════════════════════
// TESDA BATCH DETAIL
// ════════════════════════════════════════════

export const getTesdaBatchByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        b.public_id,
        b.batch_id,
        b.batch_sequence,
        b.status,
        b.class_type,
        b.start_date,
        b.end_date,
        b.required_number_of_students,
        b.max_students,
        b.max_applicants,
        b.remarks,
        b.groupchat_link,
        b.updated_at,
        c.title                AS course_name,
        c.course_id,
        c.hours,
        c.amount,
        nct.certification_type AS certification_type,
        s.sector                AS sector,
        i.trainer_id,
        i.trainer_full_name AS trainer_name,
        i.contact_number        AS trainer_contact,
        i.email                 AS trainer_email,
        a.full_name             AS created_by_name,
        b.created_by             AS created_by_id
      FROM tesda_batches b
      LEFT JOIN tesda_courses c ON b.course_id     = c.course_id
      LEFT JOIN national_certification_types nct ON c.certification_id = nct.certification_id
      LEFT JOIN sectors      s ON c.sector_id      = s.sector_id
      LEFT JOIN trainers  i ON b.trainer_id  = i.trainer_id
      LEFT JOIN admins       a ON b.created_by     = a.admin_id
      WHERE b.public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// => Corrected sp.surname -> sp.last_name (surname does not exist as a
//    column on student_profile; this was silently broken before)
export const getEnrolledStudentsByTesdaBatchId = async (pool, batchId) => {
  const result = await pool.query(
    `SELECT
        e.public_id         AS enrollment_public_id,
        e.status            AS enrollment_status,
        e.submitted_at,
        sp.first_name,
        sp.middle_name,
        sp.last_name,
        sp.name_extension,
        sa.username          AS student_email
      FROM tesda_enrollments e
      JOIN  student_accounts sa    ON e.student_id  = sa.student_id
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      WHERE e.batch_id = $1
        AND e.status NOT IN ('Rejected', 'Dropped')
      ORDER BY sp.last_name ASC NULLS LAST, sp.first_name ASC NULLS LAST`,
    [batchId]
  );
  return result.rows;
};

export const updateTesdaBatchStatus = async (pool, publicId, newStatus, remarks) => {
  const result = await pool.query(
    `UPDATE tesda_batches
        SET status     = $1,
            updated_at = NOW(),
            remarks    = $3
      WHERE public_id  = $2
      RETURNING public_id, status`,
    [newStatus, publicId, remarks]
  );
  return result.rows[0] ?? null;
};

// => Mirrors createShsBatch below - batch_sequence/batch_name are computed
//    inside the same locked transaction, scoped by course_id since a
//    tesda_batches row is already scoped to one course (SHS scopes by
//    cluster_id instead, since one cluster spans multiple course offerings)
export const createTesdaBatch = async (pool, {
  trainer_id,
  course_id,
  start_date,
  end_date,
  required_number_of_students,
  max_students,
  max_applicants,
  class_type,
  remarks,
  created_by,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // => Released automatically at COMMIT/ROLLBACK - serializes only
    //    creates for this same course_id, other courses are unaffected
    await client.query('SELECT pg_advisory_xact_lock($1)', [course_id]);

    const courseResult = await client.query(
      `SELECT title FROM tesda_courses WHERE course_id = $1`,
      [course_id]
    );
    const courseTitle = courseResult.rows[0]?.title ?? 'Untitled Course';

    const seqResult = await client.query(
      `SELECT COALESCE(MAX(batch_sequence), 0) + 1 AS next_seq
         FROM tesda_batches WHERE course_id = $1`,
      [course_id]
    );
    const nextSeq = seqResult.rows[0].next_seq;
    const batchName = `${courseTitle} Batch ${nextSeq}`;

    const result = await client.query(
      `INSERT INTO tesda_batches
          (trainer_id, course_id, start_date, end_date, required_number_of_students,
           max_students, max_applicants, class_type, remarks, created_by, status, batch_sequence, batch_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Pending', $11, $12)
        RETURNING public_id, batch_id, status, start_date, end_date, batch_name, batch_sequence`,
      [
        trainer_id || null,
        course_id,
        start_date || null,
        end_date || null,
        required_number_of_students,
        max_students,
        max_applicants,
        class_type || 'Regular',
        remarks || null,
        created_by || null,
        nextSeq,
        batchName,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// => Edits an existing TESDA batch's editable fields. course_id is
//    deliberately NOT a parameter here - it's locked permanently once a
//    batch is created, since students may already be enrolled against it.
//    Changing the course requires dissolving the batch and creating a new
//    one instead, not an in-place edit.
export const updateTesdaBatchDetails = async (pool, publicId, {
  trainer_id,
  start_date,
  end_date,
  required_number_of_students,
  max_students,
  max_applicants,
  class_type,
  groupchat_link,
  remarks,
}) => {
  const result = await pool.query(
    `UPDATE tesda_batches
        SET trainer_id                   = $1,
            start_date                   = $2,
            end_date                     = $3,
            required_number_of_students  = $4,
            max_students                 = $5,
            max_applicants               = $6,
            class_type                   = $7,
            groupchat_link                = $8,
            remarks                      = COALESCE($9, remarks),
            updated_at                   = NOW()
      WHERE public_id = $10
      RETURNING public_id, batch_id, trainer_id, start_date, end_date,
                required_number_of_students, max_students, max_applicants,
                class_type, groupchat_link, remarks`,
    [
      trainer_id || null,
      start_date || null,
      end_date || null,
      required_number_of_students,
      max_students,
      max_applicants,
      class_type || 'Regular',
      groupchat_link || null,
      remarks || null,
      publicId,
    ]
  );
  return result.rows[0] ?? null;
};

// ════════════════════════════════════════════
// SHS BATCH DETAIL
// ════════════════════════════════════════════

// => grade11_trainer_id/grade12_trainer_id are no longer selected here -
//    per-course trainer assignments now come from getShsBatchCourseTrainers
//    below. The two columns still physically exist on shs_batches for now
//    (dropped in a later cleanup pass per the standard migration pattern),
//    just no longer read or written.
export const getShsBatchByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        b.public_id,
        b.batch_id,
        b.batch_sequence,
        b.status,
        b.cluster_id,
        sc.name                  AS cluster,
        b.school_year,
        b.start_date,
        b.end_date,
        b.required_number_of_students,
        b.max_students,
        b.max_applicants,
        b.remarks,
        b.groupchat_link,
        b.grade11_completed,
        b.updated_at,
        a.full_name  AS created_by_name,
        b.created_by AS created_by_id
      FROM shs_batches b
      LEFT JOIN shs_clusters sc ON sc.cluster_id = b.cluster_id
      LEFT JOIN admins a ON b.created_by = a.admin_id
      WHERE b.public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// => Per-course trainer assignments for one batch - replaces the old fixed
//    grade11_trainer_id/grade12_trainer_id columns. One row per course
//    under the batch's cluster (both grades), trainer_id/trainer_full_name
//    come back null if that specific course hasn't had a trainer assigned
//    yet ("Assign later").
export const getShsBatchCourseTrainers = async (pool, batchId) => {
  const result = await pool.query(
    `SELECT
        sc.course_id,
        sc.title          AS course_title,
        sc.grade_level,
        bct.trainer_id,
        t.trainer_full_name,
        t.contact_number  AS trainer_contact,
        t.email           AS trainer_email
      FROM shs_batches b
      JOIN shs_courses sc ON sc.cluster_id = b.cluster_id
      LEFT JOIN shs_batch_course_trainers bct
        ON bct.batch_id = b.batch_id AND bct.course_id = sc.course_id
      LEFT JOIN trainers t ON t.trainer_id = bct.trainer_id
      WHERE b.batch_id = $1
      ORDER BY sc.grade_level ASC, sc.title ASC`,
    [batchId]
  );
  return result.rows;
};

export const getEnrolledStudentsByShsBatchId = async (pool, batchId) => {
  const result = await pool.query(
    `SELECT
        e.public_id         AS enrollment_public_id,
        e.status            AS enrollment_status,
        e.submitted_at,
        sp.first_name,
        sp.middle_name,
        sp.last_name,
        sp.name_extension,
        sa.username          AS student_email,
        -- => Grade level comes from the enrolled course, not the batch
        --    itself, since a batch spans both grades
        sc.grade_level
      FROM shs_enrollments e
      JOIN  student_accounts sa    ON e.student_id  = sa.student_id
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      LEFT JOIN shs_courses sc     ON e.course_id    = sc.course_id
      WHERE e.batch_id = $1
        AND e.status NOT IN ('Rejected', 'Dropped')
      ORDER BY sp.last_name ASC NULLS LAST, sp.first_name ASC NULLS LAST`,
    [batchId]
  );
  return result.rows;
};

export const updateShsBatchStatus = async (pool, publicId, newStatus, remarks) => {
  const result = await pool.query(
    `UPDATE shs_batches
        SET status     = $1,
            updated_at = NOW(),
            remarks    = $3
      WHERE public_id  = $2
      RETURNING public_id, status`,
    [newStatus, publicId, remarks]
  );
  return result.rows[0] ?? null;
};

// => batch_name is generated here, not passed in - {cluster name} Batch {N},
//    N scoped per cluster_id and never reused, for audit purposes. Wrapped
//    in a transaction with an advisory lock keyed by cluster_id so two
//    concurrent creates for the same cluster can't grab the same sequence.
// => cluster text is still written alongside cluster_id, kept in sync until
//    the old denormalized column is dropped in a later cleanup pass
// => course_trainers replaces grade11_trainer_id/grade12_trainer_id - an
//    array of { course_id, trainer_id } pairs, one entry per course under
//    the cluster (trainer_id null = "Assign later" for that course).
//    Written into shs_batch_course_trainers in the same transaction as the
//    batch row, so a partial write can never leave a batch with some
//    courses assigned and others silently missing.
export const createShsBatch = async (pool, {
  cluster_id,
  school_year,
  start_date,
  end_date,
  required_number_of_students,
  max_students,
  max_applicants,
  course_trainers,
  remarks,
  created_by,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // => Released automatically at COMMIT/ROLLBACK - serializes only
    //    creates for this same cluster_id, other clusters are unaffected
    await client.query('SELECT pg_advisory_xact_lock($1)', [cluster_id]);

    const clusterResult = await client.query(
      `SELECT name FROM shs_clusters WHERE cluster_id = $1`,
      [cluster_id]
    );
    const clusterName = clusterResult.rows[0]?.name ?? 'Untitled Cluster';

    const seqResult = await client.query(
      `SELECT COALESCE(MAX(batch_sequence), 0) + 1 AS next_seq
         FROM shs_batches WHERE cluster_id = $1`,
      [cluster_id]
    );
    const nextSeq = seqResult.rows[0].next_seq;
    const batchName = `${clusterName} Batch ${nextSeq}`;

    const result = await client.query(
      `INSERT INTO shs_batches
          (cluster_id, cluster, school_year, start_date, end_date, required_number_of_students, max_students,
           max_applicants, remarks, created_by, status, batch_sequence, batch_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Pending', $11, $12)
        RETURNING public_id, batch_id, status, start_date, end_date, batch_name, batch_sequence`,
      [
        cluster_id,
        clusterName,
        school_year || null,
        start_date || null,
        end_date || null,
        required_number_of_students,
        max_students,
        max_applicants,
        remarks || null,
        created_by || null,
        nextSeq,
        batchName,
      ]
    );
    const batch = result.rows[0];

    for (const { course_id, trainer_id } of (course_trainers || [])) {
      await client.query(
        `INSERT INTO shs_batch_course_trainers (batch_id, course_id, trainer_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (batch_id, course_id) DO UPDATE SET trainer_id = EXCLUDED.trainer_id, updated_at = NOW()`,
        [batch.batch_id, course_id, trainer_id || null]
      );
    }

    await client.query('COMMIT');
    return batch;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// => Edits an existing SHS batch's editable fields. cluster is deliberately
//    NOT a parameter here - locked permanently once a batch is created,
//    same reasoning as course_id on the TESDA side.
// => course_trainers replaces grade11_trainer_id/grade12_trainer_id, same
//    shape as createShsBatch - re-synced into shs_batch_course_trainers
//    inside the same transaction as the batch row update.
export const updateShsBatchDetails = async (pool, publicId, {
  school_year,
  start_date,
  end_date,
  required_number_of_students,
  max_students,
  max_applicants,
  course_trainers,
  groupchat_link,
  remarks,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE shs_batches
          SET school_year                  = COALESCE($1, school_year),
              start_date                   = $2,
              end_date                     = $3,
              required_number_of_students  = $4,
              max_students                 = $5,
              max_applicants               = $6,
              groupchat_link                = $7,
              remarks                      = COALESCE($8, remarks),
              updated_at                   = NOW()
        WHERE public_id = $9
        RETURNING public_id, batch_id, school_year, start_date, end_date,
                  required_number_of_students, max_students, max_applicants,
                  groupchat_link, remarks`,
      [
        school_year || null,
        start_date || null,
        end_date || null,
        required_number_of_students,
        max_students,
        max_applicants,
        groupchat_link || null,
        remarks || null,
        publicId,
      ]
    );
    const batch = result.rows[0];
    if (!batch) {
      await client.query('ROLLBACK');
      return null;
    }

    for (const { course_id, trainer_id } of (course_trainers || [])) {
      await client.query(
        `INSERT INTO shs_batch_course_trainers (batch_id, course_id, trainer_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (batch_id, course_id) DO UPDATE SET trainer_id = EXCLUDED.trainer_id, updated_at = NOW()`,
        [batch.batch_id, course_id, trainer_id || null]
      );
    }

    await client.query('COMMIT');
    return batch;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// => Dedicated single-column update for the Grade 11 completion flag - kept
//    separate from updateShsBatchDetails above, since that function requires
//    the full batch info form (required_number_of_students, max_students,
//    etc.) on every call. This is a one-off action, not a form edit, same
//    reasoning as why status changes get their own dedicated endpoint too.
export const markShsBatchGrade11Completed = async (pool, publicId) => {
  const result = await pool.query(
    `UPDATE shs_batches
        SET grade11_completed = TRUE,
            updated_at = NOW()
      WHERE public_id = $1
      RETURNING public_id, batch_id, grade11_completed`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// ════════════════════════════════════════════
// ENROLLMENT -> BATCH ASSIGNMENT
// => Handles the "Reserved" enrollment business rule: a student can enroll
//    into a course/track that has no batch scheduled yet. batch_id stays
//    NULL and status = 'Reserved' until an admin assigns a batch later.
// => Writes to tesda_enrollments / shs_enrollments, not the batch tables
//    themselves - lives here since the operation is batch-centric (admin
//    picks a batch, then assigns a waiting enrollment into it)
// ════════════════════════════════════════════

// => Locked, atomic version of assignment - resolves the batch's public_id
//    to its internal batch_id first, acquires pg_advisory_xact_lock on
//    that batch_id, then re-checks course match, pool cap, and Approved
//    capacity ALL inside the lock before writing. This replaces the old
//    getTesdaAssignmentContext + assignTesdaEnrollmentToBatch two-step
//    pattern, which had a race window: two staff assigning into the same
//    near-full batch at once could both pass the checks before either
//    write committed. Same lock pattern as approveTesdaEnrollmentWithLock.
export const assignTesdaEnrollmentWithLock = async (pool, enrollmentPublicId, batchPublicId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const batchLookup = await client.query(
      `SELECT batch_id, course_id, max_students, max_applicants
         FROM tesda_batches WHERE public_id = $1`,
      [batchPublicId]
    );
    const batchRow = batchLookup.rows[0];
    if (!batchRow) throw new Error('Batch not found.');

    await client.query('SELECT pg_advisory_xact_lock($1)', [batchRow.batch_id]);

    // => Re-fetched now that the lock is held, so course match and both
    //    counts reflect the true state at the moment of assignment
    const enrollmentResult = await client.query(
      `SELECT enrollment_id, status, course_id, batch_id
         FROM tesda_enrollments WHERE public_id = $1`,
      [enrollmentPublicId]
    );
    const enrollment = enrollmentResult.rows[0];
    if (!enrollment) throw new Error('Enrollment not found.');

    if (enrollment.course_id !== batchRow.course_id) {
      throw new Error('This batch does not offer the course the student enrolled in.');
    }

    const countResult = await client.query(
      `SELECT
          COUNT(*) FILTER (WHERE status = 'Approved')::int AS approved_count,
          COUNT(*) FILTER (WHERE status NOT IN ('Rejected', 'Dropped'))::int AS pool_count
        FROM tesda_enrollments
        WHERE batch_id = $1`,
      [batchRow.batch_id]
    );
    const { approved_count, pool_count } = countResult.rows[0];

    // => Pool cap checked first - assigning adds to total applicant
    //    volume even before the student is Approved
    if (pool_count >= batchRow.max_applicants) {
      throw new Error("This batch's applicant pool is already full.");
    }
    // => Approved-capacity is the hard ceiling regardless of pool room -
    //    a batch that's already full on Approved never accepts more,
    //    max_applicants is only leeway during the pre-Approval phase
    if (approved_count >= batchRow.max_students) {
      throw new Error('This batch is already full.');
    }

    const updateResult = await client.query(
      `UPDATE tesda_enrollments
          SET batch_id = $1, updated_at = NOW()
        WHERE public_id = $2
        RETURNING public_id, batch_id, status`,
      [batchRow.batch_id, enrollmentPublicId]
    );

    await client.query('COMMIT');
    return updateResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// => Same locked pattern for SHS - matches on cluster only (track removed)
export const assignShsEnrollmentWithLock = async (pool, enrollmentPublicId, batchPublicId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const batchLookup = await client.query(
      `SELECT batch_id, cluster_id, max_students, max_applicants
         FROM shs_batches WHERE public_id = $1`,
      [batchPublicId]
    );
    const batchRow = batchLookup.rows[0];
    if (!batchRow) throw new Error('Batch not found.');

    await client.query('SELECT pg_advisory_xact_lock($1)', [batchRow.batch_id]);

    const enrollmentResult = await client.query(
      `SELECT enrollment_id, status, cluster_id, batch_id
         FROM shs_enrollments WHERE public_id = $1`,
      [enrollmentPublicId]
    );
    const enrollment = enrollmentResult.rows[0];
    if (!enrollment) throw new Error('Enrollment not found.');

    if (enrollment.cluster_id && enrollment.cluster_id !== batchRow.cluster_id) {
      throw new Error("This batch does not match the student's cluster.");
    }

    const countResult = await client.query(
      `SELECT
          COUNT(*) FILTER (WHERE status = 'Approved')::int AS approved_count,
          COUNT(*) FILTER (WHERE status NOT IN ('Rejected', 'Dropped'))::int AS pool_count
        FROM shs_enrollments
        WHERE batch_id = $1`,
      [batchRow.batch_id]
    );
    const { approved_count, pool_count } = countResult.rows[0];

    if (pool_count >= batchRow.max_applicants) {
      throw new Error("This batch's applicant pool is already full.");
    }
    if (approved_count >= batchRow.max_students) {
      throw new Error('This batch is already full.');
    }

    const updateResult = await client.query(
      `UPDATE shs_enrollments
          SET batch_id = $1, updated_at = NOW()
        WHERE public_id = $2
        RETURNING public_id, batch_id, status`,
      [batchRow.batch_id, enrollmentPublicId]
    );

    await client.query('COMMIT');
    return updateResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ════════════════════════════════════════════
// BULK RELEASE: overflow back to Reserved
// => Manual, staff-initiated trigger for the same outcome the automatic
//    sweep produces - only usable once the batch has actually reached
//    max_students on Approved count. Releases every remaining
//    Pending/Reviewed/Needs Clarification enrollment in the batch back
//    to Reserved, all in one locked transaction.
// ════════════════════════════════════════════

export const bulkReleaseTesdaEnrollmentsFromBatch = async (pool, batchId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('SELECT pg_advisory_xact_lock($1)', [batchId]);

    const batchResult = await client.query(
      `SELECT max_students FROM tesda_batches WHERE batch_id = $1`,
      [batchId]
    );
    const batch = batchResult.rows[0];
    if (!batch) throw new Error('Batch not found.');

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS approved_count
         FROM tesda_enrollments
        WHERE batch_id = $1 AND status = 'Approved'`,
      [batchId]
    );
    const approvedCount = countResult.rows[0].approved_count;

    if (approvedCount < batch.max_students) {
      throw new Error('Cannot bulk-release: this batch has not reached its max_students capacity yet.');
    }

    const sweepResult = await client.query(
      `UPDATE tesda_enrollments
          SET batch_id = NULL, status = 'Reserved', updated_at = NOW()
        WHERE batch_id = $1 AND status IN ('Pending', 'Reviewed', 'Needs Clarification')
        RETURNING public_id, enrollment_id, student_id`,
      [batchId]
    );

    await client.query('COMMIT');
    return sweepResult.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const bulkReleaseShsEnrollmentsFromBatch = async (pool, batchId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('SELECT pg_advisory_xact_lock($1)', [batchId]);

    const batchResult = await client.query(
      `SELECT max_students FROM shs_batches WHERE batch_id = $1`,
      [batchId]
    );
    const batch = batchResult.rows[0];
    if (!batch) throw new Error('Batch not found.');

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS approved_count
         FROM shs_enrollments
        WHERE batch_id = $1 AND status = 'Approved'`,
      [batchId]
    );
    const approvedCount = countResult.rows[0].approved_count;

    if (approvedCount < batch.max_students) {
      throw new Error('Cannot bulk-release: this batch has not reached its max_students capacity yet.');
    }

    const sweepResult = await client.query(
      `UPDATE shs_enrollments
          SET batch_id = NULL, status = 'Reserved', updated_at = NOW()
        WHERE batch_id = $1 AND status IN ('Pending', 'Reviewed', 'Needs Clarification')
        RETURNING public_id, enrollment_id, student_id`,
      [batchId]
    );

    await client.query('COMMIT');
    return sweepResult.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// 
// BATCH MISCELLANEOUS FEES
// => batch_type + batch_id mirrors class_sessions.batch_type / payments.
//    enrollment_type - no DB-level FK is possible across two tables, so
//    the caller is responsible for resolving/validating the batch's
//    numeric id via getTesdaBatchByPublicId / getShsBatchByPublicId
//    before calling these, same as every other batch mutation in this file.
// 

export const getMiscFeesByBatch = async (pool, batchType, batchId) => {
  const result = await pool.query(
    `SELECT public_id, fee_label, fee_amount, created_at
       FROM batch_misc_fees
       WHERE batch_type = $1 AND batch_id = $2
       ORDER BY created_at ASC`,
    [batchType, batchId]
  );
  return result.rows;
};

export const addBatchMiscFee = async (pool, { batchType, batchId, feeLabel, feeAmount, createdBy }) => {
  const result = await pool.query(
    `INSERT INTO batch_misc_fees (batch_type, batch_id, fee_label, fee_amount, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING public_id, fee_label, fee_amount, created_at`,
    [batchType, batchId, feeLabel, feeAmount, createdBy]
  );
  return result.rows[0];
};

// => Returns batch_type/batch_id on the deleted row too, so the service
//    layer can log the deletion against the right batch's activity log
//    (getActivityLogsForEntity already keys off 'tesda_batch'/'shs_batch'
//    + batch_id elsewhere in this file).
export const deleteBatchMiscFee = async (pool, feePublicId) => {
  const result = await pool.query(
    `DELETE FROM batch_misc_fees
       WHERE public_id = $1
       RETURNING public_id, batch_type, batch_id, fee_label, fee_amount`,
    [feePublicId]
  );
  return result.rows[0] ?? null;
};
