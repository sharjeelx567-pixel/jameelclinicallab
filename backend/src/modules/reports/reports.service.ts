import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OrderDoc, PatientDoc, ReportDoc, ReportSnapshot, ResultDoc, SampleDoc, TestCategoryDoc, TestDoc } from '../../common/entities';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { getEnv } from '../../config/env';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { pad, reserveSequences, verificationCode, yearCode } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { transformUrl } from '../media/media-provider';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../settings/storage.service';
import { formatRange } from '../tests/reference-range';
import { renderReportPdf } from './report-pdf';

let cachedLogo: Buffer | null | undefined;
/** Read once; works from src (ts-node) and dist, and on Vercel via vercel.json includeFiles. */
function bundledLogo(): Buffer | undefined {
  if (cachedLogo === undefined) {
    const file = join(__dirname, '../../../assets/jcl-logo.png');
    cachedLogo = existsSync(file) ? readFileSync(file) : null;
  }
  return cachedLogo ?? undefined;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Generates a new report version from APPROVED results only. Unapproved tests
   * appear as "pending" (interim report); a final report requires every test to
   * be approved. The snapshot is immutable, so reprints are identical.
   */
  async generate(orderId: string, actor: AuthUser): Promise<ReportDoc> {
    const [settings, categories] = await Promise.all([
      this.settings.get(),
      this.store.query<TestCategoryDoc>(C.testCategories, {}),
    ]);
    const catName = new Map(categories.items.map((c) => [c.id, c.name]));

    const report = await this.store.transaction(async (tx) => {
      const order = await tx.get<OrderDoc>(C.orders, orderId);
      if (!order) throw notFound('Order');
      if (order.status === 'cancelled') throw unprocessable('ORDER_CANCELLED', 'Cannot issue a report for a cancelled order');
      const byOrder: WhereClause[] = [{ field: 'orderId', op: '==', value: orderId }];
      const results = await tx.query<ResultDoc>(C.results, { where: byOrder });
      const approved = results.filter((r) => r.status === 'approved');
      if (!approved.length) throw unprocessable('NO_APPROVED_RESULTS', 'No verified results yet — a report cannot be generated from unverified results');
      const samples = await tx.query<SampleDoc>(C.samples, { where: byOrder });
      const previous = await tx.query<ReportDoc>(C.reports, { where: byOrder });
      const patient = await tx.get<PatientDoc>(C.patients, order.patientId);
      if (!patient) throw notFound('Patient');
      const tests = new Map<string, TestDoc>();
      for (const r of results) {
        const t = await tx.get<TestDoc>(C.tests, r.testId);
        if (t) tests.set(t.id, t);
      }
      const seq = await reserveSequences(tx, { report: 1 });

      const now = this.store.now();
      const allApproved = approved.length === results.length;
      const hasAmendment = approved.some((r) => r.version > 1);
      if (allApproved && previous.some((p) => p.status === 'final' || p.status === 'amended'))
        throw conflict('REPORT_ALREADY_ISSUED', 'A current report already exists for this order. Reprint it instead.');
      const version = previous.length + 1;
      const id = this.store.newId();

      const snapshot: ReportSnapshot = {
        lab: { name: settings.name, tagline: settings.tagline, address: settings.address, phone: settings.phone, email: settings.email, reportFooter: settings.reportFooter },
        patient: {
          name: patient.name,
          mrNumber: patient.mrNumber,
          age: patient.ageYears !== undefined ? `${patient.ageYears} Y` : undefined,
          gender: patient.gender,
          ...(patient.guardianName ? { guardian: `${patient.guardianName}${patient.guardianRelation && patient.guardianRelation !== 'other' ? ` (${patient.guardianRelation})` : ''}` } : {}),
          mobile: patient.mobile,
        },
        doctorName: order.doctorName,
        orderNumber: order.orderNumber,
        centre: settings.collectionCenters.find((c) => c.id === patient.collectionCenterId)?.name ?? settings.branches.find((b) => b.id === patient.branchId)?.name,
        registeredAt: order.createdAt,
        samples: samples.filter((s) => s.status !== 'rejected').map((s) => ({ sampleNumber: s.sampleNumber, sampleType: s.sampleType, collectedAt: s.collectedAt })),
        tests: order.items.map((item) => {
          const r = results.find((x) => x.id === item.resultId);
          const t = tests.get(item.testId);
          const category = t ? (catName.get(t.categoryId) ?? '') : '';
          if (!r || r.status !== 'approved')
            return { resultId: item.resultId, testName: item.testName, testCode: item.testCode, category, status: 'pending' as const, values: [] };
          const order2 = new Map(t?.parameters.map((p) => [p.id, p.sortOrder]) ?? []);
          return {
            resultId: r.id,
            testName: r.testName,
            testCode: r.testCode,
            category,
            status: 'approved' as const,
            resultVersion: r.version,
            values: [...r.values]
              .sort((a, b) => (order2.get(a.parameterId) ?? 0) - (order2.get(b.parameterId) ?? 0))
              .map((v) => ({ parameterName: v.parameterName, value: v.value, unit: v.unit, range: formatRange(v.referenceRange), flag: v.flag })),
            comment: r.approverComment,
            approvedBy: r.approvedBy?.name,
            approvedAt: r.approvedAt,
            amended: r.version > 1,
            amendmentReason: r.amendment?.reason,
          };
        }),
        verifiedBy: [...new Set(approved.map((r) => r.approvedBy?.name).filter((n): n is string => !!n))],
        technicians: [...new Set(approved.map((r) => r.enteredBy?.name).filter((n): n is string => !!n))],
      };

      const doc: ReportDoc = {
        id,
        reportNumber: `RPT-${yearCode(now)}${pad(seq.report[0], 6)}`,
        orderId,
        patientId: order.patientId,
        version,
        status: !allApproved ? 'interim' : hasAmendment ? 'amended' : 'final',
        snapshot,
        verificationCode: verificationCode(),
        generatedBy: toActor(actor),
        generatedAt: now,
        printCount: 0,
      };
      tx.create(C.reports, id, doc);
      for (const p of previous.filter((p) => p.status !== 'superseded')) tx.update(C.reports, p.id, { status: 'superseded', supersededBy: id });
      this.audit.recordInTx(tx, { action: 'report.generate', entity: 'report', entityId: id, actor: toActor(actor), changes: { orderId, version, status: doc.status } });
      return doc;
    });
    return report;
  }

  async list(filters: { patientId?: string; orderId?: string; status?: string }, limit: number, cursor?: string) {
    const where: WhereClause[] = [];
    if (filters.patientId) where.push({ field: 'patientId', op: '==', value: filters.patientId });
    if (filters.orderId) where.push({ field: 'orderId', op: '==', value: filters.orderId });
    if (filters.status) where.push({ field: 'status', op: '==', value: filters.status });
    const res = await this.store.query<ReportDoc>(C.reports, { where, orderBy: { field: 'generatedAt', direction: 'desc' }, limit, cursor });
    return {
      ...res,
      items: res.items.map(({ snapshot, ...r }) => ({ ...r, patientName: snapshot.patient.name, mrNumber: snapshot.patient.mrNumber, orderNumber: snapshot.orderNumber, testCount: snapshot.tests.length })),
    };
  }

  async get(id: string): Promise<ReportDoc> {
    const r = await this.store.get<ReportDoc>(C.reports, id);
    if (!r) throw notFound('Report');
    return r;
  }

  async prints(id: string) {
    return (await this.store.query(C.reportPrints, { where: [{ field: 'reportId', op: '==', value: id }], orderBy: { field: 'at', direction: 'desc' } })).items;
  }

  /** Records every print / download — the "reprint history". */
  async recordPrint(id: string, channel: 'pdf' | 'browser', actor: AuthUser): Promise<ReportDoc> {
    const report = await this.store.transaction(async (tx) => {
      const r = await tx.get<ReportDoc>(C.reports, id);
      if (!r) throw notFound('Report');
      const printId = this.store.newId();
      tx.update(C.reports, id, { printCount: r.printCount + 1 });
      tx.create(C.reportPrints, printId, { id: printId, reportId: id, channel, by: toActor(actor), at: this.store.now(), copy: r.printCount + 1 });
      this.audit.recordInTx(tx, { action: r.printCount ? 'report.reprint' : 'report.print', entity: 'report', entityId: id, actor: toActor(actor), changes: { channel, copy: r.printCount + 1 } });
      return r;
    });
    return report;
  }

  async pdf(id: string, actor: AuthUser): Promise<{ buffer: Buffer; filename: string }> {
    const report = await this.recordPrint(id, 'pdf', actor);
    const settings = await this.settings.get();
    let logo: Buffer | undefined;
    try {
      if (settings.logo) {
        // PDFKit embeds PNG/JPEG only, so ask Cloudinary for a PNG at print size.
        const res = await fetch(transformUrl(settings.logo.secureUrl, 'f_png,w_600,c_limit'), { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        logo = Buffer.from(await res.arrayBuffer());
      } else if (settings.logoPath) logo = await this.storage.download(settings.logoPath);
    } catch (err) {
      this.logger.warn(`Logo unavailable for report PDF: ${(err as Error).message}`);
    }
    // Default: the laboratory logo shipped with the app (backend/assets/jcl-logo.png).
    logo ??= bundledLogo();
    const buffer = await renderReportPdf(report, getEnv().REPORT_VERIFY_BASE_URL, logo);
    return { buffer, filename: `${report.reportNumber}-v${report.version}.pdf` };
  }

  /** Public verification. Returns only what is needed to confirm authenticity — no results. */
  async verify(code: string) {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    const res = await this.store.query<ReportDoc>(C.reports, { where: [{ field: 'verificationCode', op: '==', value: clean }], limit: 1 });
    const r = res.items[0];
    if (!r) return { valid: false as const };
    const initials = r.snapshot.patient.name.split(/\s+/).map((w) => `${w[0]}.`).join(' ');
    return {
      valid: true as const,
      laboratory: r.snapshot.lab.name,
      reportNumber: r.reportNumber,
      version: r.version,
      status: r.status,
      generatedAt: r.generatedAt,
      patientInitials: initials,
      mrNumberMasked: r.snapshot.patient.mrNumber.replace(/.(?=.{3})/g, '•'),
      current: r.status !== 'superseded',
    };
  }
}
