// => admin/models/adminActivityLogModel.js
// => Shared write-only helper for the system-wide activity_logs table.
// => Lives at the top level (not under models/Classes/) since logging isn't
//    Classes-specific - any feature (auth, enrollments, batches, etc.) can
//    import this the same way.
// => entity_type/entity_id are nullable - a pure system event (login,
//    password reset) has no specific entity attached and just leaves both
//    NULL. An entity-scoped action (trainer edited, batch status changed)
//    sets both so that entity's detail page can query its own history via
//    the (entity_type, entity_id) index.
// => actor_id has no FK constraint - it can point at either admins.admin_id
//    or student_accounts.student_id depending on actor_type, and Postgres
//    can't express a conditional FK across two tables. actor_name is
//    denormalized deliberately: it's a snapshot of the actor's name at the
//    time of the action, so the log stays accurate even if that admin's
//    name changes or the account is later deleted.

export const logActivity = async (pool, {
  entity_type,
  entity_id,
  actor_type,
  actor_id,
  actor_name,
  action,
  action_detail,
}) => {
  // => Logging failures should never break the actual operation they're
  //    attached to - caught and swallowed with a console warning rather
  //    than thrown, so a logging hiccup can't take down a trainer edit
  try {
    await pool.query(
      `INSERT INTO activity_logs
          (entity_type, entity_id, actor_type, actor_id, actor_name, action, action_detail)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entity_type || null,
        entity_id || null,
        actor_type,
        actor_id || null,
        actor_name || 'Unknown',
        action,
        action_detail,
      ]
    );
  } catch (err) {
    console.error('logActivity failed (non-fatal):', err);
  }
};

// => Fetches log rows for one specific entity, newest first - used by
//    entity detail pages (e.g. a batch's history section below Enrolled
//    Students). Not used yet for Trainers/Facilities since those don't have
//    a visible log UI, but the underlying rows are being written regardless
//    so the capability exists whenever that UI gets built.
export const getActivityLogsForEntity = async (pool, entityType, entityId) => {
  const result = await pool.query(
    `SELECT log_id, actor_type, actor_name, action, action_detail, created_at
       FROM activity_logs
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC`,
    [entityType, entityId]
  );
  return result.rows;
};

// => Paginated variant, 10 rows per page by default
// => Returns both the page of rows and the total count, so the frontend
//    can compute whether a Next button should be enabled
export const getActivityLogsForEntityPaginated = async (pool, entityType, entityId, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;

  const rowsResult = await pool.query(
    `SELECT log_id, actor_type, actor_name, action, action_detail, created_at
       FROM activity_logs
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [entityType, entityId, pageSize, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM activity_logs
      WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, entityId]
  );

  return {
    logs: rowsResult.rows,
    total: countResult.rows[0].total,
  };
};

// => Paginated, filterable query across ALL logs, not scoped to one entity or actor.
//    Powers the main Logs page table. Filters are optional, an empty/undefined
//    filter is skipped rather than matched literally.
// => search matches actor_name only (case-insensitive, partial) since that's the
//    one free-text field a staff member would realistically search by.
export const getAllActivityLogsPaginated = async (pool, {
  page = 1,
  pageSize = 10,
  entityType,
  actorType,
  action,
  search,
} = {}) => {
  const offset = (page - 1) * pageSize;

  // => Built up dynamically so unset filters don't add unnecessary WHERE clauses
  const conditions = [];
  const values = [];

  if (entityType) {
    values.push(entityType);
    conditions.push(`entity_type = $${values.length}`);
  }
  if (actorType) {
    values.push(actorType);
    conditions.push(`actor_type = $${values.length}`);
  }
  if (action) {
    values.push(action);
    conditions.push(`action = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`actor_name ILIKE $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // => LIMIT/OFFSET placeholders come after all filter placeholders
  const rowsResult = await pool.query(
    `SELECT log_id, entity_type, entity_id, actor_type, actor_name, action, action_detail, created_at
       FROM activity_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM activity_logs ${whereClause}`,
    values
  );

  return {
    logs: rowsResult.rows,
    total: countResult.rows[0].total,
  };
};

// => Distinct entity_type values currently in the table, used to populate the
//    Entity Type filter dropdown without hardcoding a list that could drift
//    from what's actually being written.
export const getDistinctEntityTypes = async (pool) => {
  const result = await pool.query(
    `SELECT DISTINCT entity_type
       FROM activity_logs
      WHERE entity_type IS NOT NULL
      ORDER BY entity_type`
  );
  return result.rows.map(row => row.entity_type);
};

// => Distinct actor_type values, same reasoning as above
export const getDistinctActorTypes = async (pool) => {
  const result = await pool.query(
    `SELECT DISTINCT actor_type
       FROM activity_logs
      ORDER BY actor_type`
  );
  return result.rows.map(row => row.actor_type);
};

// => Count of logs created today (server/DB timezone), feeds the "Logs Today" stat card
export const getActivityLogsTodayCount = async (pool) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM activity_logs
      WHERE created_at >= CURRENT_DATE`
  );
  return result.rows[0].total;
};

// => Paginated logs for everything a specific actor has done, regardless
//    of which entity_type each action touched. Used by the Account page
//    to show "my activity" across the whole system, not just actions
//    taken on the admin's own account record.
export const getActivityLogsByActorPaginated = async (pool, actorType, actorId, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;

  const rowsResult = await pool.query(
    `SELECT log_id, entity_type, entity_id, actor_type, actor_name, action, action_detail, created_at
       FROM activity_logs
      WHERE actor_type = $1 AND actor_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [actorType, actorId, pageSize, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM activity_logs
      WHERE actor_type = $1 AND actor_id = $2`,
    [actorType, actorId]
  );

  return {
    logs: rowsResult.rows,
    total: countResult.rows[0].total,
  };
};


// => Paginated log history scoped to ONE facility's Local (facility-based)
//    class sessions. activity_logs has no facility_id of its own, so this
//    joins against class_sessions on entity_id = session_id to filter by
//    facility - Mobile/Online sessions have facility_id NULL and never
//    match, which is correct since this only powers the facility calendar page.
export const getActivityLogsForFacilityPaginated = async (pool, facilityId, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;

  const rowsResult = await pool.query(
    `SELECT al.log_id, al.actor_type, al.actor_name, al.action, al.action_detail, al.created_at
       FROM activity_logs al
       JOIN class_sessions cs ON cs.session_id = al.entity_id
      WHERE al.entity_type = 'class_session' AND cs.facility_id = $1
      ORDER BY al.created_at DESC
      LIMIT $2 OFFSET $3`,
    [facilityId, pageSize, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM activity_logs al
       JOIN class_sessions cs ON cs.session_id = al.entity_id
      WHERE al.entity_type = 'class_session' AND cs.facility_id = $1`,
    [facilityId]
  );

  return {
    logs: rowsResult.rows,
    total: countResult.rows[0].total,
  };
};

// => Combined log history for ONE student: admin-initiated changes scoped
//    to this student (entity_type = 'student', entity_id = student_id)
//    PLUS the student's own self-initiated actions (actor_type = 'Student',
//    actor_id = student_id - logins, ticket submissions, password changes,
//    which are logged from the student portal with entity_type left NULL).
//    Merged into one timeline, newest first. Fetch-all-at-once, no
//    pagination - matches the Facilities/Trainers/Support Tickets pattern.
export const getActivityLogsForStudentPaginated = async (pool, studentId, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;

  const rowsResult = await pool.query(
    `SELECT log_id, entity_type, entity_id, actor_type, actor_name, action, action_detail, created_at
       FROM activity_logs
      WHERE (entity_type = 'student' AND entity_id = $1)
         OR (actor_type = 'Student' AND actor_id = $1)
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [studentId, pageSize, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM activity_logs
      WHERE (entity_type = 'student' AND entity_id = $1)
         OR (actor_type = 'Student' AND actor_id = $1)`,
    [studentId]
  );

  const total = countResult.rows[0].total;

  return {
    logs: rowsResult.rows,
    total,
    page,
    limit: pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

// => Combined log history for ONE staff/admin record: changes made TO
//    that record (create, status, permissions - entity_type = 'admin',
//    entity_id = admin_id) PLUS that staff member's own LOGIN events
//    (actor_type = 'Staff', actor_id = admin_id, action = 'LOGIN' only -
//    broader self-initiated activity is intentionally excluded here,
//    that's what getActivityLogsByActorPaginated is for on the Account page).
//    Merged into one timeline, newest first. Same pattern as
//    getActivityLogsForStudentPaginated above.
export const getActivityLogsForStaffPaginated = async (pool, adminId, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;

  const rowsResult = await pool.query(
    `SELECT log_id, entity_type, entity_id, actor_type, actor_name, action, action_detail, created_at
       FROM activity_logs
      WHERE (entity_type = 'admin' AND entity_id = $1)
         OR (actor_type = 'Staff' AND actor_id = $1 AND action = 'LOGIN')
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [adminId, pageSize, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM activity_logs
      WHERE (entity_type = 'admin' AND entity_id = $1)
         OR (actor_type = 'Staff' AND actor_id = $1 AND action = 'LOGIN')`,
    [adminId]
  );

  const total = countResult.rows[0].total;

  return {
    logs: rowsResult.rows,
    total,
    page,
    limit: pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};