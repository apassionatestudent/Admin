// => admin/services/Logs/logsService.js
// => Thin service layer between the Logs controller and the shared activity log model.
//    pool is imported at the top, never passed as a parameter, matching the rest of the codebase.

import { pool } from '../../config/db.js';
import {
  getAllActivityLogsPaginated,
  getDistinctEntityTypes,
  getDistinctActorTypes,
  getDistinctActions,
  getActivityLogsTodayCount,
} from '../../models/adminActivityLogModel.js';

// => Single call that gathers everything the Logs page needs on initial load or filter change.
//    Bundled together so the frontend makes one request instead of five separate round trips.
export const fetchLogsPageData = async ({ page, pageSize, entityType, actorType, action, search }) => {
  const [{ logs, total }, entityTypes, actorTypes, actions, logsToday] = await Promise.all([
    getAllActivityLogsPaginated(pool, { page, pageSize, entityType, actorType, action, search }),
    getDistinctEntityTypes(pool),
    getDistinctActorTypes(pool),
    // => Pulled from the actual table now instead of the frontend constant,
    //    so every action that has ever been logged shows up as a filter option
    getDistinctActions(pool),
    getActivityLogsTodayCount(pool),
  ]);

  return {
    logs,
    total,
    entityTypes,
    actorTypes,
    actions,
    logsToday,
  };
};
