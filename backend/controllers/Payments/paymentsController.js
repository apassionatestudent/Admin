// => Thin layer: pull request data, call the service, shape the response.
// => No SQL and no business rules here.
import * as paymentsService from '../../services/Payments/paymentsService.js';

export async function getTesdaCourseOptions(req, res, next) {
  try {
    const courses = await paymentsService.getTesdaCourseOptions();
    res.json({ courses });
  } catch (error) {
    next(error);
  }
}

export async function getEligibleEnrollments(req, res, next) {
  try {
    const enrollments = await paymentsService.getEligibleEnrollments(req.query.search);
    res.json({ enrollments });
  } catch (error) {
    next(error);
  }
}

export async function createPayment(req, res, next) {
  try {
    const { enrollmentType, enrollmentId, amount, paymentDate, remarks } = req.body;

    const payment = await paymentsService.createPayment({
      enrollmentType,
      enrollmentId,
      amount,
      paymentDate,
      remarks,
      // => req.admin is the decoded JWT payload set by protectAdmin,
      // => fields are snake_case since that's how the token was signed
      admin: { adminId: req.admin.admin_id, fullName: req.admin.full_name }
    });

    res.status(201).json({ payment });
  } catch (error) {
    next(error);
  }
}

export async function listPayments(req, res, next) {
  try {
    const { page, limit, status, courseId, search } = req.query;
    const result = await paymentsService.listPayments({ page, limit, status, courseId, search });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPaymentDetail(req, res, next) {
  try {
    const payment = await paymentsService.getPaymentDetail(req.params.publicId);
    res.json({ payment });
  } catch (error) {
    next(error);
  }
}

export async function voidPayment(req, res, next) {
  try {
    const { voidReason } = req.body;

    const payment = await paymentsService.voidPayment({
      publicId: req.params.publicId,
      voidReason,
      admin: { adminId: req.admin.admin_id, fullName: req.admin.full_name }
    });

    res.json({ payment });
  } catch (error) {
    next(error);
  }
}
