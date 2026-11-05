import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { ReportDoc, ResultFlag } from '../../common/entities';

const COLORS = { ink: '#0f172a', muted: '#475569', line: '#1e293b', band: '#e2e8f0', soft: '#f1f5f9', green: '#15803d', high: '#b91c1c', low: '#1d4ed8' };
// Standard PDF fonts are WinAnsi-encoded: keep labels ASCII.
const FLAG_LABEL: Partial<Record<ResultFlag, string>> = { high: 'H', low: 'L', critical_high: 'HH !', critical_low: 'LL !', abnormal: 'A' };
const DEFAULT_PROVISO = 'This report relates only to the sample(s) received. Results should be interpreted by a qualified clinician in the clinical context.';

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * A4 report from the immutable snapshot, in the classic laboratory layout:
 * letterhead, two-column patient block, department band, TEST NAME / RESULT /
 * UNITS / NORMAL VALUE table, and a footer on every page with staff names,
 * proviso, print date and page numbers. Matches the on-screen/printed report.
 */
export async function renderReportPdf(report: ReportDoc, verifyUrl: string, logo?: Buffer): Promise<Buffer> {
  const s = report.snapshot;
  const qr = await QRCode.toBuffer(`${verifyUrl}/${report.verificationCode}`, { margin: 0, width: 140 });
  const FOOTER_H = 112;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 30, bottom: FOOTER_H + 16, left: 36, right: 36 }, bufferPages: true, info: { Title: `Report ${report.reportNumber}`, Author: s.lab.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom;
  const colX = [0, 0.4, 0.58, 0.75].map((f) => left + 10 + f * (width - 20));
  const colW = [0.4, 0.18, 0.17, 0.25].map((f) => f * (width - 20) - 6);

  const header = () => {
    const top = 28;
    let textX = left;
    if (logo) {
      try {
        doc.image(logo, left, top, { fit: [74, 70] });
        textX = left + 84;
      } catch {
        /* unreadable logo: text-only letterhead */
      }
    }
    const tw = width - (textX - left);
    doc.fillColor(COLORS.ink).font('Times-Bold').fontSize(20).text(s.lab.name.toUpperCase(), textX, top + 4, { width: tw, align: 'center' });
    if (s.lab.tagline) doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(10.5).text(s.lab.tagline, textX, doc.y + 1, { width: tw, align: 'center' });
    const contact = [s.lab.address, s.lab.phone && `Ph# ${s.lab.phone}`].filter(Boolean).join('. ');
    if (contact) doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(contact, textX, doc.y + 2, { width: tw, align: 'center' });
    let y = Math.max(doc.y + 4, top + 74);
    doc.fillColor(COLORS.ink).font('Times-Bold').fontSize(11.5).text(`CLINICAL LABORATORY REPORT${report.status !== 'final' ? `  (${report.status.toUpperCase()})` : ''}`, left, y, { width, align: 'center' });
    y = doc.y + 2;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1.4).strokeColor(COLORS.line).stroke();

    // Patient block
    const rowsL: Array<[string, string]> = [
      ['Patient Name', s.patient.name],
      ...(s.patient.guardian ? [['Father/Husband', s.patient.guardian] as [string, string]] : []),
      ['Address', s.patient.address ?? '-'],
      ['Age & Gender', `${s.patient.age ?? '-'} ${cap(s.patient.gender)}`],
      ['MR No.', s.patient.mrNumber],
      ['Referred By', s.doctorName ?? 'Self'],
    ];
    const rowsR: Array<[string, string]> = [
      ['Lab No. #', s.orderNumber],
      ['Sample Date & Time', fmt(s.samples[0]?.collectedAt ?? s.registeredAt)],
      ['Report Date & Time', fmt(report.generatedAt)],
    ];
    const blockTop = y + 6;
    const rowH = 13;
    const half = width / 2;
    rowsL.forEach(([k, v], i) => {
      const yy = blockTop + i * rowH;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(k, left, yy, { width: 80 });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(`:- ${v}`, left + 82, yy, { width: half - 92, height: 12, ellipsis: true });
    });
    rowsR.forEach(([k, v], i) => {
      const yy = blockTop + i * rowH;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(k, left + half + 10, yy, { width: 96 });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(`:- ${v}`, left + half + 108, yy, { width: half - 110, height: 12, ellipsis: true });
    });
    doc.image(qr, left + width - 44, blockTop + rowsR.length * rowH + 2, { width: 44 });
    const blockBottom = Math.max(blockTop + rowsL.length * rowH, blockTop + rowsR.length * rowH + 48) + 2;
    doc.moveTo(left, blockBottom).lineTo(left + width, blockBottom).lineWidth(1.4).strokeColor(COLORS.line).stroke();
    doc.y = blockBottom + 6;
  };

  const columnBand = () => {
    const y = doc.y;
    doc.rect(left, y, width, 16).fillColor(COLORS.band).fill();
    doc.moveTo(left, y).lineTo(left + width, y).moveTo(left, y + 16).lineTo(left + width, y + 16).lineWidth(1).strokeColor(COLORS.line).stroke();
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5);
    ['TEST NAME', 'RESULT', 'UNITS', 'NORMAL VALUE'].forEach((label, i) => doc.text(label, colX[i], y + 4, { width: colW[i] }));
    doc.y = y + 20;
  };

  let department = '';
  const ensure = (needed: number) => {
    if (doc.y + needed > bottomLimit()) {
      doc.addPage();
      header();
      if (department) {
        doc.fillColor(COLORS.ink).font('Times-Bold').fontSize(11.5).text(`${department.toUpperCase()} (continued)`, left, doc.y, { width, align: 'center' });
        doc.moveDown(0.2);
        columnBand();
      }
    }
  };

  header();

  const tests = [...s.tests].sort((a, b) => a.category.localeCompare(b.category));
  for (const t of tests) {
    if (t.category !== department) {
      department = t.category;
      ensure(70);
      doc.fillColor(COLORS.ink).font('Times-Bold').fontSize(12).text(department.toUpperCase(), left, doc.y + 2, { width, align: 'center' });
      doc.moveDown(0.2);
      columnBand();
    }
    ensure(34);
    // Test name band
    const ty = doc.y;
    doc.rect(left + 4, ty - 1, width - 8, 13).fillColor(COLORS.soft).fill();
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.8).text(`${t.testName.toUpperCase()}${t.amended ? '   (AMENDED)' : ''}`, colX[0], ty + 1, { width: width - 30 });
    doc.y = ty + 15;
    if (t.status === 'pending') {
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8.5).text('Result pending - will be issued after verification.', colX[0], doc.y);
      doc.moveDown(0.6);
      continue;
    }
    for (const v of t.values) {
      const name = (v.parameterName === 'Result' ? t.testName : v.parameterName).toUpperCase();
      const rowH = Math.max(12, doc.heightOfString(v.range || '-', { width: colW[3] }) + 2, doc.heightOfString(name, { width: colW[0] }) + 2);
      ensure(rowH + 2);
      const y = doc.y;
      const flag = FLAG_LABEL[v.flag];
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8.8).text(name, colX[0], y, { width: colW[0] });
      doc.fillColor(flag ? (v.flag.includes('low') ? COLORS.low : COLORS.high) : COLORS.ink).font(flag ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.8)
        .text(flag ? `${v.value}  ${flag}` : v.value, colX[1], y, { width: colW[1] });
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8.8).text(v.unit ?? '', colX[2], y, { width: colW[2] });
      doc.fillColor(v.range ? COLORS.ink : COLORS.muted).text(v.range || '-', colX[3], y, { width: colW[3] });
      doc.y = y + rowH;
    }
    if (t.comment) {
      ensure(20);
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8.3).text(`Comment: ${t.comment}`, colX[0], doc.y + 1, { width: width - 30 });
    }
    if (t.amended && t.amendmentReason) doc.fillColor(COLORS.low).font('Helvetica').fontSize(7.8).text(`Amended - reason: ${t.amendmentReason}`, colX[0], doc.y + 1, { width: width - 30 });
    doc.moveDown(0.5);
  }

  // Footer + watermark on every page
  const staff = s.lab.signatories?.length ? s.lab.signatories.slice(0, 4) : [{ name: s.verifiedBy.join(', ') || '-' } as { name: string; qualification?: string }];
  const printedAt = fmt(new Date().toISOString());
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // footer sits inside the bottom margin; don't let PDFKit add pages
    if (report.status === 'interim' || report.status === 'superseded') {
      doc.save().rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.fillColor(report.status === 'superseded' ? COLORS.high : COLORS.muted).opacity(0.08).font('Helvetica-Bold').fontSize(80)
        .text(report.status.toUpperCase(), 0, doc.page.height / 2 - 40, { width: doc.page.width, align: 'center', lineBreak: false });
      doc.restore().opacity(1);
    }
    let fy = doc.page.height - FOOTER_H;
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5).text('Electronically verified, no signature(s) required.', left, fy, { width, align: 'center', lineBreak: false });
    fy += 12;
    doc.moveTo(left, fy).lineTo(left + width, fy).lineWidth(1.2).strokeColor(COLORS.line).stroke();
    const slot = width / staff.length;
    staff.forEach((p, k) => {
      const align = staff.length === 1 ? 'left' : k === 0 ? 'left' : k === staff.length - 1 ? 'right' : 'center';
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(p.name, left + k * slot, fy + 4, { width: slot, align, lineBreak: false });
      if (p.qualification) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(p.qualification, left + k * slot, fy + 15, { width: slot, align, lineBreak: false });
    });
    fy += 30;
    doc.moveTo(left, fy).lineTo(left + width, fy).lineWidth(1.2).strokeColor(COLORS.line).stroke();
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(7.8).text('Proviso: ', left, fy + 4, { continued: true })
      .font('Helvetica').text(s.lab.reportFooter || DEFAULT_PROVISO, { width, height: 22, ellipsis: true });
    fy += 30;
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
      .text(`Print Date & Time: ${printedAt}`, left, fy, { width: 150, lineBreak: false })
      .text(`Report No. ${report.reportNumber}${s.lab.phone ? `  -  For any query please contact: ${s.lab.phone}` : `  -  Thank you for choosing ${s.lab.name}`}`, left + 150, fy, { width: width - 240, align: 'center', lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, left + width - 80, fy, { width: 80, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
