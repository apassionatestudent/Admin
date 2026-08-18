// => admin/services/SupportTickets/supportTicketService.js
// => Business logic + validation for the private, student-scoped support
//    tickets. Own ValidationError class and own ALLOWED_STATUSES list -
//    no shared code with publicSupportTicketService.js, per convention.

import {
  getSupportTicketsPage,
  getSupportTicketStatusCounts,
  getDistinctConcernTypes,
  getSupportTicketByPublicId,
  updateSupportTicketFields,
} from '../../models/SupportTickets/supportTicketModel.js';

// => Activity logging - shared top-level model, not SupportTickets-specific
import { logActivity, getActivityLogsForEntity } from '../../models/adminActivityLogModel.js';
// => Diff builder for turning old-vs-new field values into a readable log line
import { buildFieldDiff, formatDiffDetail } from '../../utils/buildFieldDiff.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// => support_tickets.status has no DB-level CHECK constraint yet (unlike
//    public_support_tickets), so this list is the only place it's enforced
//    right now - if a CHECK constraint gets added later in the Neon SQL
//    Editor, keep it in sync with this array
export const ALLOWED_STATUSES = ['Open', 'In Progress', 'Resolved', 'Unresolved'];

// => Internal remarks are free-text and admin-only - same cap as
// => publicSupportTicketService.js's MAX_INTERNAL_REMARKS_LENGTH
const MAX_INTERNAL_REMARKS_LENGTH = 2000;
const MAX_EXTERNAL_REMARKS_LENGTH = 2000;

// => Bounds page/limit so a malformed query param can't be abused -
// => limit capped at 100 regardless of what's requested
export const fetchSupportTicketsPage = async (pool, { page, limit, search, concernType, status, hideClosed }) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

  const { rows, totalCount } = await getSupportTicketsPage(pool, {
    page: safePage,
    limit: safeLimit,
    search,
    concernType,
    status,
    hideClosed,
  });

  const [{ openCount, inProgressCount }, concernTypeOptions] = await Promise.all([
    getSupportTicketStatusCounts(pool),
    getDistinctConcernTypes(pool),
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

export const fetchSupportTicketByPublicId = async (pool, publicId) => {
  return await getSupportTicketByPublicId(pool, publicId);
};

// => Validates whichever of status / internal_remarks were sent, confirms
// => the ticket exists, then updates it. Both fields are optional - the
// => admin can update just the status, just the remarks, or both together.
// => adminId comes from req.admin (the logged-in admin performing the
// => update), not from the request body.
export const changeSupportTicketFields = async (pool, publicId, { status, internal_remarks, external_remarks } = {}, actor = {}) => {
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

  // => external_remarks is student-facing - this is what the student will
  // => eventually see on their dashboard, e.g. "We tried calling you
  // => around 01AUG26 but you were unresponsive." Same validation shape
  // => as internal_remarks, just a separate column and separate cap.
  if (external_remarks !== undefined) {
    // => null is allowed - lets the admin clear existing remarks
    if (external_remarks !== null) {
      if (typeof external_remarks !== 'string') {
        throw new ValidationError('External remarks must be text.');
      }
      if (external_remarks.length > MAX_EXTERNAL_REMARKS_LENGTH) {
        throw new ValidationError(`External remarks must be under ${MAX_EXTERNAL_REMARKS_LENGTH} characters.`);
      }
    }
    fields.external_remarks = external_remarks;
  }

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('At least one field (status, internal_remarks, or external_remarks) is required.');
  }

  const existingTicket = await getSupportTicketByPublicId(pool, publicId);
  if (!existingTicket) {
    // => Not a ValidationError - the controller checks for null return
    // => value here and maps it to 404 instead
    return null;
  }

  const updatedTicket = await updateSupportTicketFields(pool, publicId, fields, actor.admin_id);

  // => Logs the change after the write succeeds. Per project decision, a
  // => status change and any remarks change made in the same Save fold
  // => into ONE STATUS_CHANGE entry instead of two separate rows - a
  // => remarks-only save (no status included) logs as a plain UPDATE.
  const { action, action_detail } = buildTicketLogEntry(existingTicket, fields);
  await logActivity(pool, {
    entity_type: 'support_ticket',
    entity_id: existingTicket.ticket_id,
    actor_type: 'Staff',
    actor_id: actor.admin_id,
    actor_name: actor.full_name,
    action,
    action_detail,
  });

  return updatedTicket;
};

// => Builds the action + action_detail for a support ticket update log.
// => Own copy, no shared code with publicSupportTicketService.js's version,
// => per the project's no-shared-abstraction convention.
const buildTicketLogEntry = (existingTicket, fields) => {
  const remarksFields = {};
  if (fields.internal_remarks !== undefined) remarksFields.internal_remarks = fields.internal_remarks;
  if (fields.external_remarks !== undefined) remarksFields.external_remarks = fields.external_remarks;

  const remarksDiff = buildFieldDiff(existingTicket, remarksFields, {
    internal_remarks: 'Internal Remarks',
    external_remarks: 'External Remarks',
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
export const fetchSupportTicketLogs = async (pool, publicId) => {
  const ticket = await getSupportTicketByPublicId(pool, publicId);
  if (!ticket) return null;
  return await getActivityLogsForEntity(pool, 'support_ticket', ticket.ticket_id);
};
