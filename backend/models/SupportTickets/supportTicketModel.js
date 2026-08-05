// => admin/models/SupportTickets/supportTicketModel.js
// => Handles admin-side reads/writes against the private, student-scoped
//    support_tickets table. Distinct from public_support_tickets - this
//    table is joined to student_profile since every row here belongs to
//    a logged-in student account.
// => Uses pool, not sql, per project convention - same pool.query / $1
//    placeholder / .rows pattern as publicSupportTicketModel.js

// => Builds the WHERE clause + params shared by the paginated list query
// => and its matching count query, so filtering logic never drifts
// => between the two
const buildTicketFilters = ({ search, concernType, status, hideClosed }) => {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (concernType && concernType !== 'ALL') {
    conditions.push(`st.concern_type = $${idx}`);
    values.push(concernType);
    idx++;
  }

  if (status && status !== 'ALL') {
    conditions.push(`st.status = $${idx}`);
    values.push(status);
    idx++;
  } else if (hideClosed) {
    // => Only applies when no explicit status was chosen - matches the
    // => frontend's "Hide Resolved / Unresolved" toggle default-on behavior
    conditions.push(`st.status NOT IN ('Resolved', 'Unresolved')`);
  }

  if (search && search.trim() !== '') {
    conditions.push(
      `(
        (sp.first_name || ' ' || COALESCE(sp.middle_name, '') || ' ' || sp.last_name || ' ' || COALESCE(sp.name_extension, '')) ILIKE $${idx}
        OR sp.email ILIKE $${idx}
        OR sp.contact_no ILIKE $${idx}
        OR st.subject ILIKE $${idx}
      )`
    );
    values.push(`%${search.trim()}%`);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values, nextIdx: idx };
};

// => Fetch one page of student support tickets matching the given filters,
// => plus the total matching count for pagination controls
export const getSupportTicketsPage = async (pool, { page, limit, search, concernType, status, hideClosed }) => {
  const { whereClause, values, nextIdx } = buildTicketFilters({ search, concernType, status, hideClosed });
  const offset = (page - 1) * limit;

  const dataResult = await pool.query(
    `SELECT
        st.ticket_id,
        st.public_id,
        st.student_id,
        st.subject,
        st.message,
        st.concern_type,
        st.status,
        st.internal_remarks,
        st.external_remarks,
        st.resolved_by,
        st.resolved_at,
        st.created_at,
        st.updated_at,
        sp.first_name,
        sp.middle_name,
        sp.last_name,
        sp.name_extension,
        sp.contact_no,
        sp.email
      FROM support_tickets st
      LEFT JOIN student_profile sp ON sp.student_id = st.student_id
      ${whereClause}
      ORDER BY st.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
    [...values, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
      FROM support_tickets st
      LEFT JOIN student_profile sp ON sp.student_id = st.student_id
      ${whereClause}`,
    values
  );

  return { rows: dataResult.rows, totalCount: countResult.rows[0].total };
};

// => Open/In Progress counts for the header badges - always computed
// => across ALL tickets, unaffected by search/filter/pagination, same
// => behavior the frontend used to compute client-side from the full list
export const getSupportTicketStatusCounts = async (pool) => {
  const result = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'Open')::int AS open_count,
        COUNT(*) FILTER (WHERE status = 'In Progress')::int AS in_progress_count
      FROM support_tickets`
  );
  return {
    openCount: result.rows[0].open_count,
    inProgressCount: result.rows[0].in_progress_count,
  };
};

// => Distinct concern types across ALL tickets, for the Concern Type
// => dropdown - independent of whatever page/filter is currently applied
export const getDistinctConcernTypes = async (pool) => {
  const result = await pool.query(
    `SELECT DISTINCT concern_type
      FROM support_tickets
      WHERE concern_type IS NOT NULL
      ORDER BY concern_type`
  );
  return result.rows.map((r) => r.concern_type);
};

// => Fetch a single ticket by its public_id, same student join plus
// => resolved_by_name pulled from admins for display on the detail page
export const getSupportTicketByPublicId = async (pool, publicId) => {
  const result = await pool.query(
    `SELECT
        st.ticket_id,
        st.public_id,
        st.student_id,
        st.subject,
        st.message,
        st.concern_type,
        st.status,
        st.internal_remarks,
        st.external_remarks,
        st.resolved_by,
        st.resolved_at,
        st.created_at,
        st.updated_at,
        sp.first_name,
        sp.middle_name,
        sp.last_name,
        sp.name_extension,
        sp.contact_no,
        sp.email,
        a.full_name AS resolved_by_name
      FROM support_tickets st
      LEFT JOIN student_profile sp ON sp.student_id = st.student_id
      LEFT JOIN admins a ON a.admin_id = st.resolved_by
      WHERE st.public_id = $1
      LIMIT 1`,
    [publicId]
  );
  return result.rows[0] ?? null;
};

// => Whitelist of columns this admin update endpoint may touch - column
// => names can't be parameterized with $ placeholders, same guard as
// => publicSupportTicketModel.js's ALLOWED_TICKET_FIELDS
const ALLOWED_TICKET_FIELDS = new Set(['status', 'internal_remarks', 'external_remarks']);

// => Updates whichever of status / internal_remarks were passed in, and
// => keeps resolved_by/resolved_at in sync whenever status is included -
// => set to the acting admin + now() when status becomes 'Resolved',
// => cleared back to null when status moves away from 'Resolved'.
// => adminId is who is performing this action, passed in by the service
// => layer from req.admin, never taken from the request body.
export const updateSupportTicketFields = async (pool, publicId, fields, adminId) => {
  const keys = Object.keys(fields).filter((k) => ALLOWED_TICKET_FIELDS.has(k));
  if (keys.length === 0) return null;

  const setClauses = [];
  const values = [];
  let idx = 1;

  keys.forEach((k) => {
    setClauses.push(`${k} = $${idx}`);
    values.push(fields[k]);
    idx++;
  });

  // => resolved_by/resolved_at side effect only fires when status is
  // => one of the fields being updated in this call
  if (keys.includes('status')) {
    const isResolving = fields.status === 'Resolved';
    setClauses.push(`resolved_by = $${idx}`);
    values.push(isResolving ? adminId : null);
    idx++;
    setClauses.push(`resolved_at = $${idx}`);
    values.push(isResolving ? new Date() : null);
    idx++;
  }

  values.push(publicId);

  const result = await pool.query(
    `UPDATE support_tickets
        SET ${setClauses.join(', ')}
      WHERE public_id = $${idx}
      RETURNING
        ticket_id, public_id, student_id, subject, message, concern_type, status,
        internal_remarks, external_remarks, resolved_by, resolved_at, created_at, updated_at`,
    values
  );
  return result.rows[0] ?? null;
};
