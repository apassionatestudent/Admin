// => admin/controllers/SupportTickets/publicSupportTicketController.js

import { pool } from '../../config/db.js';
import {
  fetchPublicSupportTicketsPage,
  fetchPublicSupportTicketByPublicId,
  changePublicSupportTicketFields,
  ValidationError,
} from '../../services/SupportTickets/publicSupportTicketService.js';

// => GET /api/admin/public-support-tickets?page=1&limit=10&search=&concernType=ALL&status=ALL&hideClosed=true
export const getPublicSupportTickets = async (req, res) => {
  try {
    const { page, limit, search, concernType, status, hideClosed } = req.query;
    const result = await fetchPublicSupportTicketsPage(pool, {
      page,
      limit,
      search,
      concernType,
      status,
      hideClosed: hideClosed === 'true',
    });
    res.json(result);
  } catch (error) {
    console.error('Error fetching public support tickets:', error);
    res.status(500).json({ message: 'Failed to fetch support tickets.' });
  }
};

// => GET /api/admin/public-support-tickets/:publicId
export const getPublicSupportTicketDetail = async (req, res) => {
  try {
    const { publicId } = req.params;
    const ticket = await fetchPublicSupportTicketByPublicId(pool, publicId);

    if (!ticket) {
      return res.status(404).json({ message: 'Support ticket not found.' });
    }

    res.json({ data: ticket });
  } catch (error) {
    console.error('Error fetching public support ticket detail:', error);
    res.status(500).json({ message: 'Failed to fetch support ticket.' });
  }
};

// => PATCH /api/admin/public-support-tickets/:publicId
// => Body: { status?: "Open" | "In Progress" | "Resolved" | "Unresolved", internal_remarks?: string | null }
// => Both fields optional - send just one, the other, or both together
export const updatePublicSupportTicketStatusController = async (req, res) => {
  try {
    const { publicId } = req.params;
    const { status, internal_remarks } = req.body;

    const updatedTicket = await changePublicSupportTicketFields(pool, publicId, { status, internal_remarks });

    // => null means the service confirmed the ticket doesn't exist,
    // => distinct from a ValidationError thrown for bad input
    if (!updatedTicket) {
      return res.status(404).json({ message: 'Support ticket not found.' });
    }

    res.json({ data: updatedTicket });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Error updating public support ticket status:', error);
    res.status(500).json({ message: 'Failed to update support ticket status.' });
  }
};