// => models/Classes/adminFacilityModel.js
// => Mirrors adminClassModel.js pattern: every query takes `pool` as first param,
//    passed down from the service layer - no pool/sql imported at module scope here.
// => External lookups use public_id (UUID) instead of the internal facility_id.
//    facility_id is still used internally for the join-table rows
//    (facility_tesda_courses/facility_shs_clusters), since those never get
//    exposed to the client directly.

// => Active, non-deleted facilities only
export const getActiveFacilities = async (pool) => {
  const result = await pool.query(
    `SELECT facility_id, public_id, name, capacity, allows_all_courses, status
       FROM facilities
      WHERE deleted_at IS NULL
      ORDER BY name ASC`
  );
  return result.rows;
};

// => Soft-deleted facilities only - mirrors Courses.jsx's Deleted tab
export const getDeletedFacilities = async (pool) => {
  const result = await pool.query(
    `SELECT facility_id, public_id, name, capacity, allows_all_courses, status, deleted_at
       FROM facilities
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC`
  );
  return result.rows;
};

// => Transactional insert: facility row + its allowed-course join rows all
//    succeed or all roll back together. Uses a client from the pool (not a
//    plain pool.query) because this is a multi-statement write.
export const createFacilityWithCourses = async (pool, {
  name, capacity, allows_all_courses, tesda_course_ids, shs_course_ids, created_by, remarks,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const facilityResult = await client.query(
      `INSERT INTO facilities (name, capacity, allows_all_courses, created_by, remarks)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING facility_id, public_id, name, capacity, allows_all_courses, status, created_at, remarks`,
      [name, capacity || null, allows_all_courses, created_by, remarks || null]
    );
    const facility = facilityResult.rows[0];

    if (!allows_all_courses) {
      for (const courseId of tesda_course_ids) {
        await client.query(
          `INSERT INTO facility_tesda_courses (facility_id, course_id) VALUES ($1, $2)`,
          [facility.facility_id, courseId]
        );
      }
      for (const courseId of shs_course_ids) {
        await client.query(
          `INSERT INTO facility_shs_courses (facility_id, course_id) VALUES ($1, $2)`,
          [facility.facility_id, courseId]
        );
      }
    }

    await client.query('COMMIT');
    return facility;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// => Given a facility, return every batch (TESDA + SHS) eligible to hold a
//    session there. Used by AddSessionModal's batch dropdown (still to be built).
export const getEligibleBatchesForFacility = async (pool, facilityId) => {
  const facilityResult = await pool.query(
    `SELECT allows_all_courses FROM facilities WHERE facility_id = $1`,
    [facilityId]
  );
  if (facilityResult.rows.length === 0) return { tesda: [], shs: [] };
  const allowsAll = facilityResult.rows[0].allows_all_courses;

  const tesdaResult = allowsAll
    ? await pool.query(
        `SELECT tc.class_id AS batch_id, tc.status, c.title AS course_title
           FROM tesda_classes tc
           JOIN tesda_courses c ON c.course_id = tc.course_id
          WHERE tc.status IN ('Pending', 'Ongoing')`
      )
    : await pool.query(
        `SELECT tc.class_id AS batch_id, tc.status, c.title AS course_title
           FROM tesda_classes tc
           JOIN tesda_courses c ON c.course_id = tc.course_id
           JOIN facility_tesda_courses ftc ON ftc.course_id = tc.course_id
          WHERE ftc.facility_id = $1 AND tc.status IN ('Pending', 'Ongoing')`,
        [facilityId]
      );

  //    does, mirroring how tesda_classes.course_id already works above.
  //    If it doesn't exist, tell me and this needs the old name-match
  //    workaround instead, pointed at shs_courses.name.
  const shsResult = allowsAll
    ? await pool.query(
        `SELECT sc.class_id AS batch_id, sc.status, c.title AS course_title
           FROM shs_classes sc
           JOIN shs_courses c ON c.course_id = sc.course_id
          WHERE sc.status IN ('Pending', 'Ongoing')`
      )
    : await pool.query(
        `SELECT sc.class_id AS batch_id, sc.status, c.title AS course_title
           FROM shs_classes sc
           JOIN shs_courses c ON c.course_id = sc.course_id
           JOIN facility_shs_courses fsc ON fsc.course_id = sc.course_id
          WHERE fsc.facility_id = $1 AND sc.status IN ('Pending', 'Ongoing')`,
        [facilityId]
      );

  return { tesda: tesdaResult.rows, shs: shsResult.rows };
};

// => Full detail for one facility, keyed by public_id (UUID). Includes
//    restricted course/cluster IDs so the edit form can pre-check the right
//    boxes. No deleted_at filter here - a deleted facility's detail page
//    should still be viewable (e.g. from a Deleted-tab restore flow later).
// => updated_by_name comes from a join to admins - facilities.updated_by is
//    just an admin_id, the name is resolved here for display
export const getFacilityById = async (pool, publicId) => {
  const facilityResult = await pool.query(
    `SELECT f.facility_id, f.public_id, f.name, f.capacity, f.allows_all_courses,
            f.status, f.created_at, f.deleted_at, f.remarks,
            f.updated_at, a.full_name AS updated_by_name
       FROM facilities f
       LEFT JOIN admins a ON f.updated_by = a.admin_id
      WHERE f.public_id = $1`,
    [publicId]
  );
  if (facilityResult.rows.length === 0) return null;
  const facility = facilityResult.rows[0];

  const [tesdaRows, shsCourseRows] = await Promise.all([
    pool.query(`SELECT course_id FROM facility_tesda_courses WHERE facility_id = $1`, [facility.facility_id]),
    pool.query(`SELECT course_id FROM facility_shs_courses WHERE facility_id = $1`, [facility.facility_id]),
  ]);

  return {
    ...facility,
    tesda_course_ids: tesdaRows.rows.map(r => r.course_id),
    shs_course_ids: shsCourseRows.rows.map(r => r.course_id),
  };
};

// => Updates the facility row (looked up by public_id) and replaces its
//    restriction join rows wholesale. Blocked on a soft-deleted row - must
//    restore first before editing.
export const updateFacilityWithCourses = async (pool, publicId, {
  name, capacity, allows_all_courses, status, tesda_course_ids, shs_course_ids, remarks, updated_by,
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
    const facilityResult = await client.query(
      `UPDATE facilities
          SET name = $1, capacity = $2, allows_all_courses = $3, status = $4,
              remarks = COALESCE($5, remarks),
              updated_at = NOW(), updated_by = $7
        WHERE public_id = $6 AND deleted_at IS NULL
        RETURNING facility_id, public_id, name, capacity, allows_all_courses, status, created_at, remarks, updated_at, updated_by`,
      [name, capacity || null, allows_all_courses, status, remarks || null, publicId, updated_by || null]
    );
    if (facilityResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const internalId = facilityResult.rows[0].facility_id;

    await client.query(`DELETE FROM facility_tesda_courses WHERE facility_id = $1`, [internalId]);
    await client.query(`DELETE FROM facility_shs_courses WHERE facility_id = $1`, [internalId]);

    if (!allows_all_courses) {
      for (const courseId of tesda_course_ids) {
        await client.query(
          `INSERT INTO facility_tesda_courses (facility_id, course_id) VALUES ($1, $2)`,
          [internalId, courseId]
        );
      }
      for (const shsCourseId of shs_course_ids) {
        await client.query(
          `INSERT INTO facility_shs_courses (facility_id, course_id) VALUES ($1, $2)`,
          [internalId, shsCourseId]
        );
      }
    }

    await client.query('COMMIT');

    // => Resolve the updater's name for display - a plain SELECT outside
    //    the transaction, cheap and avoids a JOIN inside UPDATE...RETURNING
    //    (Postgres doesn't support that directly). Same pattern as
    //    adminTrainerModel.js's updateTrainerWithCourses for consistency.
    let updatedByName = null;
    if (updated_by) {
      const adminResult = await pool.query(`SELECT full_name FROM admins WHERE admin_id = $1`, [updated_by]);
      updatedByName = adminResult.rows[0]?.full_name ?? null;
    }

    // => The RETURNING clause above only touches the facilities table, so
    //    tesda_course_ids/shs_course_ids are never in facilityResult.rows[0].
    //    Without this, the PATCH response silently omits both arrays and
    //    FacilityDetail's next read-only render crashes on
    //    facility.tesda_course_ids.includes(...) being called on undefined.
    return {
      ...facilityResult.rows[0],
      updated_by_name: updatedByName,
      tesda_course_ids: allows_all_courses ? [] : tesda_course_ids,
      shs_course_ids: allows_all_courses ? [] : shs_course_ids,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// => Soft-delete: sets deleted_at, never actually removes the row. Restriction
//    join rows are intentionally left untouched - if restored later, the
//    facility's original course/cluster restrictions come back automatically.
export const softDeleteFacility = async (pool, publicId, remarks) => {
  const result = await pool.query(
    `UPDATE facilities
        SET deleted_at = NOW(), remarks = $2
      WHERE public_id = $1 AND deleted_at IS NULL
      RETURNING facility_id, public_id, name`,
    [publicId, remarks]
  );
  return result.rows[0] ?? null;
};

// => Restore: clears deleted_at, bringing the facility back into the active list
export const restoreFacility = async (pool, publicId) => {
  const result = await pool.query(
    `UPDATE facilities
        SET deleted_at = NULL
      WHERE public_id = $1 AND deleted_at IS NOT NULL
      RETURNING facility_id, public_id, name`,
    [publicId]
  );
  return result.rows[0] ?? null;
};
