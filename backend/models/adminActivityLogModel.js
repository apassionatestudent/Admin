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
