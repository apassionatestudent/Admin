// => admin/models/SupportTickets/publicSupportTicketModel.js
// => Handles the admin-side reads/writes against public_support_tickets.
//    This table is anonymous (no student_id) and shared with the public
//    site's backend via the same Neon database - see server.js there for
//    where rows originate.
// => Uses pool, not sql, per project convention - mirrors the pattern in
//    sharedEnrollmentModel.js (pool.query, $1/$2 placeholders, .rows destructuring)

// => Builds the WHERE clause + params shared by the paginated list query
// => and its matching count query - own copy, no shared code with
// => supportTicketModel.js's buildTicketFilters per project convention
const buildPublicTicketFilters = ({ search, concernType, status, hideClosed }) => {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (concernType && concernType !== 'ALL') {
    conditions.push(`concern_type = $${idx}`);
    values.push(concernType);
    idx++;
  }

  if (status && status !== 'ALL') {
    conditions.push(`status = $${idx}`);
    values.push(status);
    idx++;
  } else if (hideClosed) {
    conditions.push(`status NOT IN ('Resolved', 'Unresolved')`);
  }

  if (search && search.trim() !== '') {
    conditions.push(
      `(full_name ILIKE $${idx} OR email ILIKE $${idx} OR contact_number ILIKE $${idx})`
    );
    values.push(`%${search.trim()}%`);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values, nextIdx: idx };
};

// => Fetch one page of public support tickets matching the given filters,
// => plus the total matching count for pagination controls
export const getPublicSupportTicketsPage = async (pool, { page, limit, search, concernType, status, hideClosed }) => {
  const { whereClause, values, nextIdx } = buildPublicTicketFilters({ search, concernType, status, hideClosed });
  const offset = (page - 1) * limit;

  const dataResult = await pool.query(
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
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
    [...values, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public_support_tickets ${whereClause}`,
    values
  );

  return { rows: dataResult.rows, totalCount: countResult.rows[0].total };
};

// => Open/In Progress counts for the header badges - computed across ALL
// => public tickets, unaffected by search/filter/pagination
export const getPublicSupportTicketStatusCounts = async (pool) => {
  const result = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'Open')::int AS open_count,
        COUNT(*) FILTER (WHERE status = 'In Progress')::int AS in_progress_count
      FROM public_support_tickets`
  );
  return {
    openCount: result.rows[0].open_count,
    inProgressCount: result.rows[0].in_progress_count,
  };
};

// => Distinct concern types across ALL public tickets, for the Concern
// => Type dropdown - independent of the currently applied page/filter
export const getDistinctPublicConcernTypes = async (pool) => {
  const result = await pool.query(
    `SELECT DISTINCT concern_type
      FROM public_support_tickets
      WHERE concern_type IS NOT NULL
      ORDER BY concern_type`
  );
  return result.rows.map((r) => r.concern_type);
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