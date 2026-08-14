// => admin/frontend/src/Constants/activityActions.js
// => Frontend mirror of backend/Constants/activityActions.js
// => Duplicated deliberately since the frontend and backend are separate bundlers.
// => Keep in sync with the backend copy and with the activity_logs_action_check
//    constraint in Neon whenever a value is added or changed.
export const ACTIVITY_ACTIONS = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  SOFT_DELETE: 'SOFT_DELETE',
  RESTORE: 'RESTORE',
  VOID: 'VOID',
  SUSPEND: 'SUSPEND',
  REACTIVATE: 'REACTIVATE',
  INVITE: 'INVITE',
  RESET_PASSWORD: 'RESET_PASSWORD',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  LOGIN: 'LOGIN',
  DOCUMENT_ADD: 'DOCUMENT_ADD',
  DOCUMENT_REPLACE: 'DOCUMENT_REPLACE',
  PERMISSION_CHANGE: 'PERMISSION_CHANGE',
  RELEASE: 'RELEASE',
});

export const ACTIVITY_ACTION_VALUES = Object.values(ACTIVITY_ACTIONS);
