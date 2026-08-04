// => admin/models/SupportTickets/publicSupportTicketModel.js
// => Handles the admin-side reads/writes against public_support_tickets.
//    This table is anonymous (no student_id) and shared with the public
//    site's backend via the same Neon database - see server.js there for
//    where rows originate.
// => Uses pool, not sql, per project convention - mirrors the pattern in
//    sharedEnrollmentModel.js (pool.query, $1/$2 placeholders, .rows destructuring)

// => Fetch every public support ticket, newest first
// => No student join needed here since these tickets have no student_id
export const getAllPublicSupportTickets = async (pool) => {
  const result = await pool.query(
    `SELECT
        ticket_id,
        public_id,
        full_name,
        contact_number,
        email,
        concern_type,
        concern,
        status,
        internal_remarks,
        created_at,
        updated_at
      FROM public_support_tickets
      ORDER BY created_at DESC`
  );
  return result.rows;
};

// => Fetch a single ticket by its public_id - used by the controller to
// => confirm a ticket exists before attempting a status update
export const getPublicSupportTicketByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        ticket_id,
        public_id,
        full_name,
        contact_number,
        email,
        concern_type,
        concern,
        status,
        internal_remarks,
        created_at,
        updated_at
      FROM public_support_tickets
      WHERE public_id = $1
      LIMIT 1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// => Updates only the status column - the service layer is responsible
// => for validating the incoming status against the allowed list before
// => this ever runs, this function trusts its caller
// => Whitelist of columns this admin update endpoint may touch - column
// => names can't be parameterized with $ placeholders, so anything not
// => on this list is silently dropped rather than reaching raw SQL
const ALLOWED_TICKET_FIELDS = new Set(['status', 'internal_remarks']);

// => Updates whichever of status / internal_remarks were passed in -
// => the service layer validates status against ALLOWED_STATUSES and
// => caps internal_remarks length before this ever runs
export const updatePublicSupportTicketFields = async (pool, publicId, fields) => {
  const keys = Object.keys(fields).filter((k) => ALLOWED_TICKET_FIELDS.has(k));
  if (keys.length === 0) return null;

  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
  const values = keys.map((k) => fields[k]);
  values.push(publicId);

  const result = await pool.query(
    `UPDATE public_support_tickets
        SET ${setClauses.join(', ')}
      WHERE public_id = $${keys.length + 1}
      RETURNING
        ticket_id,
        public_id,
        full_name,
        contact_number,
        email,
        concern_type,
        concern,
        status,
        internal_remarks,
        created_at,
        updated_at`,
    values
  );
  return result.rows[0] ?? null;
};