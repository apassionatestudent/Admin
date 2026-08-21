// => admin/jobs/batchAutoPromoteJob.js
// => Automatically promotes Pending batches to Ongoing once their start
//    date has been reached for at least 2 days AND a trainer is already
//    assigned. Triggered on a node-cron schedule wired up in server.js.
// => Logged with actor_type: 'System' via logActivity, kept distinct from
//    admin-initiated status changes so the audit trail stays honest about
//    who actually flipped the status.
// => Also logs a FAILURE entry when a batch's buffer has expired with no
//    trainer assigned, so staff can see on the batch detail page exactly
//    why it never moved to Ongoing, instead of it just silently sitting
//    in Pending with no explanation.

import { pool } from '../config/db.js';
import { logActivity } from '../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';

// => Buffer gives an admin a couple days after the start date to assign a
//    trainer before the system steps in. If no trainer is assigned by
//    then, the batch just stays Pending until an admin manually acts.
const AUTO_PROMOTE_BUFFER_DAYS = 2;

// => Shared prefix used both when writing and when checking for an
//    existing failure log - see the NOT EXISTS clause in each failure
//    query below. Keeping it in one constant means the write and the
//    dedup check can never drift out of sync with each other.
const PROMOTE_FAILURE_PREFIX = 'Auto-promote failed';

export const runAutoPromoteBatches = async () => {
  await promoteTesdaBatches();
  await promoteShsBatches();
};

const promoteTesdaBatches = async () => {
  const result = await pool.query(
    `UPDATE tesda_batches tb
        SET status     = 'Ongoing',
            updated_at = NOW()
      WHERE tb.status      = 'Pending'
        AND tb.trainer_id IS NOT NULL
        AND tb.start_date <= CURRENT_DATE - INTERVAL '${AUTO_PROMOTE_BUFFER_DAYS} days'
        AND tb.required_number_of_students <= (
              -- => Gate promotion on the approved headcount actually
              --    reaching required_number_of_students. A batch with a
              --    trainer and a reached start date should not go
              --    Ongoing if not enough students are approved yet.
              SELECT COUNT(*) FROM tesda_enrollments te
               WHERE te.batch_id = tb.batch_id
                 AND te.status   = 'Approved'
            )
      RETURNING tb.public_id, tb.batch_id`
  );

  for (const row of result.rows) {
    await logActivity(pool, {
      entity_type:   'tesda_batch',
      entity_id:     row.batch_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: 'Automatically promoted from Pending to Ongoing - start date reached and trainer assigned.',
    });
  }

  if (result.rows.length) {
    console.log(`[autoPromoteBatches] Promoted ${result.rows.length} TESDA batch(es) to Ongoing.`);
  }

  // => FAILURE CASE: buffer has expired, still Pending, still no trainer.
  //    Checked AFTER the UPDATE above, since any batch that just got
  //    promoted has already left 'Pending' and won't match this WHERE
  //    clause anymore - no risk of a batch being logged as both a
  //    success and a failure in the same run.
  // => NOT EXISTS against activity_logs is the dedup guard: once a
  //    failure has been logged for a batch, it's never logged again on
  //    later runs, no matter how many days it stays stuck. This also
  //    means a run that's missed entirely (server down that day) still
  //    catches up correctly on the next run, unlike checking for an
  //    exact date match.
  const failedResult = await pool.query(
    `SELECT tb.public_id, tb.batch_id
       FROM tesda_batches tb
      WHERE tb.status      = 'Pending'
        AND tb.trainer_id IS NULL
        AND tb.start_date <= CURRENT_DATE - INTERVAL '${AUTO_PROMOTE_BUFFER_DAYS} days'
        AND NOT EXISTS (
              SELECT 1 FROM activity_logs al
               WHERE al.entity_type   = 'tesda_batch'
                 AND al.entity_id     = tb.batch_id
                 AND al.actor_type    = 'System'
                 AND al.action_detail LIKE '${PROMOTE_FAILURE_PREFIX}%'
            )`
  );

  for (const row of failedResult.rows) {
    await logActivity(pool, {
      entity_type:   'tesda_batch',
      entity_id:     row.batch_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: `${PROMOTE_FAILURE_PREFIX} - start date reached but no trainer is assigned.`,
    });
  }

  if (failedResult.rows.length) {
    console.log(`[autoPromoteBatches] Logged ${failedResult.rows.length} TESDA batch(es) stuck in Pending with no trainer.`);
  }
};

const promoteShsBatches = async () => {
  // => Every Grade 11 course under the batch's cluster must have a
  //    trainer assigned in shs_batch_course_trainers before auto-promotion
  //    fires - replaces the old loose "either grade slot filled" check.
  //    Grade 12 is intentionally not checked, same reasoning as the manual
  //    status-change validation in adminBatchServices.js - a cluster is
  //    taught Grade 11 first, Grade 12 only starts once Grade 11 is done.
  const result = await pool.query(
    `UPDATE shs_batches sb
        SET status     = 'Ongoing',
            updated_at = NOW()
      WHERE sb.status      = 'Pending'
        AND sb.start_date <= CURRENT_DATE - INTERVAL '${AUTO_PROMOTE_BUFFER_DAYS} days'
        AND EXISTS (
              SELECT 1 FROM shs_courses sc
               WHERE sc.cluster_id = sb.cluster_id AND sc.grade_level = 'Grade 11'
            )
        AND NOT EXISTS (
              SELECT 1 FROM shs_courses sc
               WHERE sc.cluster_id = sb.cluster_id AND sc.grade_level = 'Grade 11'
                 AND NOT EXISTS (
                       SELECT 1 FROM shs_batch_course_trainers bct
                        WHERE bct.batch_id = sb.batch_id
                          AND bct.course_id = sc.course_id
                          AND bct.trainer_id IS NOT NULL
                     )
            )
        AND sb.required_number_of_students <= (
              -- => Same headcount gate as the TESDA side above.
              SELECT COUNT(*) FROM shs_enrollments se
               WHERE se.batch_id = sb.batch_id
                 AND se.status   = 'Approved'
            )
      RETURNING sb.public_id, sb.batch_id`
  );

  for (const row of result.rows) {
    await logActivity(pool, {
      entity_type:   'shs_batch',
      entity_id:     row.batch_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: 'Automatically promoted from Pending to Ongoing - start date reached and every Grade 11 course has a trainer assigned.',
    });
  }

  if (result.rows.length) {
    console.log(`[autoPromoteBatches] Promoted ${result.rows.length} SHS batch(es) to Ongoing.`);
  }

  // => FAILURE CASE: buffer expired, still Pending, at least one Grade 11
  //    course under the cluster still has no trainer. Deliberately
  //    requires Grade 11 courses to actually EXIST first - a cluster with
  //    zero Grade 11 courses configured is a staff data-entry problem,
  //    not a trainer-assignment problem, so it's left alone here rather
  //    than logged as a false "no trainer" failure. Same NOT EXISTS
  //    dedup guard as the TESDA version above.
  const failedResult = await pool.query(
    `SELECT sb.public_id, sb.batch_id
       FROM shs_batches sb
      WHERE sb.status      = 'Pending'
        AND sb.start_date <= CURRENT_DATE - INTERVAL '${AUTO_PROMOTE_BUFFER_DAYS} days'
        AND EXISTS (
              SELECT 1 FROM shs_courses sc
               WHERE sc.cluster_id = sb.cluster_id AND sc.grade_level = 'Grade 11'
            )
        AND EXISTS (
              SELECT 1 FROM shs_courses sc
               WHERE sc.cluster_id = sb.cluster_id AND sc.grade_level = 'Grade 11'
                 AND NOT EXISTS (
                       SELECT 1 FROM shs_batch_course_trainers bct
                        WHERE bct.batch_id = sb.batch_id
                          AND bct.course_id = sc.course_id
                          AND bct.trainer_id IS NOT NULL
                     )
            )
        AND NOT EXISTS (
              SELECT 1 FROM activity_logs al
               WHERE al.entity_type   = 'shs_batch'
                 AND al.entity_id     = sb.batch_id
                 AND al.actor_type    = 'System'
                 AND al.action_detail LIKE '${PROMOTE_FAILURE_PREFIX}%'
            )`
  );

  for (const row of failedResult.rows) {
    await logActivity(pool, {
      entity_type:   'shs_batch',
      entity_id:     row.batch_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: `${PROMOTE_FAILURE_PREFIX} - start date reached but not every Grade 11 course under this cluster has a trainer assigned.`,
    });
  }

  if (failedResult.rows.length) {
    console.log(`[autoPromoteBatches] Logged ${failedResult.rows.length} SHS batch(es) stuck in Pending with an unstaffed Grade 11 course.`);
  }
};