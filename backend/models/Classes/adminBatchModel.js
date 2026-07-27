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
        c.title                  AS course_name,
        nct.certification_type   AS certification_type,
        s.sector                 AS sector,
        NULL::text                AS cluster,
        i.trainer_full_name   AS trainer_name,
        COUNT(e.enrollment_id) FILTER (
          WHERE e.status NOT IN ('Rejected', 'Dropped')
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
        b.required_number_of_students, b.max_students, b.remarks,
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
        NULL::text                 AS course_name,
        NULL::text                 AS certification_type,
        NULL::text                 AS sector,
        sc.name                    AS cluster,
        -- => No single trainer_name for SHS - two slots don't collapse
        --    into one column cleanly, list view leaves it blank same as before
        NULL::text                 AS trainer_name,
        COUNT(e.enrollment_id) FILTER (
          WHERE e.status NOT IN ('Rejected', 'Dropped')
        )::int                    AS enrolled_count
      FROM shs_batches b
      LEFT JOIN shs_clusters sc   ON sc.cluster_id = b.cluster_id
      LEFT JOIN shs_enrollments e ON e.batch_id = b.batch_id
      WHERE b.status IN ('Ongoing', 'Pending')
      GROUP BY
        b.public_id, b.batch_id, b.status,
        b.start_date, b.end_date, b.required_number_of_students,
        b.max_students, b.remarks, sc.name
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
          COUNT(e.enrollment_id) FILTER (
            WHERE e.status NOT IN ('Rejected', 'Dropped')
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
          COUNT(e.enrollment_id) FILTER (
            WHERE e.status NOT IN ('Rejected', 'Dropped')
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

// => Returns true if the trainer has a row in trainer_shs_courses for a
//    course under this cluster AND at this specific grade level - matched
//    directly on cluster_id now that shs_batches/shs_enrollments are
//    FK-linked to shs_clusters, no more name matching needed
export const isTrainerQualifiedForShsGrade = async (pool, trainerId, clusterId, gradeLevel) => {
  if (!trainerId) return true; // => No trainer assigned yet - nothing to check
  const result = await pool.query(
    `SELECT 1 FROM trainer_shs_courses tsc
       JOIN shs_courses sc ON tsc.course_id = sc.course_id
      WHERE tsc.trainer_id = $1 AND sc.cluster_id = $2 AND sc.grade_level = $3`,
    [trainerId, clusterId, gradeLevel]
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
        b.status,
        b.class_type,
        b.start_date,
        b.end_date,
        b.required_number_of_students,
        b.max_students,
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

export const createTesdaBatch = async (pool, {
  trainer_id,
  course_id,
  start_date,
  end_date,
  required_number_of_students,
  max_students,
  class_type,
  remarks,
  created_by,
}) => {
  const result = await pool.query(
    `INSERT INTO tesda_batches
        (trainer_id, course_id, start_date, end_date,
         required_number_of_students, max_students, class_type, remarks, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Pending')
      RETURNING public_id, batch_id, status, start_date, end_date`,
    [
      trainer_id || null,
      course_id,
      start_date,
      end_date,
      required_number_of_students,
      max_students,
      class_type || 'Regular',
      remarks || null,
      created_by || null,
    ]
  );
  return result.rows[0];
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
            class_type                   = $6,
            groupchat_link                = $7,
            remarks                      = COALESCE($8, remarks),
            updated_at                   = NOW()
      WHERE public_id = $9
      RETURNING public_id, batch_id, trainer_id, start_date, end_date,
                required_number_of_students, max_students, class_type,
                groupchat_link, remarks`,
    [
      trainer_id || null,
      start_date || null,
      end_date || null,
      required_number_of_students,
      max_students,
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

export const getShsBatchByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        b.public_id,
        b.batch_id,
        b.status,
        b.cluster_id,
        sc.name                  AS cluster,
        b.school_year,
        b.start_date,
        b.end_date,
        b.required_number_of_students,
        b.max_students,
        b.remarks,
        b.groupchat_link,
        b.grade11_completed,
        b.updated_at,
        t11.trainer_id           AS grade11_trainer_id,
        t11.trainer_full_name    AS grade11_trainer_name,
        t11.contact_number       AS grade11_trainer_contact,
        t11.email                AS grade11_trainer_email,
        t12.trainer_id           AS grade12_trainer_id,
        t12.trainer_full_name    AS grade12_trainer_name,
        t12.contact_number       AS grade12_trainer_contact,
        t12.email                AS grade12_trainer_email,
        a.full_name  AS created_by_name,
        b.created_by AS created_by_id
      FROM shs_batches b
      LEFT JOIN shs_clusters sc ON sc.cluster_id = b.cluster_id
      LEFT JOIN trainers t11 ON b.grade11_trainer_id = t11.trainer_id
      LEFT JOIN trainers t12 ON b.grade12_trainer_id = t12.trainer_id
      LEFT JOIN admins a ON b.created_by = a.admin_id
      WHERE b.public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
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
export const createShsBatch = async (pool, {
  cluster_id,
  school_year,
  start_date,
  end_date,
  required_number_of_students,
  max_students,
  grade11_trainer_id,
  grade12_trainer_id,
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
           grade11_trainer_id, grade12_trainer_id, remarks, created_by, status, batch_sequence, batch_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Pending', $12, $13)
        RETURNING public_id, batch_id, status, start_date, end_date, batch_name, batch_sequence`,
      [
        cluster_id,
        clusterName,
        school_year || null,
        start_date || null,
        end_date || null,
        required_number_of_students,
        max_students,
        grade11_trainer_id || null,
        grade12_trainer_id || null,
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

// => Edits an existing SHS batch's editable fields. cluster is deliberately
//    NOT a parameter here - locked permanently once a batch is created,
//    same reasoning as course_id on the TESDA side.
export const updateShsBatchDetails = async (pool, publicId, {
  school_year,
  start_date,
  end_date,
  required_number_of_students,
  max_students,
  grade11_trainer_id,
  grade12_trainer_id,
  groupchat_link,
  remarks,
}) => {
  const result = await pool.query(
    `UPDATE shs_batches
        SET school_year                  = COALESCE($1, school_year),
            start_date                   = $2,
            end_date                     = $3,
            required_number_of_students  = $4,
            max_students                 = $5,
            grade11_trainer_id            = $6,
            grade12_trainer_id            = $7,
            groupchat_link                = $8,
            remarks                      = COALESCE($9, remarks),
            updated_at                   = NOW()
      WHERE public_id = $10
      RETURNING public_id, batch_id, school_year, start_date, end_date,
                required_number_of_students, max_students,
                grade11_trainer_id, grade12_trainer_id, groupchat_link, remarks`,
    [
      school_year || null,
      start_date || null,
      end_date || null,
      required_number_of_students,
      max_students,
      grade11_trainer_id || null,
      grade12_trainer_id || null,
      groupchat_link || null,
      remarks || null,
      publicId,
    ]
  );
  return result.rows[0] ?? null;
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

export const getTesdaAssignmentContext = async (pool, enrollmentPublicId, batchPublicId) => {
  const result = await pool.query(
    `SELECT
        e.enrollment_id,
        e.status            AS enrollment_status,
        e.course_id          AS enrollment_course_id,
        b.batch_id,
        b.course_id          AS batch_course_id,
        b.max_students,
        (SELECT COUNT(*) FROM tesda_enrollments
          WHERE batch_id = b.batch_id AND status NOT IN ('Rejected', 'Dropped')
        )::int               AS current_batch_count
      FROM tesda_enrollments e
      CROSS JOIN LATERAL (
        SELECT batch_id, course_id, max_students
        FROM tesda_batches
        WHERE public_id = $2
      ) b
      WHERE e.public_id = $1`,
    [enrollmentPublicId, batchPublicId]
  );
  return result.rows[0] ?? null;
};

export const assignTesdaEnrollmentToBatch = async (pool, enrollmentPublicId, batchId) => {
  const result = await pool.query(
    `UPDATE tesda_enrollments
        SET batch_id   = $1,
            updated_at = NOW()
      WHERE public_id  = $2
      RETURNING public_id, batch_id, status`,
    [batchId, enrollmentPublicId]
  );
  return result.rows[0] ?? null;
};

// => Same pattern for SHS - matches on cluster only (track removed)
export const getShsAssignmentContext = async (pool, enrollmentPublicId, batchPublicId) => {
  const result = await pool.query(
    `SELECT
        e.enrollment_id,
        e.status              AS enrollment_status,
        e.cluster_id           AS enrollment_cluster_id,
        b.batch_id,
        b.cluster_id           AS batch_cluster_id,
        b.max_students,
        (SELECT COUNT(*) FROM shs_enrollments
          WHERE batch_id = b.batch_id AND status NOT IN ('Rejected', 'Dropped')
        )::int                 AS current_batch_count
      FROM shs_enrollments e
      CROSS JOIN LATERAL (
        SELECT batch_id, cluster_id, max_students
        FROM shs_batches
        WHERE public_id = $2
      ) b
      WHERE e.public_id = $1`,
    [enrollmentPublicId, batchPublicId]
  );
  return result.rows[0] ?? null;
};

export const assignShsEnrollmentToBatch = async (pool, enrollmentPublicId, batchId) => {
  const result = await pool.query(
    `UPDATE shs_enrollments
        SET batch_id   = $1,
            updated_at = NOW()
      WHERE public_id  = $2
      RETURNING public_id, batch_id, status`,
    [batchId, enrollmentPublicId]
  );
  return result.rows[0] ?? null;
};
