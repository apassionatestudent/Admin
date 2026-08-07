// => models/publicCourseLinkModel.js
// => Public/student backend. Read-only - the public site never writes to
// => these tables, only the admin backend does.
// => Every query filters on is_published = TRUE and deleted_at IS NULL -
// => an unpublished or soft-deleted course must never be reachable here,
// => even if someone guesses/brute-forces a slug.
// => Assumes this backend's config/db.js exports 'pool' the same way the
// => admin backend's does - if this backend is still on the sql`` HTTP
// => client, swap these pool.query() calls back to sql`` tagged templates.

import { pool } from '../../config/db.js';

export async function findPublishedTesdaCourseBySlug(slug) {
  const result = await pool.query(
    `SELECT tc.title, tc.description, tc.accreditation_no, tc.hours,
            s.sector AS sector_name, pl.public_slug, pl.published_at
     FROM tesda_course_public_links pl
     JOIN tesda_courses tc ON tc.course_id = pl.course_id
     LEFT JOIN sectors s ON s.sector_id = tc.sector_id
     WHERE pl.public_slug = $1 AND pl.is_published = TRUE AND tc.deleted_at IS NULL`,
    [slug]
  );
  return result.rows[0] || null;
}

// => Competencies for a published course - looked up by slug directly via
// => join, so the public model never needs the internal course_id exposed
// => to its caller
export async function findCompetenciesForPublishedTesdaCourse(slug) {
  const basicResult = await pool.query(
    `SELECT bc.code, bc.competency
     FROM basic_competency bc
     JOIN tesda_course_public_links pl ON pl.course_id = bc.course_id
     WHERE pl.public_slug = $1 AND pl.is_published = TRUE
     ORDER BY bc.basic_id ASC`,
    [slug]
  );
  const commonResult = await pool.query(
    `SELECT cc.code, cc.competency
     FROM common_competency cc
     JOIN tesda_course_public_links pl ON pl.course_id = cc.course_id
     WHERE pl.public_slug = $1 AND pl.is_published = TRUE
     ORDER BY cc.common_id ASC`,
    [slug]
  );
  const coreResult = await pool.query(
    `SELECT co.code, co.competency
     FROM core_competency co
     JOIN tesda_course_public_links pl ON pl.course_id = co.course_id
     WHERE pl.public_slug = $1 AND pl.is_published = TRUE
     ORDER BY co.core_id ASC`,
    [slug]
  );
  return { basic: basicResult.rows, common: commonResult.rows, core: coreResult.rows };
}

export async function findAllPublishedTesdaCourses() {
  const result = await pool.query(`
    SELECT tc.title, tc.hours, s.sector AS sector_name, pl.public_slug
    FROM tesda_course_public_links pl
    JOIN tesda_courses tc ON tc.course_id = pl.course_id
    LEFT JOIN sectors s ON s.sector_id = tc.sector_id
    WHERE pl.is_published = TRUE AND tc.deleted_at IS NULL
    ORDER BY tc.title ASC
  `);
  return result.rows;
}

export async function findPublishedShsCourseBySlug(slug) {
  const result = await pool.query(
    `SELECT sc.title, sc.description, sc.grade_level, sc.course_link,
            cl.name AS cluster_name, pl.public_slug, pl.published_at
     FROM shs_course_public_links pl
     JOIN shs_courses sc ON sc.course_id = pl.course_id
     LEFT JOIN shs_clusters cl ON cl.cluster_id = sc.cluster_id
     WHERE pl.public_slug = $1 AND pl.is_published = TRUE AND sc.deleted_at IS NULL`,
    [slug]
  );
  return result.rows[0] || null;
}

export async function findAllPublishedShsCourses() {
  const result = await pool.query(`
    SELECT sc.title, sc.grade_level, cl.name AS cluster_name, pl.public_slug
    FROM shs_course_public_links pl
    JOIN shs_courses sc ON sc.course_id = pl.course_id
    LEFT JOIN shs_clusters cl ON cl.cluster_id = sc.cluster_id
    WHERE pl.is_published = TRUE AND sc.deleted_at IS NULL
    ORDER BY sc.title ASC
  `);
  return result.rows;
}
