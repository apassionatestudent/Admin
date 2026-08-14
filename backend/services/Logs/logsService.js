// => admin/services/Logs/logsService.js
// => Thin service layer between the Logs controller and the shared activity log model.
//    pool is imported at the top, never passed as a parameter, matching the rest of the codebase.

import { pool } from '../../config/db.js';
import {
  getAllActivityLogsPaginated,
  getDistinctEntityTypes,
  getDistinctActorTypes,
  getActivityLogsTodayCount,
} from '../../models/adminActivityLogModel.js';

// => Single call that gathers everything the Logs page needs on initial load or filter change.
//    Bundled together so the frontend makes one request instead of four separate round trips.
export const fetchLogsPageData = async ({ page, pageSize, entityType, actorType, action, search }) => {
  const [{ logs, total }, entityTypes, actorTypes, logsToday] = await Promise.all([
    getAllActivityLogsPaginated(pool, { page, pageSize, entityType, actorType, action, search }),
    getDistinctEntityTypes(pool),
    getDistinctActorTypes(pool),
    getActivityLogsTodayCount(pool),
  ]);

  return {
    logs,
    total,
    entityTypes,
    actorTypes,
    logsToday,
  };
};
