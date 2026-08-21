// => Admin/backend/jobs/enrollmentAutoReserveJob.js
// => Auto-flips an enrollment from 'Reviewed' to 'Reserved' when either
//    condition is met, whichever comes first:
//    (a) 7 business days have passed since reviewed_at with no in-person
//        document submission, or
//    (b) the assigned batch's start_date has already been reached.
// => Logged with actor_type: 'System' via logActivity, same pattern as
//    batchAutoPromoteJob.js, so the audit trail stays honest about who
//    actually flipped the status.

import { pool } from '../config/db.js';
import { logActivity } from '../models/adminActivityLogModel.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';

// => Grace period in business days (Mon-Fri only). PH holidays are
//    intentionally NOT excluded right now since current operations run
//    on holidays too. Revisit if that changes.
const RESERVE_GRACE_BUSINESS_DAYS = 7;

export const runAutoReserveEnrollments = async () => {
  await reserveTesdaEnrollments();
  await reserveShsEnrollments();
};

const reserveTesdaEnrollments = async () => {
  // => batch_id is cleared here, same convention as the sweep logic in
  //    approveTesdaEnrollmentWithLock (tesdaEnrollmentModel.js) - a
  //    Reserved enrollment must never stay pinned to a batch it can no
  //    longer join, so it becomes eligible for assignment into the next one.
  const result = await pool.query(
    `UPDATE tesda_enrollments te
        SET status     = 'Reserved',
            batch_id   = NULL,
            updated_at = NOW()
      WHERE te.status      = 'Reviewed'
        AND te.reviewed_at IS NOT NULL
        AND (
              add_business_days(te.reviewed_at::date, ${RESERVE_GRACE_BUSINESS_DAYS}) <= CURRENT_DATE
              OR EXISTS (
                    SELECT 1 FROM tesda_batches tb
                     WHERE tb.batch_id = te.batch_id
                       AND tb.start_date <= CURRENT_DATE
                  )
            )
      RETURNING te.public_id, te.enrollment_id`
  );

  for (const row of result.rows) {
    await logActivity(pool, {
      entity_type:   'tesda_enrollment',
      entity_id:     row.enrollment_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: 'Automatically reserved from Reviewed - grace period elapsed or batch start date reached without document submission.',
    });
  }

  if (result.rows.length) {
    console.log(`[autoReserveEnrollments] Reserved ${result.rows.length} TESDA enrollment(s).`);
  }
};

const reserveShsEnrollments = async () => {
  // => batch_id is cleared here, same convention as the sweep logic in
  //    approveShsEnrollmentWithLock (shsEnrollmentModel.js) - a Reserved
  //    enrollment must never stay pinned to a batch it can no longer
  //    join, so it becomes eligible for assignment into the next one.
  const result = await pool.query(
    `UPDATE shs_enrollments se
        SET status     = 'Reserved',
            batch_id   = NULL,
            updated_at = NOW()
      WHERE se.status      = 'Reviewed'
        AND se.reviewed_at IS NOT NULL
        AND (
              add_business_days(se.reviewed_at::date, ${RESERVE_GRACE_BUSINESS_DAYS}) <= CURRENT_DATE
              OR EXISTS (
                    SELECT 1 FROM shs_batches sb
                     WHERE sb.batch_id = se.batch_id
                       AND sb.start_date <= CURRENT_DATE
                  )
            )
      RETURNING se.public_id, se.enrollment_id`
  );

  for (const row of result.rows) {
    await logActivity(pool, {
      entity_type:   'shs_enrollment',
      entity_id:     row.enrollment_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        ACTIVITY_ACTIONS.STATUS_CHANGE,
      action_detail: 'Automatically reserved from Reviewed - grace period elapsed or batch start date reached without document submission.',
    });
  }

  if (result.rows.length) {
    console.log(`[autoReserveEnrollments] Reserved ${result.rows.length} SHS enrollment(s).`);
  }
};