// => models/Pages/cmsPageModel.js
// => Raw SQL for the `cms_pages` table - single-row-per-slug pattern, so
//    Privacy Policy today, Terms of Service etc. later without a new table.
// => Uses `pool` (pg Pool), same as announcementModel.js.

import { pool } from '../../config/db.js';

export async function getPageBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT page_id, slug, content, updated_by, updated_at
     FROM cms_pages
     WHERE slug = $1`,
    [slug]
  );
  return rows[0] || null;
}

// => Slugs whose full previous content must be preserved before every
//    overwrite (legal documents) - Privacy Policy now, Terms and
//    Conditions later. Everything else (Announcements, FAQs) only needs
//    the updated_by/updated_at columns already on cms_pages itself.
export const REVISIONED_SLUGS = ['privacy-policy', 'terms-and-conditions'];

// => Saves new content to cms_pages, snapshotting the OLD content into
//    cms_page_revisions first when the slug requires history. Both
//    writes happen in one transaction so a revision row can never exist
//    without the overwrite it captured, or vice versa.
// => Returns { page, wasCreate } - wasCreate distinguishes the very
//    first save (no prior row) from every save after that, so the
//    caller can log CREATE vs UPDATE accurately.
export async function saveContentWithRevision(slug, { content, updated_by }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // => FOR UPDATE locks the row for the duration of this transaction -
    //    stops two admins saving at the same instant from both reading
    //    the same "old content" and writing conflicting revisions
    const { rows: existingRows } = await client.query(
      `SELECT page_id, content FROM cms_pages WHERE slug = $1 FOR UPDATE`,
      [slug]
    );
    const existingPage = existingRows[0] || null;

    if (existingPage && REVISIONED_SLUGS.includes(slug)) {
      await client.query(
        `INSERT INTO cms_page_revisions (page_id, content, changed_by)
         VALUES ($1, $2, $3)`,
        [existingPage.page_id, existingPage.content, updated_by]
      );
    }

    const { rows: savedRows } = await client.query(
      `INSERT INTO cms_pages (slug, content, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (slug)
       DO UPDATE SET content = $2, updated_by = $3, updated_at = now()
       RETURNING page_id, slug, content, updated_by, updated_at`,
      [slug, content, updated_by]
    );

    await client.query('COMMIT');
    return { page: savedRows[0], wasCreate: !existingPage };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release(); // => always release back to the pool, even on error
  }
}

// => Paginated revision history for one page, newest first - powers the
//    "Previous Versions" list below the Privacy Policy editor. Joined
//    against admins so the frontend gets a display name for free,
//    instead of a raw admin_id it would have to resolve separately.
export async function getPageRevisions(pageId, page = 1, pageSize = 5) {
  const offset = (page - 1) * pageSize;

  const { rows } = await pool.query(
    `SELECT r.revision_id, r.content, r.changed_at, a.full_name AS changed_by_name
       FROM cms_page_revisions r
       JOIN admins a ON a.admin_id = r.changed_by
      WHERE r.page_id = $1
      ORDER BY r.changed_at DESC
      LIMIT $2 OFFSET $3`,
    [pageId, pageSize, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM cms_page_revisions WHERE page_id = $1`,
    [pageId]
  );

  const total = countRows[0].total;
  return {
    revisions: rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// => Upsert - a slug either doesn't exist yet (first-ever save) or already
//    does (every save after that). ON CONFLICT keeps this to one query
//    instead of a separate exists-check + insert-or-update branch.
export async function upsertPageBySlug(slug, { content, updated_by }) {
  const { rows } = await pool.query(
    `INSERT INTO cms_pages (slug, content, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (slug)
     DO UPDATE SET content = $2, updated_by = $3, updated_at = now()
     RETURNING page_id, slug, content, updated_by, updated_at`,
    [slug, content, updated_by]
  );
  return rows[0];
}