// => Thin layer: pull request data, call the service, shape the response.
// => No SQL and no business rules here.
import * as refundsService from '../../services/Payments/refundsService.js';
import { generateRefundReceiptPdf } from '../../services/Payments/refundReceiptService.js';

export async function getTesdaCourseOptions(req, res, next) {
  try {
    const courses = await refundsService.getTesdaCourseOptions();
    res.json({ courses });
  } catch (error) {
    next(error);
  }
}

export async function getRefundableEnrollments(req, res, next) {
  try {
    const enrollments = await refundsService.getRefundableEnrollments(req.query.search);
    res.json({ enrollments });
  } catch (error) {
    next(error);
  }
}

export async function createRefund(req, res, next) {
  try {
    const { enrollmentType, enrollmentId, refundType, percentageValue, amount, reason, remarks } = req.body;

    const refund = await refundsService.createRefund({
      enrollmentType,
      enrollmentId,
      refundType,
      percentageValue,
      amount,
      reason,
      remarks,
      // => req.admin is the decoded JWT payload set by protectAdmin,
      // => fields are snake_case since that's how the token was signed
      admin: { adminId: req.admin.admin_id, fullName: req.admin.full_name }
    });

    res.status(201).json({ refund });
  } catch (error) {
    next(error);
  }
}

export async function listRefunds(req, res, next) {
  try {
    const { page, limit, status, courseId, search } = req.query;
    const result = await refundsService.listRefunds({ page, limit, status, courseId, search });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getRefundDetail(req, res, next) {
  try {
    const refund = await refundsService.getRefundDetail(req.params.publicId);
    res.json({ refund });
  } catch (error) {
    next(error);
  }
}

export async function downloadRefundReceipt(req, res, next) {
  try {
    const pdfBuffer = await generateRefundReceiptPdf(req.params.publicId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="refund-receipt-${req.params.publicId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

export async function voidRefund(req, res, next) {
  try {
    const { voidReason } = req.body;

    const refund = await refundsService.voidRefund({
      publicId: req.params.publicId,
      voidReason,
      admin: { adminId: req.admin.admin_id, fullName: req.admin.full_name }
    });

    res.json({ refund });
  } catch (error) {
    next(error);
  }
}
