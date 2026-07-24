// => admin/jobs/batchAutoPromoteJob.js
// => Automatically promotes Pending batches to Ongoing once their start
//    date has been reached for at least 2 days AND a trainer is already
//    assigned. Triggered on a node-cron schedule wired up in server.js.
// => Logged with actor_type: 'System' via logActivity, kept distinct from
//    admin-initiated status changes so the audit trail stays honest about
//    who actually flipped the status.

import { pool } from '../config/db.js';
import { logActivity } from '../models/adminActivityLogModel.js';

// => Buffer gives an admin a couple days after the start date to assign a
//    trainer before the system steps in. If no trainer is assigned by
//    then, the batch just stays Pending until an admin manually acts.
const AUTO_PROMOTE_BUFFER_DAYS = 2;

export const runAutoPromoteBatches = async () => {
  await promoteTesdaBatches();
  await promoteShsBatches();
};

const promoteTesdaBatches = async () => {
  const result = await pool.query(
    `UPDATE tesda_batches
        SET status     = 'Ongoing',
            updated_at = NOW()
      WHERE status      = 'Pending'
        AND trainer_id IS NOT NULL
        AND start_date <= CURRENT_DATE - INTERVAL '${AUTO_PROMOTE_BUFFER_DAYS} days'
      RETURNING public_id, batch_id`
  );

  for (const row of result.rows) {
    await logActivity(pool, {
      entity_type:   'tesda_batch',
      entity_id:     row.batch_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        'Status changed to Ongoing',
      action_detail: 'Automatically promoted from Pending - start date reached and trainer assigned.',
    });
  }

  if (result.rows.length) {
    console.log(`[autoPromoteBatches] Promoted ${result.rows.length} TESDA batch(es) to Ongoing.`);
  }
};

const promoteShsBatches = async () => {
  const result = await pool.query(
    `UPDATE shs_batches
        SET status     = 'Ongoing',
            updated_at = NOW()
      WHERE status      = 'Pending'
        AND (grade11_trainer_id IS NOT NULL OR grade12_trainer_id IS NOT NULL)
        AND start_date <= CURRENT_DATE - INTERVAL '${AUTO_PROMOTE_BUFFER_DAYS} days'
      RETURNING public_id, batch_id`
  );

  for (const row of result.rows) {
    await logActivity(pool, {
      entity_type:   'shs_batch',
      entity_id:     row.batch_id,
      actor_type:    'System',
      actor_id:      null,
      actor_name:    'System',
      action:        'Status changed to Ongoing',
      action_detail: 'Automatically promoted from Pending - start date reached and trainer assigned.',
    });
  }

  if (result.rows.length) {
    console.log(`[autoPromoteBatches] Promoted ${result.rows.length} SHS batch(es) to Ongoing.`);
  }
};