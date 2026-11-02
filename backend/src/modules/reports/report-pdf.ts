import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { ReportDoc, ResultFlag } from '../../common/entities';

const COLORS = { ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', brand: '#0e7490', high: '#b91c1c', low: '#1d4ed8', soft: '#f1f5f9' };
// Standard PDF fonts are WinAnsi-encoded: keep labels ASCII.
const FLAG_LABEL: Partial<Record<ResultFlag, string>> = { high: 'H', low: 'L', critical_high: 'HH !', critical_low: 'LL !', abnormal: 'A' };

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

/**
 * Renders an A4 report from the immutable snapshot. Header repeats on every page,
 * rows never split across pages, and the footer carries page numbers, the
 * verification code and QR code.
 */
export async function renderReportPdf(report: ReportDoc, verifyUrl: string, logo?: Buffer): Promise<Buffer> {
  const s = report.snapshot;
  const qr = await QRCode.toBuffer(`${verifyUrl}/${report.verificationCode}`, { margin: 0, width: 140 });
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 70, left: 40, right: 40 }, bufferPages: true, info: { Title: `Report ${report.reportNumber}`, Author: s.lab.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 10;

  const header = () => {
    const top = 30;
    // Logo (contains the laboratory name) on the left; verification QR on the right.
    let textX = left;
    if (logo) {
      try {
        doc.image(logo, left, top, { fit: [78, 74] });
        textX = left + 90;
      } catch {
        /* unreadable logo: fall back to text-only header */
      }
    }
    if (!logo) doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(17).text(s.lab.name, textX, top, { width: width - 170 });
    doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(13).text('LABORATORY REPORT', textX, top + (logo ? 14 : 22), { width: width - 170 - (textX - left) });
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8.5).text(s.lab.tagline, textX, doc.y + 1, { width: width - 170 - (textX - left) });
    doc.font('Helvetica').fontSize(7.5).text([s.lab.address, s.lab.phone, s.lab.email].filter(Boolean).join('  •  '), textX, doc.y + 2, { width: width - 170 - (textX - left) });
    doc.image(qr, left + width - 58, top, { width: 58 });
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.5).text('SCAN TO VERIFY', left + width - 78, top + 61, { width: 78, align: 'center' });
    const y = top + 78;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1.2).strokeColor(COLORS.brand).stroke();
    doc.y = y + 7;

    // Patient block (two columns, like the laboratory's reference layout)
    const gender = `${s.patient.gender[0].toUpperCase()}${s.patient.gender.slice(1)}`;
    const leftRows: Array<[string, string]> = [
      ['Patient No.', s.patient.mrNumber],
      ['Patient Name', s.patient.name],
      ['Father/Husband', s.patient.guardian ?? '—'],
      ['Age / Gender', `${s.patient.age ?? '—'} / ${gender}`],
      ['Phone', s.patient.mobile ?? '—'],
    ];
    const rightRows: Array<[string, string]> = [
      ['Lab No.', s.orderNumber],
      ['Advised by', s.doctorName ?? 'Self'],
      ['Registered at', s.centre ?? s.lab.name],
      ['Registered on', fmt(s.registeredAt ?? s.samples[0]?.collectedAt)],
      ['Reported on', `${fmt(report.generatedAt)}  (${report.status.toUpperCase()})`],
    ];
    const blockTop = doc.y;
    const rowH = 13.5;
    doc.rect(left, blockTop, width, leftRows.length * rowH + 8).fillColor(COLORS.soft).fill();
    const half = width / 2;
    leftRows.forEach(([k, v], i) => {
      const y2 = blockTop + 5 + i * rowH;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(k, left + 8, y2, { width: 72 });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5).text(v, left + 84, y2, { width: half - 92, height: 12, ellipsis: true });
    });
    rightRows.forEach(([k, v], i) => {
      const y2 = blockTop + 5 + i * rowH;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(k, left + half + 8, y2, { width: 68 });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5).text(v, left + half + 80, y2, { width: half - 88, height: 12, ellipsis: true });
    });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(`Report ${report.reportNumber}  v${report.version}  •  Sample(s): ${s.samples.map((x) => `${x.sampleNumber} ${x.sampleType}`).join(', ')}`, left + 8, blockTop + leftRows.length * rowH + 10, { width: width - 16, height: 10, ellipsis: true });
    doc.y = blockTop + leftRows.length * rowH + 26;
  };

  const cols = [
    { label: 'Parameter', w: 0.34 },
    { label: 'Result', w: 0.16 },
    { label: 'Flag', w: 0.08 },
    { label: 'Unit', w: 0.14 },
    { label: 'Reference range', w: 0.28 },
  ];
  const tableHeader = () => {
    const y = doc.y;
    doc.rect(left, y, width, 16).fillColor(COLORS.ink).fill();
    let x = left + 6;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    cols.forEach((c) => {
      doc.text(c.label, x, y + 4, { width: c.w * width - 8 });
      x += c.w * width;
    });
    doc.y = y + 20;
  };

  let currentTest = '';
  const ensure = (needed: number, repeatTableHeader = false) => {
    if (doc.y + needed > bottomLimit()) {
      doc.addPage();
      header();
      if (repeatTableHeader) {
        doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(10.5).text(`${currentTest.toUpperCase()} (continued)`, left, doc.y);
        doc.moveDown(0.3);
        tableHeader();
      }
    }
  };

  header();

  // Group by department (category), as on the laboratory's printed reports.
  const tests = [...s.tests].sort((a, b) => a.category.localeCompare(b.category));
  let department = '';
  for (const t of tests) {
    currentTest = t.testName;
    if (t.category !== department) {
      department = t.category;
      ensure(80);
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12).text(`DEPARTMENT OF ${department.toUpperCase()}`, left, doc.y + 2);
      const ly = doc.y + 2;
      doc.moveTo(left, ly).lineTo(left + width, ly).lineWidth(0.6).strokeColor(COLORS.ink).stroke();
      doc.y = ly + 6;
    }
    ensure(60);
    doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(10.5).text(t.testName.toUpperCase(), left, doc.y, { continued: true });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`   ${t.category}${t.amended ? '   • AMENDED' : ''}`);
    doc.moveDown(0.3);
    if (t.status === 'pending') {
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(9).text('Result pending — will be issued after verification.', left + 6);
      doc.moveDown(0.8);
      continue;
    }
    tableHeader();
    t.values.forEach((v, idx) => {
      const flag = FLAG_LABEL[v.flag] ?? '';
      const abnormal = flag !== '';
      const rowH = Math.max(14, doc.heightOfString(v.range || '—', { width: cols[4].w * width - 8 }) + 4);
      ensure(rowH + 2, true);
      const y = doc.y;
      if (idx % 2 === 1) doc.rect(left, y - 2, width, rowH).fillColor('#f8fafc').fill();
      let x = left + 6;
      const cells = [v.parameterName, v.value, flag, v.unit ?? '', v.range || 'Not established'];
      cells.forEach((cell, i) => {
        const isResult = i === 1 || i === 2;
        doc
          .font(isResult && abnormal ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8.5)
          .fillColor(isResult && abnormal ? (v.flag.includes('low') ? COLORS.low : COLORS.high) : i === 4 && !v.range ? COLORS.muted : COLORS.ink)
          .text(cell, x, y, { width: cols[i].w * width - 8 });
        x += cols[i].w * width;
      });
      doc.y = y + rowH;
    });
    if (t.comment) {
      ensure(24);
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8).text(`Comment: ${t.comment}`, left + 6, doc.y + 2, { width: width - 12 });
    }
    if (t.amended && t.amendmentReason) {
      doc.fillColor(COLORS.high).font('Helvetica').fontSize(7.5).text(`Amended report — reason: ${t.amendmentReason}`, left + 6, doc.y + 2, { width: width - 12 });
    }
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(`Verified by ${t.approvedBy ?? '—'} on ${fmt(t.approvedAt)}`, left + 6, doc.y + 3);
    doc.moveDown(1);
  }

  // Approval block
  ensure(50);
  doc.moveDown(1);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`Performed by: ${s.technicians.join(', ') || '—'}`, left, doc.y, { width: width / 2 });
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(`Approved by: ${s.verifiedBy.join(', ') || '—'}`, left + width / 2, doc.y - 10, { width: width / 2, align: 'right' });

  // Footer + watermark on every page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Footer sits inside the bottom margin; lift the margin so PDFKit doesn't auto-add pages.
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 58;
    if (report.status === 'interim' || report.status === 'superseded') {
      doc.save().rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.fillColor(report.status === 'superseded' ? COLORS.high : COLORS.muted).opacity(0.08).font('Helvetica-Bold').fontSize(80)
        .text(report.status.toUpperCase(), 0, doc.page.height / 2 - 40, { width: doc.page.width, align: 'center', lineBreak: false });
      doc.restore().opacity(1);
    }
    doc.rect(left, fy, width, 13).fillColor('#e2e8f0').fill();
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(7.5)
      .text('Electronically verified report. Results should be interpreted by a qualified clinician in the clinical context.', left, fy + 3, { width, align: 'center', lineBreak: false });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
      .text(s.lab.reportFooter ?? 'This report relates only to the sample(s) received.', left, fy + 17, { width: width - 90, height: 18, ellipsis: true })
      .text(`Verify: ${verifyUrl}/${report.verificationCode}  •  Code ${report.verificationCode}`, left, fy + 36, { width: width - 90, lineBreak: false });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(7.5)
      .text([s.lab.address, s.lab.phone].filter(Boolean).join('  •  ') || s.lab.name, left, fy + 46, { width: width - 90, lineBreak: false });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(`Page ${i + 1} of ${range.count}`, left + width - 80, fy + 46, { width: 80, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
