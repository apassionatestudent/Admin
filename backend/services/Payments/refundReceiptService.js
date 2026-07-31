// => services/Payments/refundReceiptService.js
// => Same structure as paymentReceiptService.js, kept as its own file per
// => the project's duplication policy. Reuses getRefundDetail so this
// => always matches what's shown on the RefundDetail page.

import PDFDocument from 'pdfkit';
import * as refundsService from './refundsService.js';
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

function formatRefundBasis(refund) {
  return refund.refundType === 'Percentage'
    ? `${refund.percentageValue}% of course fee`
    : 'Fixed amount';
}

export async function generateRefundReceiptPdf(publicId) {
  const refund = await refundsService.getRefundDetail(publicId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerReceiptFonts(doc);

    drawReceiptHeader(doc, {
      docTitle: 'Refund Receipt',
      receiptNumber: refund.refundNumber,
      issuedDate: formatDate(refund.createdAt)
    });

    drawInfoSection(doc, 'Student', [
      { label: 'Name', value: refund.studentName },
      { label: 'Email', value: refund.studentEmail }
    ]);

    // => Same as paymentReceiptService.js - identifies the enrollment/batch
    // => this refund belongs to, no fee/balance breakdown
    drawInfoSection(doc, 'Enrollment', [
      { label: 'Program', value: refund.enrollmentType },
      {
        label: 'Batch',
        value: refund.batchSequence ? `${refund.batchName} (Batch ${refund.batchSequence})` : refund.batchName
      },
      { label: 'Enrollment ID', value: refund.enrollmentPublicId }
    ]);

    drawInfoSection(doc, 'Refund', [
      { label: 'Amount Refunded', value: formatCurrency(refund.amount) },
      { label: 'Basis', value: formatRefundBasis(refund) },
      { label: 'Refund Method', value: refund.refundMethod },
      { label: 'Status', value: refund.status },
      { label: 'Recorded By', value: refund.createdByName }
    ]);

    drawInfoSection(doc, 'Reason', [
      { label: 'Reason', value: refund.reason }
    ]);

    if (refund.remarks) {
      drawInfoSection(doc, 'Remarks', [
        { label: 'Note', value: refund.remarks }
      ]);
    }

    if (refund.status === 'Voided') {
      drawInfoSection(doc, 'Void Details', [
        { label: 'Reason', value: refund.voidReason },
        { label: 'Voided By', value: refund.voidedByName },
        { label: 'Voided At', value: formatDate(refund.voidedAt) }
      ]);
    }

    drawReceiptFooter(doc, 'This receipt is system-generated and valid without a physical signature.');

    doc.end();
  });
}
