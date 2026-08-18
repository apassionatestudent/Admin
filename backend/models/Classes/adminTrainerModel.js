// => models/Classes/adminTrainerModel.js
// => Mirrors adminFacilityModel.js pattern: every query takes `pool` as first param,
//    passed down from the service layer - no pool/sql imported at module scope here.
// => External lookups use public_id (UUID) instead of the internal trainer_id.
//    trainer_id is still used internally for the join-table rows
//    (trainer_tesda_courses/trainer_shs_courses), since those never get
//    exposed to the client directly.
// => Unlike Facilities' allows_all_courses escape hatch, a trainer has no
//    "works with everything" option - handles_tesda/handles_shs just gate WHICH
//    join table(s) apply, and each enabled program type always requires at
//    least one selected course (enforced in the service layer).

// => Lightweight lookup: resolves a trainer's internal trainer_id from its
//    public_id. Used only by the Activity Logs endpoint, mirrors
//    getFacilityIdByPublicId in adminFacilityModel.js.
export const getTrainerIdByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT trainer_id FROM trainers WHERE public_id = $1`,
    [publicId]
  );
  return result.rows[0]?.trainer_id ?? null;
};

// => Resolves an array of TESDA course IDs into their titles - used only
//    for building a readable "Assigned TESDA Courses" diff line in the
//    activity log. Duplicated from adminFacilityModel.js rather than
//    imported across features, per project convention.
export const getTesdaCourseTitlesByIds = async (pool, courseIds) => {
  if (!courseIds || courseIds.length === 0) return [];
  const result = await pool.query(
    `SELECT title FROM tesda_courses WHERE course_id = ANY($1::int[])`,
    [courseIds]
  );
  return result.rows.map(r => r.title);
};

// => Same as above, for SHS courses
export const getShsCourseTitlesByIds = async (pool, courseIds) => {
  if (!courseIds || courseIds.length === 0) return [];
  const result = await pool.query(
    `SELECT title FROM shs_courses WHERE course_id = ANY($1::int[])`,
    [courseIds]
  );
  return result.rows.map(r => r.title);
};

// => Active, non-deleted trainers only
export const getActiveTrainers = async (pool) => {
  const result = await pool.query(
    `SELECT trainer_id, public_id, trainer_full_name, contact_number, email,
            handles_tesda, handles_shs, status
       FROM trainers
      WHERE deleted_at IS NULL
      ORDER BY trainer_full_name ASC`
  );
  return result.rows;
};

// => Soft-deleted trainers only - mirrors Facilities' Deleted tab
export const getDeletedTrainers = async (pool) => {
  const result = await pool.query(
    `SELECT trainer_id, public_id, trainer_full_name, contact_number, email,
            handles_tesda, handles_shs, status, deleted_at
       FROM trainers
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC`
  );
  return result.rows;
};

// => Transactional insert: trainer row + its course join rows all succeed
//    or all roll back together. Uses a client from the pool (not a plain
//    pool.query) because this is a multi-statement write.
export const createTrainerWithCourses = async (pool, {
  trainer_full_name, contact_number, email, handles_tesda, handles_shs,
  tesda_course_ids, shs_course_ids, created_by, remarks,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const trainerResult = await client.query(
      `INSERT INTO trainers (trainer_full_name, contact_number, email, handles_tesda, handles_shs, created_by, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING trainer_id, public_id, trainer_full_name, contact_number, email,
                 handles_tesda, handles_shs, status, created_at, remarks`,
      [trainer_full_name, contact_number, email || null, handles_tesda, handles_shs, created_by, remarks || null]
    );
    const trainer = trainerResult.rows[0];

    if (handles_tesda) {
      for (const courseId of tesda_course_ids) {
        await client.query(
          `INSERT INTO trainer_tesda_courses (trainer_id, course_id) VALUES ($1, $2)`,
          [trainer.trainer_id, courseId]
        );
      }
    }
    if (handles_shs) {
      for (const courseId of shs_course_ids) {
        await client.query(
          `INSERT INTO trainer_shs_courses (trainer_id, course_id) VALUES ($1, $2)`,
          [trainer.trainer_id, courseId]
        );
      }
    }

    await client.query('COMMIT');
    return trainer;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// => Full detail for one trainer, keyed by public_id (UUID). Includes
//    restricted course IDs so the edit form can pre-check the right boxes.
//    No deleted_at filter here - a deleted trainer's detail page should
//    still be viewable (e.g. from a Deleted-tab restore flow later).
// => updated_by_name comes from a join to admins - trainers.updated_by is
//    just an admin_id, the name is resolved here for display
export const getTrainerById = async (pool, publicId) => {
  const trainerResult = await pool.query(
    `SELECT t.trainer_id, t.public_id, t.trainer_full_name, t.contact_number, t.email,
            t.handles_tesda, t.handles_shs, t.status, t.created_at, t.deleted_at, t.remarks,
            t.updated_at, a.full_name AS updated_by_name
       FROM trainers t
       LEFT JOIN admins a ON t.updated_by = a.admin_id
      WHERE t.public_id = $1`,
    [publicId]
  );
  if (trainerResult.rows.length === 0) return null;
  const trainer = trainerResult.rows[0];

  const [tesdaRows, shsRows] = await Promise.all([
    pool.query(`SELECT course_id FROM trainer_tesda_courses WHERE trainer_id = $1`, [trainer.trainer_id]),
    pool.query(`SELECT course_id FROM trainer_shs_courses WHERE trainer_id = $1`, [trainer.trainer_id]),
  ]);

  return {
    ...trainer,
    tesda_course_ids: tesdaRows.rows.map(r => r.course_id),
    shs_course_ids: shsRows.rows.map(r => r.course_id),
  };
};

// => Updates the trainer row (looked up by public_id) and replaces its
//    course join rows wholesale. Blocked on a soft-deleted row - must
//    restore first before editing.
export const updateTrainerWithCourses = async (pool, publicId, {
  trainer_full_name, contact_number, email, status, handles_tesda, handles_shs,
  tesda_course_ids, shs_course_ids, remarks, updated_by,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // => remarks uses COALESCE - a routine edit that doesn't touch status
    //    passes remarks as null from the service layer, which COALESCE
    //    resolves to "keep whatever's already there." Only an actual
    //    status change sends a real value here that overwrites it.
    // => updated_at/updated_by are set on every save, unlike remarks -
    //    "who touched this last" should reflect every edit, not just status changes
    const trainerResult = await client.query(
      `UPDATE trainers
          SET trainer_full_name = $1, contact_number = $2, email = $3,
              status = $4, handles_tesda = $5, handles_shs = $6,
              remarks = COALESCE($7, remarks),
              updated_at = NOW(), updated_by = $9
        WHERE public_id = $8 AND deleted_at IS NULL
        RETURNING trainer_id, public_id, trainer_full_name, contact_number, email,
                  handles_tesda, handles_shs, status, created_at, remarks, updated_at, updated_by`,
      [trainer_full_name, contact_number, email || null, status, handles_tesda, handles_shs, remarks || null, publicId, updated_by || null]
    );
    if (trainerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const internalId = trainerResult.rows[0].trainer_id;

    await client.query(`DELETE FROM trainer_tesda_courses WHERE trainer_id = $1`, [internalId]);
    await client.query(`DELETE FROM trainer_shs_courses WHERE trainer_id = $1`, [internalId]);

    if (handles_tesda) {
      for (const courseId of tesda_course_ids) {
        await client.query(
          `INSERT INTO trainer_tesda_courses (trainer_id, course_id) VALUES ($1, $2)`,
          [internalId, courseId]
        );
      }
    }
    if (handles_shs) {
      for (const courseId of shs_course_ids) {
        await client.query(
          `INSERT INTO trainer_shs_courses (trainer_id, course_id) VALUES ($1, $2)`,
          [internalId, courseId]
        );
      }
    }

    await client.query('COMMIT');

    // => The RETURNING clause above only touches the trainers table, so
    //    tesda_course_ids/shs_course_ids are never in trainerResult.rows[0].
    //    Without this, the PATCH response silently omits both arrays and
    //    TrainerDetail's next read-only render crashes on
    //    trainer.tesda_course_ids.includes(...) being called on undefined.
    return {
      ...trainerResult.rows[0],
      tesda_course_ids: handles_tesda ? tesda_course_ids : [],
      shs_course_ids: handles_shs ? shs_course_ids : [],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// => Soft-delete: sets deleted_at, never actually removes the row. Course
//    join rows are intentionally left untouched - if restored later, the
//    trainer's original course assignments come back automatically.
export const softDeleteTrainer = async (pool, publicId, remarks) => {
  const result = await pool.query(
    `UPDATE trainers
        SET deleted_at = NOW(), remarks = $2
      WHERE public_id = $1 AND deleted_at IS NULL
      RETURNING trainer_id, public_id, trainer_full_name`,
    [publicId, remarks]
  );
  return result.rows[0] ?? null;
};

// => Restore: clears deleted_at, bringing the trainer back into the active list
export const restoreTrainer = async (pool, publicId) => {
  const result = await pool.query(
    `UPDATE trainers
        SET deleted_at = NULL
      WHERE public_id = $1 AND deleted_at IS NOT NULL
      RETURNING trainer_id, public_id, trainer_full_name`,
    [publicId]
  );
  return result.rows[0] ?? null;
};
