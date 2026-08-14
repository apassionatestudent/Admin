// => Canonical, reusable action types for activity_logs.action across all entity types.
// => Meaning comes from combining this action with entity_type; specifics belong in action_detail.
// => Keep this list in sync in both codebases and with the activity_logs_action_check constraint in Neon.
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

// => Flat array form, useful for report filter dropdowns or manual input validation before insert.
export const ACTIVITY_ACTION_VALUES = Object.values(ACTIVITY_ACTIONS);
