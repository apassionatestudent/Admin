// => admin/services/SupportTickets/publicSupportTicketService.js
// => Business logic + validation for public support tickets on the admin
//    side. No middleware file for this - validation lives here per the
//    project's recent convention shift.

import {
  getPublicSupportTicketsPage,
  getPublicSupportTicketStatusCounts,
  getDistinctPublicConcernTypes,
  getPublicSupportTicketByPublicId,
  updatePublicSupportTicketFields,
} from '../../models/SupportTickets/publicSupportTicketModel.js';

// => Activity logging - shared top-level model, not SupportTickets-specific
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';
// => Diff builder for turning old-vs-new field values into a readable log line
import { buildFieldDiff, formatDiffDetail } from '../../utils/buildFieldDiff.js';

// => Custom error class so the controller can distinguish a validation
// => failure (400) from an unexpected server error (500), same pattern
// => used on the public site's ticket service
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// => The 4 allowed statuses, locked into the DB via CHECK constraint.
// => Duplicated by hand here since there is no shared code between the
// => public site and admin backends - if this list ever changes, the
// => DB constraint and this array must be updated together.
export const ALLOWED_STATUSES = ['Open', 'In Progress', 'Resolved', 'Unresolved'];

// => Bounds page/limit so a malformed query param can't be abused -
// => limit capped at 100 regardless of what's requested
export const fetchPublicSupportTicketsPage = async (pool, { page, limit, search, concernType, status, hideClosed }) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

  const { rows, totalCount } = await getPublicSupportTicketsPage(pool, {
    page: safePage,
    limit: safeLimit,
    search,
    concernType,
    status,
    hideClosed,
  });

  const [{ openCount, inProgressCount }, concernTypeOptions] = await Promise.all([
    getPublicSupportTicketStatusCounts(pool),
    getDistinctPublicConcernTypes(pool),
  ]);

  return {
    data: rows,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / safeLimit)),
    page: safePage,
    openCount,
    inProgressCount,
    concernTypeOptions,
  };
};

// => Used by the new detail page - simple pass-through, kept as its own
// => service function for the same reason as fetchAllPublicSupportTickets
export const fetchPublicSupportTicketByPublicId = async (pool, publicId) => {
  return await getPublicSupportTicketByPublicId(pool, publicId);
};

// => Validates the incoming status, confirms the ticket exists, then
// => updates it. Throws ValidationError for bad input so the controller
// => can map it to a 400 instead of a 500.
// => Internal remarks are free-text and admin-only - capped well below
// => the TEXT column's practical limit, and checked before any further
// => processing, same length-before-pattern-check order used elsewhere
const MAX_INTERNAL_REMARKS_LENGTH = 2000;

// => Validates whichever of status / internal_remarks were sent, confirms
// => the ticket exists, then updates it. Both fields are optional - the
// => admin can update just the status, just the remarks, or both together.
export const changePublicSupportTicketFields = async (pool, publicId, { status, internal_remarks } = {}, actor = {}) => {
  if (!publicId) {
    throw new ValidationError('Ticket public_id is required.');
  }

  const fields = {};

  if (status !== undefined) {
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new ValidationError(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`);
    }
    fields.status = status;
  }

  if (internal_remarks !== undefined) {
    // => null is allowed - lets the admin clear existing remarks
    if (internal_remarks !== null) {
      if (typeof internal_remarks !== 'string') {
        throw new ValidationError('Internal remarks must be text.');
      }
      if (internal_remarks.length > MAX_INTERNAL_REMARKS_LENGTH) {
        throw new ValidationError(`Internal remarks must be under ${MAX_INTERNAL_REMARKS_LENGTH} characters.`);
      }
    }
    fields.internal_remarks = internal_remarks;
  }

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('At least one field (status or internal_remarks) is required.');
  }

  const existingTicket = await getPublicSupportTicketByPublicId(pool, publicId);
  if (!existingTicket) {
    // => Not a ValidationError - the controller checks for null return
    // => value here and maps it to 404 instead
    return null;
  }

  const updatedTicket = await updatePublicSupportTicketFields(pool, publicId, fields);

  // => Logs the change after the write succeeds. Same folding rule as
  // => supportTicketService.js: a status change made together with a
  // => remarks change in one Save becomes a single STATUS_CHANGE entry,
  // => a remarks-only save logs as a plain UPDATE.
  const { action, action_detail } = buildPublicTicketLogEntry(existingTicket, fields);
  await logActivity(pool, {
    entity_type: 'public_support_ticket',
    entity_id: existingTicket.ticket_id,
    actor_type: 'Staff',
    actor_id: actor.admin_id,
    actor_name: actor.full_name,
    action,
    action_detail,
  });

  return updatedTicket;
};

// => Builds the action + action_detail for a public support ticket update
// => log. Own copy, no shared code with supportTicketService.js's version,
// => per the project's no-shared-abstraction convention. Only
// => internal_remarks exists on this table, unlike support_tickets which
// => also has external_remarks.
const buildPublicTicketLogEntry = (existingTicket, fields) => {
  const remarksFields = {};
  if (fields.internal_remarks !== undefined) remarksFields.internal_remarks = fields.internal_remarks;

  const remarksDiff = buildFieldDiff(existingTicket, remarksFields, {
    internal_remarks: 'Internal Remarks',
  });

  // => Only counts as a status change if the value actually differs from
  // => what's already saved - the frontend always sends selectedStatus on
  // => every save, so fields.status being present is not enough on its own
  const statusActuallyChanged = fields.status !== undefined && fields.status !== existingTicket.status;

  if (statusActuallyChanged) {
    const statusLine = `Status: "${existingTicket.status}" => "${fields.status}"`;
    return {
      action: 'STATUS_CHANGE',
      action_detail: `Updated ticket - ${[statusLine, ...remarksDiff].join('; ')}`,
    };
  }

  return {
    action: 'UPDATE',
    action_detail: formatDiffDetail('ticket', remarksDiff),
  };
};

// => Fetches every activity log for this ticket, newest first - no
// => pagination, matches the pattern used by Facilities/Trainers/Batches.
// => Returns null (not an empty array) when the ticket itself doesn't
// => exist, so the controller can map that to a 404 same as the detail fetch.
export const fetchPublicSupportTicketLogs = async (pool, publicId) => {
  const ticket = await getPublicSupportTicketByPublicId(pool, publicId);
  if (!ticket) return null;
  return await getActivityLogsForEntity(pool, 'public_support_ticket', ticket.ticket_id);
};