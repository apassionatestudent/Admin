// => admin/controllers/SupportTickets/supportTicketController.js

import { pool } from '../../config/db.js';
import {
  fetchSupportTicketsPage,
  fetchSupportTicketByPublicId,
  changeSupportTicketFields,
  ValidationError,
} from '../../services/SupportTickets/supportTicketService.js';

// => GET /api/admin/support-tickets?page=1&limit=10&search=&concernType=ALL&status=ALL&hideClosed=true
export const getSupportTickets = async (req, res) => {
  try {
    const { page, limit, search, concernType, status, hideClosed } = req.query;
    const result = await fetchSupportTicketsPage(pool, {
      page,
      limit,
      search,
      concernType,
      status,
      hideClosed: hideClosed === 'true',
    });
    res.json(result);
  } catch (error) {
    console.error('Error fetching student support tickets:', error);
    res.status(500).json({ message: 'Failed to fetch support tickets.' });
  }
};

// => GET /api/admin/support-tickets/:publicId
export const getSupportTicketDetail = async (req, res) => {
  try {
    const { publicId } = req.params;
    const ticket = await fetchSupportTicketByPublicId(pool, publicId);

    if (!ticket) {
      return res.status(404).json({ message: 'Support ticket not found.' });
    }

    res.json({ data: ticket });
  } catch (error) {
    console.error('Error fetching student support ticket detail:', error);
    res.status(500).json({ message: 'Failed to fetch support ticket.' });
  }
};

// => PATCH /api/admin/support-tickets/:publicId
// => Body: { status?: "Open" | "In Progress" | "Resolved" | "Unresolved", internal_remarks?: string | null, external_remarks?: string | null }
// => All fields optional - send any combination together
export const updateSupportTicketStatusController = async (req, res) => {
  try {
    const { publicId } = req.params;
    const { status, internal_remarks, external_remarks } = req.body;

    // => req.admin is attached by protectAdmin - admin_id identifies who
    // => resolved the ticket when status is set to 'Resolved'
    const updatedTicket = await changeSupportTicketFields(pool, publicId, { status, internal_remarks, external_remarks }, req.admin.admin_id);

    if (!updatedTicket) {
      return res.status(404).json({ message: 'Support ticket not found.' });
    }

    res.json({ data: updatedTicket });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Error updating student support ticket status:', error);
    res.status(500).json({ message: 'Failed to update support ticket status.' });
  }
};
