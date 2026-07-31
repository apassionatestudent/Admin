// => Utils/receiptPdfLayout.js
// => Shared PDF drawing helpers for company receipts. This is
// => presentation boilerplate (logo, header block, footer), not business
// => logic, so it stays as one shared file instead of being duplicated
// => per feature like the rest of the codebase's TESDA/SHS-style
// => duplication policy.

import path from 'path';
import { fileURLToPath } from 'url';

// => ES modules have no __dirname, this is the standard replacement
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// => Company header details, change here once, applies to every PDF
// => that uses this layout.
export const COMPANY_NAME = '3A Prime Hospitality Training and Assessment Center Inc.';
export const COMPANY_ADDRESS = '0362 Don Mariano Cui St., Corner N. Escario St., Capitol Site, Cebu City, Cebu, 6000, Philippines';

// => Adjust this filename if the logo in backend/assets is not renamed
// => to company-logo.png
export const COMPANY_LOGO_PATH = path.join(__dirname, '../assets/company-logo.png');

// => Merriweather ttf files, matching the webapp's --font-body token
// => (index.css: --font-body: 'Merriweather', serif). pdfkit cannot read
// => Google Fonts by CSS name, it needs the actual font file embedded
// => into the PDF, so these live in backend/assets/fonts.
const FONT_REGULAR_PATH = path.join(__dirname, '../assets/fonts/merriweather-regular.ttf');
const FONT_BOLD_PATH = path.join(__dirname, '../assets/fonts/merriweather-bold.ttf');

const MAROON = '#7a1220';
const GRAY = '#6b7280';
const DARK = '#111827';
const LIGHT_BORDER = '#e5e7eb';

// => Registers Merriweather under the names 'Body' and 'Body-Bold' on
// => this pdfkit document. Call this once, immediately after
// => `new PDFDocument()`, before any other drawing helper in this file.
export function registerReceiptFonts(doc) {
  doc.registerFont('Body', FONT_REGULAR_PATH);
  doc.registerFont('Body-Bold', FONT_BOLD_PATH);
}

// => Draws the document title, receipt number, and issued date as their
// => own centered block at the very top of the page, then the logo and
// => company name/address as a separate block below it. Keeping these
// => two blocks stacked instead of side-by-side is what prevents the
// => long company name from wrapping into the title text. Call this
// => first, right after `new PDFDocument()`.
export function drawReceiptHeader(doc, { docTitle, receiptNumber, issuedDate }) {
  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const pageWidth = pageRight - pageLeft;

  // => Top block: title, receipt number, date, all centered
  doc
    .fillColor(MAROON)
    .font('Body-Bold')
    .fontSize(20)
    .text(docTitle.toUpperCase(), pageLeft, 40, { width: pageWidth, align: 'center' });

  doc
    .fillColor(DARK)
    .font('Body-Bold')
    .fontSize(11)
    .text(receiptNumber, pageLeft, 66, { width: pageWidth, align: 'center' });

  doc
    .fillColor(GRAY)
    .font('Body')
    .fontSize(9)
    .text(issuedDate, pageLeft, 82, { width: pageWidth, align: 'center' });

  doc
    .moveTo(pageLeft, 104)
    .lineTo(pageRight, 104)
    .strokeColor(LIGHT_BORDER)
    .lineWidth(1)
    .stroke();

  // => Company block: logo left, name/address to its right. Font size
  // => dropped slightly and given the full page width so the long
  // => company name fits on a single line instead of wrapping.
  doc.image(COMPANY_LOGO_PATH, pageLeft, 116, { width: 50, height: 50 });

  doc
    .fillColor(DARK)
    .font('Body-Bold')
    .fontSize(10.5)
    .text(COMPANY_NAME, pageLeft + 62, 120, { width: pageWidth - 62 });

  doc
    .fillColor(GRAY)
    .font('Body')
    .fontSize(8.5)
    .text(COMPANY_ADDRESS, pageLeft + 62, 136, { width: pageWidth - 62 });

  doc
    .moveTo(pageLeft, 182)
    .lineTo(pageRight, 182)
    .strokeColor(LIGHT_BORDER)
    .lineWidth(1)
    .stroke();

  doc.y = 198;
}

// => Renders a "Label / Value" section: an uppercase heading followed by
// => rows of label-value pairs, two per row. Used for Student,
// => Enrollment, Payment, Refund, and Void blocks so every section on
// => the receipt looks consistent.
export function drawInfoSection(doc, heading, rows) {
  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const usableWidth = pageRight - pageLeft;
  const colWidth = usableWidth / 2;

  doc
    .fillColor(GRAY)
    .font('Body-Bold')
    .fontSize(9)
    .text(heading.toUpperCase(), pageLeft, doc.y);

  doc.moveDown(0.4);

  let currentY = doc.y;
  let col = 0;

  rows.forEach(({ label, value }) => {
    const x = pageLeft + (col * colWidth);

    doc
      .fillColor(GRAY)
      .font('Body')
      .fontSize(8)
      .text(label.toUpperCase(), x, currentY, { width: colWidth - 12 });

    doc
      .fillColor(DARK)
      .font('Body-Bold')
      .fontSize(10)
      .text(String(value ?? '-'), x, currentY + 12, { width: colWidth - 12 });

    col += 1;
    if (col === 2) {
      col = 0;
      currentY += 40;
    }
  });

  // => Odd number of rows, last one was alone in its row, still advance
  if (col !== 0) currentY += 40;

  doc.y = currentY + 6;

  doc
    .moveTo(pageLeft, doc.y)
    .lineTo(pageRight, doc.y)
    .strokeColor(LIGHT_BORDER)
    .lineWidth(1)
    .stroke();

  doc.y += 16;
}

// => Footer note, drawn near the bottom margin of the current page.
export function drawReceiptFooter(doc, note) {
  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const bottomY = doc.page.height - doc.page.margins.bottom - 40;

  doc
    .moveTo(pageLeft, bottomY)
    .lineTo(pageRight, bottomY)
    .strokeColor(LIGHT_BORDER)
    .lineWidth(1)
    .stroke();

  doc
    .fillColor(GRAY)
    .font('Body')
    .fontSize(8)
    .text(note, pageLeft, bottomY + 10, { width: pageRight - pageLeft, align: 'center' });
}
