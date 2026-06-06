// => admin/models/adminClassModel.js
// => All queries receive `pool` as a param - mirrors adminEnrollmentModel.js pattern
// => Only admins call these

// GET ACTIVE CLASSES (LIST VIEW)
// => Returns only 'Ongoing' and 'Planned' classes
// => Ongoing first (already started), then Planned (upcoming)
// => Joined with course, sector, branch, and instructor for display
// => enrolled_count = students currently in the class (non-rejected, non-dropped)

export const getActiveClasses = async (pool) => {
  const result = await pool.query(
    `SELECT
        cl.public_id,
        cl.class_id,
        cl.status,
        cl.start_date,
        cl.end_date,
        cl.required_number_of_students,
        cl.max_students,
        cl.remarks,
        -- => Course info
        c.title                AS course_name,
        s.sector               AS sector,
        -- => Branch
        b.branch_name,
        -- => Instructor (nullable - instructor_id is nullable per schema)
        i.instructor_full_name AS instructor_name,
        -- => How many students are actively enrolled in this class
        COUNT(e.enrollment_id) FILTER (
          WHERE e.status NOT IN ('Rejected', 'Dropped')
        )::int                 AS enrolled_count
      FROM classes cl
      LEFT JOIN courses   c ON cl.course_id    = c.course_id
      LEFT JOIN sectors   s ON c.sector_id     = s.sector_id
      LEFT JOIN branches  b ON cl.branch_id    = b.branch_id
      LEFT JOIN instructors i ON cl.instructor_id = i.instructor_id
      LEFT JOIN enrollment  e ON e.class_id    = cl.class_id
      WHERE cl.status IN ('Ongoing', 'Planned')
      GROUP BY
        cl.public_id, cl.class_id, cl.status,
        cl.start_date, cl.end_date,
        cl.required_number_of_students, cl.max_students, cl.remarks,
        c.title, s.sector, b.branch_name, i.instructor_full_name
      ORDER BY
        -- => Ongoing first, then Planned
        CASE cl.status WHEN 'Ongoing' THEN 1 WHEN 'Planned' THEN 2 ELSE 3 END,
        cl.start_date ASC`
  );
  return result.rows;
};

// GET CLASS DETAIL BY PUBLIC ID
// => Full class row + joins; used by ClassDetail page
export const getClassByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        cl.public_id,
        cl.class_id,
        cl.status,
        cl.start_date,
        cl.end_date,
        cl.required_number_of_students,
        cl.max_students,
        cl.remarks,
        cl.updated_at,
        -- => Course info
        c.title                AS course_name,
        c.course_id,
        -- => Duration comes from courses table (hours)
        c.hours,
        s.sector               AS sector,
        -- => Branch
        b.branch_id,
        b.branch_name,
        -- => Instructor
        i.instructor_id,
        i.instructor_full_name AS instructor_name,
        i.contact_number       AS instructor_contact,
        i.email                AS instructor_email,
        -- => Which admin created this class
        a.full_name            AS created_by_name,
        cl.created_by          AS created_by_id
      FROM classes cl
      LEFT JOIN courses     c ON cl.course_id     = c.course_id
      LEFT JOIN sectors     s ON c.sector_id      = s.sector_id
      LEFT JOIN branches    b ON cl.branch_id     = b.branch_id
      LEFT JOIN instructors i ON cl.instructor_id = i.instructor_id
      LEFT JOIN admins      a ON cl.created_by    = a.admin_id
      WHERE cl.public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// GET ENROLLED STUDENTS FOR A CLASS
// => Returns all enrollments linked to this class_id
// => Only non-dropped, non-rejected students
export const getEnrolledStudentsByClassId = async (pool, classId) => {
  const result = await pool.query(
    `SELECT
        e.public_id         AS enrollment_public_id,
        e.status            AS enrollment_status,
        e.submitted_at,
        sp.first_name,
        sp.middle_name,
        sp.surname,
        sp.name_extension,
        sa.username         AS student_email
      FROM enrollment e
      JOIN  student_accounts sa    ON e.student_id  = sa.student_id
      LEFT JOIN student_profile sp ON sp.student_id = sa.student_id
      WHERE e.class_id = $1
        AND e.status NOT IN ('Rejected', 'Dropped')
      ORDER BY sp.surname ASC NULLS LAST, sp.first_name ASC NULLS LAST`,
    [classId]
  );
  return result.rows;
};

// UPDATE CLASS STATUS
// => Called when admin changes status from ClassDetail
export const updateClassStatus = async (pool, publicId, newStatus) => {
  const result = await pool.query(
    `UPDATE classes
        SET status     = $1,
            updated_at = NOW()
      WHERE public_id  = $2
      RETURNING public_id, status`,
    [newStatus, publicId]
  );
  return result.rows[0] ?? null;
};

// CREATE CLASS
// => Inserts a new class row; returns the created row with public_id
export const createClass = async (pool, {
  instructor_id,
  course_id,
  branch_id,
  start_date,
  end_date,
  required_number_of_students,
  max_students,
  remarks,
  created_by,
}) => {
  const result = await pool.query(
    `INSERT INTO classes
        (instructor_id, course_id, branch_id, start_date, end_date,
         required_number_of_students, max_students, remarks, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Planned')
      RETURNING public_id, class_id, status, start_date, end_date`,
    [
      instructor_id || null,
      course_id,
      branch_id,
      start_date,
      end_date,
      required_number_of_students,
      max_students,
      remarks || null,
      created_by || null,
    ]
  );
  return result.rows[0];
};

// SEARCH CLASSES
// => Searches across all statuses
// => Filters: course_name, branch_name, instructor_name, status, sector
export const searchClasses = async (pool, {
  course_name,
  branch_name,
  instructor_name,
  status,
  sector,
  start_date_from,
  start_date_to,
}) => {
  const client = await pool.connect();
  try {
    const rows = await client.query(`
      SELECT
        cl.public_id,
        cl.class_id,
        cl.status,
        cl.start_date,
        cl.end_date,
        cl.required_number_of_students,
        cl.max_students,
        c.title                AS course_name,
        s.sector               AS sector,
        b.branch_name,
        i.instructor_full_name AS instructor_name,
        COUNT(e.enrollment_id) FILTER (
          WHERE e.status NOT IN ('Rejected', 'Dropped')
        )::int                 AS enrolled_count
      FROM classes cl
      LEFT JOIN courses     c ON cl.course_id     = c.course_id
      LEFT JOIN sectors     s ON c.sector_id      = s.sector_id
      LEFT JOIN branches    b ON cl.branch_id     = b.branch_id
      LEFT JOIN instructors i ON cl.instructor_id = i.instructor_id
      LEFT JOIN enrollment  e ON e.class_id       = cl.class_id
      WHERE
        ($1::text IS NULL OR c.title                 ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR b.branch_name       ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR i.instructor_full_name ILIKE '%' || $3 || '%')
        AND ($4::text IS NULL OR cl.status           = $4)
        AND ($5::text IS NULL OR s.sector            ILIKE '%' || $5 || '%')
        AND ($6::date IS NULL OR cl.start_date       >= $6::date)
        AND ($7::date IS NULL OR cl.start_date       <= $7::date)
      GROUP BY
        cl.public_id, cl.class_id, cl.status,
        cl.start_date, cl.end_date,
        cl.required_number_of_students, cl.max_students,
        c.title, s.sector, b.branch_name, i.instructor_full_name
      ORDER BY
        CASE cl.status WHEN 'Ongoing' THEN 1 WHEN 'Planned' THEN 2 ELSE 3 END,
        cl.start_date DESC
      LIMIT 100
    `, [
      course_name      || null,
      branch_name      || null,
      instructor_name  || null,
      status           || null,
      sector           || null,
      start_date_from  || null,
      start_date_to    || null,
    ]);
    return rows.rows;
  } finally {
    client.release();
  }
};

// GET DROPDOWN DATA FOR ADD CLASS MODAL
// => Returns all active courses, branches, and instructors
// => Used to populate the form selects
export const getClassFormOptions = async (pool) => {
  // => Fetch courses, branches, and sectors in parallel
  const [courses, branches, instructors, sectors] = await Promise.all([
    pool.query(
      `SELECT course_id, title, hours
         FROM courses
         ORDER BY title ASC`
    ),
    pool.query(
      `SELECT branch_id, branch_name
         FROM branches
         WHERE is_active = true
         ORDER BY branch_name ASC`
    ),
    pool.query(
      `SELECT instructor_id, instructor_full_name
         FROM instructors
         ORDER BY instructor_full_name ASC`
    ),
    // => Sectors pulled from the sectors table - used in both the modal and More Options dropdowns
    pool.query(
      `SELECT sector_id, sector
         FROM sectors
         ORDER BY sector ASC`
    ),
  ]);

  return {
    courses:     courses.rows,
    branches:    branches.rows,
    instructors: instructors.rows,
    sectors:     sectors.rows,
  };
};
