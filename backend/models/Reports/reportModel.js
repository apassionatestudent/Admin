// => models/Reports/reportModel.js
import { sql } from '../../config/db.js';

// => Active TESDA sectors, alphabetized for the dropdown
export const getActiveSectors = async () => {
  // => fullResults: true in db.js means sql`` returns { rows, fields }, not a plain array
  const { rows } = await sql`
    SELECT sector_id, sector
    FROM sectors
    WHERE deleted_at IS NULL
    ORDER BY sector ASC
  `;
  return rows;
};

// => Active SHS clusters, alphabetized for the dropdown
export const getActiveClusters = async () => {
  const { rows } = await sql`
    SELECT cluster_id, name
    FROM shs_clusters
    WHERE deleted_at IS NULL
    ORDER BY name ASC
  `;
  return rows;
};

// => Active TESDA courses under a given sector
export const getTesdaCoursesBySector = async (sectorId) => {
  const { rows } = await sql`
    SELECT course_id, title
    FROM tesda_courses
    WHERE sector_id = ${sectorId}
      AND status = 'active'
      AND deleted_at IS NULL
    ORDER BY title ASC
  `;
  return rows;
};

// => Active SHS courses under a given cluster
export const getShsCoursesByCluster = async (clusterId) => {
  const { rows } = await sql`
    SELECT course_id, title
    FROM shs_courses
    WHERE cluster_id = ${clusterId}
      AND status = 'active'
      AND deleted_at IS NULL
    ORDER BY title ASC
  `;
  return rows;
};

// => 12-row (Jan-Dec) enrollee count for a TESDA course in a given year.
//    generate_series zero-fills every month so the frontend never has to
//    guess which months are missing versus genuinely zero
export const getTesdaEnrolleeMonthlyCounts = async (courseId, year) => {
  const { rows } = await sql`
    SELECT gs.month AS month, COALESCE(COUNT(te.enrollment_id), 0) AS count
    FROM generate_series(1, 12) AS gs(month)
    LEFT JOIN tesda_enrollments te
      ON EXTRACT(MONTH FROM te.submitted_at) = gs.month
      AND EXTRACT(YEAR FROM te.submitted_at) = ${year}
      AND te.course_id = ${courseId}
    GROUP BY gs.month
    ORDER BY gs.month
  `;
  return rows;
};

// => 12-row (Jan-Dec) enrollee count for an SHS course in a given year
export const getShsEnrolleeMonthlyCounts = async (courseId, year) => {
  const { rows } = await sql`
    SELECT gs.month AS month, COALESCE(COUNT(se.enrollment_id), 0) AS count
    FROM generate_series(1, 12) AS gs(month)
    LEFT JOIN shs_enrollments se
      ON EXTRACT(MONTH FROM se.submitted_at) = gs.month
      AND EXTRACT(YEAR FROM se.submitted_at) = ${year}
      AND se.course_id = ${courseId}
    GROUP BY gs.month
    ORDER BY gs.month
  `;
  return rows;
};

// => 12-row (Jan-Dec) batch count for a TESDA course in a given year,
//    based on the created_at column added in the Stage 1-4 migration
export const getTesdaBatchMonthlyCounts = async (courseId, year) => {
  const { rows } = await sql`
    SELECT gs.month AS month,
           COALESCE(COUNT(tb.batch_id), 0) AS count,
           COALESCE(SUM(tb.max_applicants), 0) AS capacity
    FROM generate_series(1, 12) AS gs(month)
    LEFT JOIN tesda_batches tb
      ON EXTRACT(MONTH FROM tb.created_at) = gs.month
      AND EXTRACT(YEAR FROM tb.created_at) = ${year}
      AND tb.course_id = ${courseId}
    GROUP BY gs.month
    ORDER BY gs.month
  `;
  return rows;
};

// => 12-row (Jan-Dec) batch count for an SHS course in a given year.
//    shs_batches has no course_id column of its own, it only links to
//    courses through shs_batch_course_trainers, so that junction table is
//    resolved first into a subquery before the month join happens
export const getShsBatchMonthlyCounts = async (courseId, year) => {
  const { rows } = await sql`
    SELECT gs.month AS month,
           COALESCE(COUNT(sub.batch_id), 0) AS count,
           COALESCE(SUM(sub.max_applicants), 0) AS capacity
    FROM generate_series(1, 12) AS gs(month)
    LEFT JOIN (
      SELECT DISTINCT sb.batch_id, sb.created_at, sb.max_applicants
      FROM shs_batches sb
      JOIN shs_batch_course_trainers sbct ON sbct.batch_id = sb.batch_id
      WHERE sbct.course_id = ${courseId}
    ) sub
      ON EXTRACT(MONTH FROM sub.created_at) = gs.month
      AND EXTRACT(YEAR FROM sub.created_at) = ${year}
    GROUP BY gs.month
    ORDER BY gs.month
  `;
  return rows;
};

// => 12-row (Jan-Dec) Passed vs Failed Assessment counts for a TESDA
//    course, bucketed by updated_at since that's when the status flip
//    actually happened, not when the student originally applied
export const getTesdaCertificationMonthlyCounts = async (courseId, year) => {
  const { rows } = await sql`
    SELECT gs.month AS month,
           COALESCE(SUM(CASE WHEN te.status = 'Passed Assessment' THEN 1 ELSE 0 END), 0) AS passed,
           COALESCE(SUM(CASE WHEN te.status = 'Failed Assessment' THEN 1 ELSE 0 END), 0) AS failed
    FROM generate_series(1, 12) AS gs(month)
    LEFT JOIN tesda_enrollments te
      ON EXTRACT(MONTH FROM te.updated_at) = gs.month
      AND EXTRACT(YEAR FROM te.updated_at) = ${year}
      AND te.course_id = ${courseId}
      AND te.status IN ('Passed Assessment', 'Failed Assessment')
    GROUP BY gs.month
    ORDER BY gs.month
  `;
  return rows;
};

// => Same as above for SHS
export const getShsCertificationMonthlyCounts = async (courseId, year) => {
  const { rows } = await sql`
    SELECT gs.month AS month,
           COALESCE(SUM(CASE WHEN se.status = 'Passed Assessment' THEN 1 ELSE 0 END), 0) AS passed,
           COALESCE(SUM(CASE WHEN se.status = 'Failed Assessment' THEN 1 ELSE 0 END), 0) AS failed
    FROM generate_series(1, 12) AS gs(month)
    LEFT JOIN shs_enrollments se
      ON EXTRACT(MONTH FROM se.updated_at) = gs.month
      AND EXTRACT(YEAR FROM se.updated_at) = ${year}
      AND se.course_id = ${courseId}
      AND se.status IN ('Passed Assessment', 'Failed Assessment')
    GROUP BY gs.month
    ORDER BY gs.month
  `;
  return rows;
};

export const getTesdaOverviewEnrollees = async (sectorId, year) => {
  const { rows } = await sql`
    SELECT c.course_id, c.title, gs.month AS month,
           COALESCE(COUNT(te.enrollment_id), 0) AS count
    FROM tesda_courses c
    CROSS JOIN generate_series(1, 12) AS gs(month)
    LEFT JOIN tesda_enrollments te
      ON te.course_id = c.course_id
      AND EXTRACT(MONTH FROM te.submitted_at) = gs.month
      AND EXTRACT(YEAR FROM te.submitted_at) = ${year}
    WHERE c.sector_id = ${sectorId}
      AND c.status = 'active'
      AND c.deleted_at IS NULL
    GROUP BY c.course_id, c.title, gs.month
    ORDER BY c.title, gs.month
  `;
  return rows;
};

export const getTesdaOverviewBatches = async (sectorId, year) => {
  const { rows } = await sql`
    SELECT c.course_id, gs.month AS month,
           COALESCE(COUNT(tb.batch_id), 0) AS count,
           COALESCE(SUM(tb.max_applicants), 0) AS capacity
    FROM tesda_courses c
    CROSS JOIN generate_series(1, 12) AS gs(month)
    LEFT JOIN tesda_batches tb
      ON tb.course_id = c.course_id
      AND EXTRACT(MONTH FROM tb.created_at) = gs.month
      AND EXTRACT(YEAR FROM tb.created_at) = ${year}
    WHERE c.sector_id = ${sectorId}
      AND c.status = 'active'
      AND c.deleted_at IS NULL
    GROUP BY c.course_id, gs.month
    ORDER BY c.course_id, gs.month
  `;
  return rows;
};

export const getShsOverviewEnrollees = async (clusterId, year) => {
  const { rows } = await sql`
    SELECT c.course_id, c.title, gs.month AS month,
           COALESCE(COUNT(se.enrollment_id), 0) AS count
    FROM shs_courses c
    CROSS JOIN generate_series(1, 12) AS gs(month)
    LEFT JOIN shs_enrollments se
      ON se.course_id = c.course_id
      AND EXTRACT(MONTH FROM se.submitted_at) = gs.month
      AND EXTRACT(YEAR FROM se.submitted_at) = ${year}
    WHERE c.cluster_id = ${clusterId}
      AND c.status = 'active'
      AND c.deleted_at IS NULL
    GROUP BY c.course_id, c.title, gs.month
    ORDER BY c.title, gs.month
  `;
  return rows;
};

export const getShsOverviewBatches = async (clusterId, year) => {
  const { rows } = await sql`
    SELECT c.course_id, gs.month AS month,
           COALESCE(COUNT(sub.batch_id), 0) AS count,
           COALESCE(SUM(sub.max_applicants), 0) AS capacity
    FROM shs_courses c
    CROSS JOIN generate_series(1, 12) AS gs(month)
    LEFT JOIN (
      SELECT sbct.course_id, sb.batch_id, sb.created_at, sb.max_applicants
      FROM shs_batches sb
      JOIN shs_batch_course_trainers sbct ON sbct.batch_id = sb.batch_id
    ) sub
      ON sub.course_id = c.course_id
      AND EXTRACT(MONTH FROM sub.created_at) = gs.month
      AND EXTRACT(YEAR FROM sub.created_at) = ${year}
    WHERE c.cluster_id = ${clusterId}
      AND c.status = 'active'
      AND c.deleted_at IS NULL
    GROUP BY c.course_id, gs.month
    ORDER BY c.course_id, gs.month
  `;
  return rows;
};