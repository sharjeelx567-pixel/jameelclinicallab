import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { ReportDoc, ResultFlag } from '../../common/entities';

// Print-safe: solid black ink; "muted" is near-black (grey halftones print faint on laser printers).
const COLORS = { ink: '#000000', muted: '#1f1f1f', line: '#000000', band: '#e2e8f0', soft: '#f1f5f9', green: '#14532d', high: '#b91c1c', low: '#1d4ed8' };
// Standard PDF fonts are WinAnsi-encoded: keep labels ASCII.
const FLAG_LABEL: Partial<Record<ResultFlag, string>> = { high: 'H', low: 'L', critical_high: 'HH !', critical_low: 'LL !', abnormal: 'A' };
const DEFAULT_PROVISO = 'This report relates only to the sample(s) received. Results should be interpreted by a qualified clinician in the clinical context.';

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';
/** Lab abbreviations kept in capitals when a name typed in ALL CAPS is changed to normal case. */
const ABBREVIATIONS = new Set(['ESR', 'HIV', 'HCV', 'HBV', 'HBSAG', 'HAV', 'HEV', 'ALT', 'AST', 'ALP', 'GGT', 'HDL', 'LDL', 'VLDL', 'TSH', 'FT3', 'FT4', 'PCV', 'HCT', 'MPV', 'PDW', 'PCT', 'RDW', 'NRBC', 'CRP', 'ASO', 'RA', 'INR', 'PT', 'APTT', 'LFT', 'RFT', 'ANA', 'IGG', 'IGM', 'IGE', 'ABO', 'RH', 'BUN', 'AFB', 'HPF', 'LPF', 'RBC', 'RBCS', 'WBC', 'WBCS', 'TLC', 'DLC', 'PSA', 'CEA', 'AFP', 'LH', 'FSH', 'HCG', 'ICT', 'CBC', 'CSF', 'PH', 'SGPT', 'SGOT', 'CPK', 'LDH', 'TIBC', 'UIBC', 'G6PD', 'HB', 'HBA1C', 'MCV', 'MCH', 'MCHC', 'VDRL', 'TPHA', 'ELISA', 'PCR', 'DNA', 'RNA', 'TB', 'CV', 'SD', 'RDW-CV', 'RDW-SD']);
/**
 * Parameter names as written; a name typed in ALL CAPITALS is shown as "Each Word Capitalised",
 * except lab abbreviations (MCHC, VDRL, HBsAg-style codes, anything with a digit or no vowel).
 */
const niceName = (s: string) =>
  s.length > 3 && s === s.toUpperCase() && /[A-Z]/.test(s)
    ? s.replace(/[A-Z0-9]+/g, (w) => (ABBREVIATIONS.has(w) || /\d/.test(w) || !/[AEIOU]/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    : s;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * A4 report from the immutable snapshot, in the classic laboratory layout:
 * letterhead, two-column patient block, department band, TEST NAME / RESULT /
 * UNITS / NORMAL VALUE table, and a footer on every page with staff names,
 * proviso, print date and page numbers. Matches the on-screen/printed report.
 */
export async function renderReportPdf(
  report: ReportDoc,
  verifyUrl: string,
  logo?: Buffer,
  /** Current letterhead settings, used when the report was generated before they were set. */
  current: { signatories?: Array<{ name: string; qualification?: string }>; phone?: string; address?: string; logoIsRound?: boolean } = {},
): Promise<Buffer> {
  const s = { ...report.snapshot, lab: { ...report.snapshot.lab, phone: report.snapshot.lab.phone || current.phone || '', address: report.snapshot.lab.address || current.address || '' } };
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
        // Round logo: white disc, image clipped to the circle, thin grey ring.
        const r = 35;
        const cx = left + r;
        const cy = top + r;
        // A pre-made round logo fills the circle; any other image fits inside it whole.
        const inner = current.logoIsRound ? r : r * 0.7;
        doc.save();
        doc.circle(cx, cy, r).fill('#ffffff');
        doc.circle(cx, cy, r).clip();
        doc.image(logo, cx - inner, cy - inner, { fit: [inner * 2, inner * 2], align: 'center', valign: 'center' });
        doc.restore();
        doc.circle(cx, cy, r).lineWidth(0.8).strokeColor('#cbd5e1').stroke();
        textX = left + 84;
      } catch {
        /* unreadable logo: text-only letterhead */
      }
    }
    const tw = width - (textX - left);
    // Lab name on ONE line, as large as fits, letters spaced out to fill the letterhead width.
    const name = s.lab.name.toUpperCase();
    let size = 24;
    doc.font('Times-Bold').fontSize(size);
    while (size > 12 && doc.widthOfString(name) > tw) doc.fontSize(--size);
    const spacing = name.length > 1 ? Math.min(6, Math.max(0, (tw - doc.widthOfString(name) - 2) / (name.length - 1))) : 0;
    doc.fillColor(COLORS.ink).text(name, textX, top + 4, { width: tw + spacing, align: 'center', characterSpacing: spacing, lineBreak: false });
    doc.y = top + 4 + size * 0.98;
    if (s.lab.tagline) doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(10.5).text(s.lab.tagline, textX, doc.y + 1, { width: tw, align: 'center' });
    // Address only: the phone number is not printed in the report header.
    if (s.lab.address) doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(s.lab.address, textX, doc.y + 2, { width: tw, align: 'center' });
    let y = Math.max(doc.y + 4, top + 74);
    doc.fillColor(COLORS.ink).font('Times-Bold').fontSize(11.5).text(`CLINICAL LABORATORY REPORT${report.status === 'interim' || report.status === 'superseded' ? `  (${report.status.toUpperCase()})` : ''}`, left, y, { width, align: 'center' });
    y = doc.y + 2;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1.4).strokeColor(COLORS.line).stroke();

    // Patient block
    const rowsL: Array<[string, string]> = [
      ['Patient Name', s.patient.name],
      ...(s.patient.guardian ? [['Father/Husband', s.patient.guardian] as [string, string]] : []),
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
    // Long values (e.g. a long patient name) wrap onto more lines instead of being cut off.
    const drawRows = (rows: string[][], labelX: number, labelW: number, valueX: number, valueW: number) => {
      let yy = blockTop;
      for (const [k, v] of rows) {
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(k, labelX, yy, { width: labelW });
        const value = `: ${v}`;
        doc.font('Helvetica-Bold').fontSize(9);
        const h = Math.min(doc.heightOfString(value, { width: valueW }), 36);
        doc.fillColor(COLORS.ink).text(value, valueX, yy, { width: valueW, height: h + 1, ellipsis: true });
        yy += Math.max(rowH, h + 2);
      }
      return yy;
    };
    const leftEnd = drawRows(rowsL, left, 80, left + 82, half - 92);
    const rightEnd = drawRows(rowsR, left + half + 10, 96, left + half + 108, half - 110);
    doc.image(qr, left + width - 44, rightEnd + 2, { width: 44 });
    const blockBottom = Math.max(leftEnd, rightEnd + 48) + 2;
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

  // Haematology always comes first on the report, then the other departments A–Z.
  const deptRank = (c: string) => (/^ha?ematology/i.test(c.trim()) ? 0 : 1);
  const tests = [...s.tests].sort((a, b) => deptRank(a.category) - deptRank(b.category) || a.category.localeCompare(b.category));
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
    doc.rect(left + 4, ty - 1, width - 8, 13).fillColor(COLORS.band).fill();
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.8).text(t.testName.toUpperCase(), colX[0], ty + 1, { width: width - 30 });
    doc.y = ty + 15;
    if (t.status === 'pending') {
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8.5).text('Result pending - will be issued after verification.', colX[0], doc.y);
      doc.moveDown(0.6);
      continue;
    }
    let section = '';
    for (const v of t.values) {
      if (v.section && v.section !== section) {
        ensure(30);
        const sy = doc.y + 2;
        doc.rect(colX[0] - 2, sy - 1, colW[0] + colW[1] * 0.6, 12).fillColor('#cbd5e1').fill();
        doc.rect(colX[0] - 2, sy - 1, 2.5, 12).fillColor(COLORS.ink).fill();
        doc.fillColor(COLORS.ink).font('Helvetica-BoldOblique').fontSize(8.6).text(v.section.toUpperCase(), colX[0] + 3, sy + 1, { width: colW[0] + colW[1] * 0.6 - 7, lineBreak: false });
        doc.y = sy + 14;
      }
      section = v.section ?? '';
      const name = niceName(v.parameterName === 'Result' ? t.testName : v.parameterName);
      // Rows get breathing space (about 5 pt between lines) so values are easy to read on paper.
      const rowH = Math.max(17, doc.heightOfString(v.range || '-', { width: colW[3] }) + 7, doc.heightOfString(name, { width: colW[0] }) + 7);
      ensure(rowH + 2);
      const top = doc.y;
      const y = top + 3.5;
      const flag = FLAG_LABEL[v.flag];
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9).text(name, colX[0], y, { width: colW[0] });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9.3)
        .text(flag ? `${v.value}  ${flag}` : v.value, colX[1], y, { width: colW[1] });
      // The built-in PDF font has ¹ ² ³ but no other superscript digits (×10⁶ would print as "×10 v").
      const unit = (v.unit ?? '').replace(/[⁰⁴⁵⁶⁷⁸⁹]/g, (c) => `^${'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)}`);
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9).text(unit, colX[2], y, { width: colW[2] });
      doc.fillColor(v.range ? COLORS.ink : COLORS.muted).text(v.range || '-', colX[3], y, { width: colW[3] });
      doc.y = top + rowH;
    }
    if (t.comment) {
      ensure(20);
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8.3).text(`Comment: ${t.comment}`, colX[0], doc.y + 1, { width: width - 30 });
    }
    doc.moveDown(0.5);
  }

  // Footer + watermark on every page
  // Footer names: as set in Settings; otherwise the people on record (approver, then the technologist who entered results).
  const staff: Array<{ name: string; qualification?: string }> = (s.lab.signatories?.length
    ? s.lab.signatories
    : current.signatories?.length
      ? current.signatories
      : [...new Set([...s.verifiedBy, ...s.technicians])].filter(Boolean).map((name) => ({ name }))
  ).slice(0, 4);
  if (!staff.length) staff.push({ name: '-' });
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
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5).text('Electronically verified, no signature(s) required.', left, fy, { width: width / 2, lineBreak: false });
    doc.text('Not valid for any court', left + width / 2, fy, { width: width / 2, align: 'right', lineBreak: false });
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
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
      .text(`Print Date & Time: ${printedAt}`, left, fy, { width: 150, lineBreak: false })
      .text(`Report No. ${report.reportNumber}${s.lab.phone ? `  -  For any query please contact: ${s.lab.phone}` : `  -  Thank you for choosing ${s.lab.name}`}`, left + 150, fy, { width: width - 240, align: 'center', lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, left + width - 80, fy, { width: 80, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
