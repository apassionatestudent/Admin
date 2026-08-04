// => admin/services/SupportTickets/publicSupportTicketService.js
// => Business logic + validation for public support tickets on the admin
//    side. No middleware file for this - validation lives here per the
//    project's recent convention shift.

import {
  getAllPublicSupportTickets,
  getPublicSupportTicketByPublicId,
  updatePublicSupportTicketFields,
} from '../../models/SupportTickets/publicSupportTicketModel.js';

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

// => Simple pass-through for now - kept as its own service function
// => (rather than calling the model directly from the controller) so
// => future logic like pagination or filtering has a natural home here
export const fetchAllPublicSupportTickets = async (pool) => {
  return await getAllPublicSupportTickets(pool);
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
export const changePublicSupportTicketFields = async (pool, publicId, { status, internal_remarks } = {}) => {
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

  return await updatePublicSupportTicketFields(pool, publicId, fields);
};