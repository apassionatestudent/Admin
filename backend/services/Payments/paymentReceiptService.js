// => services/Payments/paymentReceiptService.js
// => Builds the payment receipt PDF as a Buffer. Reuses getPaymentDetail
// => instead of re-querying, so the receipt always reflects the exact
// => same data shown on the PaymentDetail page.

import PDFDocument from 'pdfkit';
import * as paymentsService from './paymentsService.js';
import {
  registerReceiptFonts,
  drawReceiptHeader,
  drawInfoSection,
  drawReceiptFooter
} from '../../utils/receiptPdfLayout.js';

// => pdfkit's default Helvetica font has no glyph for the peso sign,
// => Intl's currency formatter would render it as a broken "±" character.
// => "PHP" as a plain-text prefix avoids needing a custom embedded font.
function formatCurrency(value) {
  const formattedNumber = Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `PHP ${formattedNumber}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

// => Returns a Buffer, throws the same "Payment not found" error as
// => getPaymentDetail if the publicId does not exist, the controller's
// => try/catch + next(error) handles that the normal way.
export async function generatePaymentReceiptPdf(publicId) {
  const payment = await paymentsService.getPaymentDetail(publicId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerReceiptFonts(doc);

    drawReceiptHeader(doc, {
      docTitle: 'Official Receipt',
      receiptNumber: payment.orNumber,
      issuedDate: formatDate(payment.paymentDate)
    });

    drawInfoSection(doc, 'Student', [
      { label: 'Name', value: payment.studentName },
      { label: 'Email', value: payment.studentEmail }
    ]);

    // => Enrollment identifies which program/batch this payment belongs
    // => to. No fee/balance breakdown here - that's tracked elsewhere,
    // => this document is a record of the payment itself.
    drawInfoSection(doc, 'Enrollment', [
      { label: 'Program', value: payment.enrollmentType },
      {
        label: 'Batch',
        value: payment.batchSequence ? `${payment.batchName} (Batch ${payment.batchSequence})` : payment.batchName
      },
      { label: 'Enrollment ID', value: payment.enrollmentPublicId }
    ]);

    drawInfoSection(doc, 'Payment', [
      { label: 'Amount Paid', value: formatCurrency(payment.amount) },
      { label: 'Payment Method', value: payment.paymentMethod },
      { label: 'Payment Date', value: formatDate(payment.paymentDate) },
      { label: 'Status', value: payment.status },
      { label: 'Recorded By', value: payment.createdByName }
    ]);

    if (payment.remarks) {
      drawInfoSection(doc, 'Remarks', [
        { label: 'Note', value: payment.remarks }
      ]);
    }

    if (payment.status === 'Voided') {
      drawInfoSection(doc, 'Void Details', [
        { label: 'Reason', value: payment.voidReason },
        { label: 'Voided By', value: payment.voidedByName },
        { label: 'Voided At', value: formatDate(payment.voidedAt) }
      ]);
    }

    drawReceiptFooter(doc, 'This receipt is system-generated and valid without a physical signature.');

    doc.end();
  });
}
