import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AnalyzerDoc, AnalyzerMessageDoc, OrderDoc, SampleDoc, TestDoc } from '../../common/entities';
import { badRequest, notFound, unprocessable } from '../../common/errors';
import { AuditActor, AuthUser, toActor } from '../../common/types';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { diff, optionalText, paginationQuery, requiredText, sha256 } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyzerValueInput, ResultsService } from '../results/results.service';

export const AnalyzerDto = z.object({
  name: requiredText(80),
  brand: requiredText(60).default('BIOELAB'),
  model: optionalText(60),
  serialNumber: optionalText(60),
  machineType: requiredText(60),
  connectionType: z.enum(['tcp', 'serial', 'file', 'vendor_api', 'none']).default('none'),
  host: optionalText(100),
  port: z.number().int().min(1).max(65535).optional(),
  serialPort: optionalText(40),
  baudRate: z.number().int().min(300).max(921600).optional(),
  protocol: z.enum(['astm', 'hl7', 'vendor', 'unconfirmed']).default('unconfirmed'),
  mode: z.enum(['live', 'demo']).default('demo'),
  enabled: z.boolean().default(false),
  integrationStatus: z.enum(['pending_documentation', 'configured', 'verified']).default('pending_documentation'),
  bridgeId: optionalText(60),
  notes: optionalText(1000),
});

const BridgeResult = z.object({ analyzerTestCode: z.string().trim().min(1).max(40), value: z.string().trim().max(60), unit: z.string().max(30).optional(), flags: z.string().max(20).optional() });

export const BridgeMessageDto = z.object({
  analyzerId: z.string().max(64),
  raw: z.string().min(1).max(200_000),
  protocol: z.enum(['astm', 'hl7', 'vendor']),
  isDemo: z.boolean(),
  sampleIdentifier: z.string().trim().max(40).optional(),
  results: z.array(BridgeResult).max(200).default([]),
  parseErrors: z.array(z.string().max(300)).max(50).default([]),
});

export const HeartbeatDto = z.object({
  analyzers: z
    .array(z.object({ analyzerId: z.string().max(64), state: z.enum(['connected', 'disconnected', 'error']), mode: z.enum(['live', 'demo']), error: z.string().max(300).optional() }))
    .max(50),
});

export const MessageQuery = paginationQuery.extend({ status: z.string().max(20).optional(), analyzerId: z.string().max(64).optional() });

/** A heartbeat older than this means the link is no longer considered up. */
export const HEARTBEAT_STALE_MS = 2 * 60_000;

const bridgeActor = (bridgeId: string): AuditActor => ({ uid: `bridge:${bridgeId}`, name: `Machine bridge ${bridgeId}`, role: 'bridge' });

@Injectable()
export class AnalyzersService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly results: ResultsService,
  ) {}

  /** Connection state as displayed: stale live heartbeats degrade to "disconnected". */
  private present(a: AnalyzerDoc) {
    const now = Date.now();
    const fresh = a.lastHeartbeatAt && now - Date.parse(a.lastHeartbeatAt) < HEARTBEAT_STALE_MS;
    const demoActive = !!a.lastDemoHeartbeatAt && now - Date.parse(a.lastDemoHeartbeatAt) < HEARTBEAT_STALE_MS;
    const connectionState = a.connectionState === 'connected' && !fresh ? 'disconnected' : a.connectionState;
    return { ...a, connectionState, demoActive };
  }

  async list() {
    return (await this.store.query<AnalyzerDoc>(C.analyzers, { orderBy: { field: 'name' } })).items.map((a) => this.present(a));
  }

  async get(id: string) {
    const a = await this.store.get<AnalyzerDoc>(C.analyzers, id);
    if (!a) throw notFound('Analyzer');
    const [messages, logs] = await Promise.all([
      this.store.query<AnalyzerMessageDoc>(C.analyzerMessages, { where: [{ field: 'analyzerId', op: '==', value: id }], orderBy: { field: 'receivedAt', direction: 'desc' }, limit: 20 }),
      this.store.query(C.auditLogs, { where: [{ field: 'entity', op: '==', value: 'analyzer' }, { field: 'entityId', op: '==', value: id }], orderBy: { field: 'at', direction: 'desc' }, limit: 50 }),
    ]);
    const mappedTests = (await this.store.query<TestDoc>(C.tests, {})).items
      .filter((t) => t.analyzerMappings.some((m) => m.analyzerId === id))
      .map((t) => ({ testId: t.id, testName: t.name, testCode: t.code, mapping: t.analyzerMappings.find((m) => m.analyzerId === id) }));
    return { analyzer: this.present(a), recentMessages: messages.items.map(({ raw, ...m }) => ({ ...m, rawPreview: raw.slice(0, 400) })), activity: logs.items, mappedTests };
  }

  async create(dto: z.infer<typeof AnalyzerDto>, actor: AuthUser) {
    const now = this.store.now();
    const doc: AnalyzerDoc = { ...dto, id: this.store.newId(), connectionState: 'never_connected', createdAt: now, updatedAt: now };
    await this.store.create(C.analyzers, doc.id, doc);
    await this.audit.record({ action: 'analyzer.create', entity: 'analyzer', entityId: doc.id, actor: toActor(actor), changes: { mode: dto.mode, protocol: dto.protocol } });
    return this.present(doc);
  }

  async update(id: string, dto: Partial<z.infer<typeof AnalyzerDto>>, actor: AuthUser) {
    const before = await this.store.get<AnalyzerDoc>(C.analyzers, id);
    if (!before) throw notFound('Analyzer');
    if (dto.integrationStatus === 'verified' && (dto.mode ?? before.mode) !== 'live')
      throw unprocessable('DEMO_CANNOT_BE_VERIFIED', 'Only a live analyzer can be marked as verified');
    if (dto.integrationStatus === 'verified' && (dto.protocol ?? before.protocol) === 'unconfirmed')
      throw unprocessable('PROTOCOL_UNCONFIRMED', 'Confirm the communication protocol from vendor documentation first');
    const next: AnalyzerDoc = { ...before, ...dto, updatedAt: this.store.now() };
    // Switching modes resets observed state: demo heartbeats never count as a live link.
    if (dto.mode && dto.mode !== before.mode) next.connectionState = 'never_connected';
    await this.store.set(C.analyzers, id, next);
    await this.audit.record({ action: 'analyzer.config_change', entity: 'analyzer', entityId: id, actor: toActor(actor), changes: diff(before, next) });
    return this.present(next);
  }

  // ─── Bridge-facing ──

  async heartbeat(bridgeId: string, dto: z.infer<typeof HeartbeatDto>) {
    const now = this.store.now();
    const accepted: string[] = [];
    for (const h of dto.analyzers) {
      const a = await this.store.get<AnalyzerDoc>(C.analyzers, h.analyzerId);
      if (!a || (a.bridgeId && a.bridgeId !== bridgeId)) continue;
      const isDemo = h.mode === 'demo' || a.mode === 'demo';
      if (isDemo) {
        await this.store.update(C.analyzers, a.id, { lastDemoHeartbeatAt: now });
      } else {
        const wasError = a.connectionState === 'error';
        await this.store.update(C.analyzers, a.id, {
          connectionState: h.state,
          lastHeartbeatAt: now,
          bridgeId,
          ...(h.state === 'error' && { lastError: { at: now, message: h.error ?? 'Unknown error' } }),
        });
        if (h.state === 'error' && !wasError) {
          await this.notifications.notify({
            kind: 'analyzer_error',
            severity: 'warning',
            title: `Analyzer communication error: ${a.name}`,
            body: (h.error ?? 'The machine bridge reported an error.').slice(0, 200),
            link: `/analyzers/${a.id}`,
            audiencePermission: 'analyzers.read',
          });
        }
      }
      accepted.push(a.id);
    }
    return { accepted, serverTime: now };
  }

  async ingest(bridgeId: string, dto: z.infer<typeof BridgeMessageDto>) {
    const analyzer = await this.store.get<AnalyzerDoc>(C.analyzers, dto.analyzerId);
    if (!analyzer) throw badRequest('UNKNOWN_ANALYZER', 'Analyzer is not registered');
    if (!analyzer.enabled) throw unprocessable('ANALYZER_DISABLED', 'Analyzer is disabled');
    if (analyzer.bridgeId && analyzer.bridgeId !== bridgeId) throw badRequest('WRONG_BRIDGE', 'Analyzer is assigned to a different bridge');

    // Idempotency: the same raw payload from the same analyzer is stored once.
    const hash = sha256(`${dto.analyzerId}\n${dto.raw}`);
    const existing = await this.store.get<AnalyzerMessageDoc>(C.analyzerMessages, hash);
    if (existing) return { id: existing.id, status: 'duplicate' as const, originalStatus: existing.status };

    const isDemo = dto.isDemo || analyzer.mode === 'demo';
    const now = this.store.now();
    const msg: AnalyzerMessageDoc = {
      id: hash,
      analyzerId: analyzer.id,
      bridgeId,
      hash,
      raw: dto.raw,
      protocol: dto.protocol,
      receivedAt: now,
      isDemo,
      status: isDemo ? 'demo' : dto.parseErrors.length ? 'parse_error' : 'received',
      sampleIdentifier: dto.sampleIdentifier,
      results: dto.results,
      errors: dto.parseErrors,
    };
    try {
      await this.store.create(C.analyzerMessages, hash, msg);
    } catch {
      return { id: hash, status: 'duplicate' as const };
    }
    await this.store.update(C.analyzers, analyzer.id, { lastMessageAt: now });

    if (msg.status === 'parse_error') {
      await this.notifications.notify({
        kind: 'analyzer_error',
        severity: 'warning',
        title: `Analyzer message could not be parsed: ${analyzer.name}`,
        body: `${dto.parseErrors.length} parse error(s). Review in analyzer messages.`,
        link: `/analyzers/messages?status=parse_error`,
        audiencePermission: 'analyzers.read',
      });
      return { id: hash, status: msg.status };
    }
    if (isDemo) return { id: hash, status: msg.status };
    const outcome = await this.match(msg, msg.sampleIdentifier, bridgeActor(bridgeId));
    return { id: hash, status: outcome.status };
  }

  /**
   * Maps analyzer codes → test parameters for the sample's order and applies the
   * values as DRAFT results. Never submits or approves.
   */
  private async match(msg: AnalyzerMessageDoc, sampleNumber: string | undefined, by: AuditActor) {
    const errors: string[] = [];
    const setStatus = async (status: AnalyzerMessageDoc['status'], extra: Partial<AnalyzerMessageDoc> = {}) => {
      await this.store.update(C.analyzerMessages, msg.id, { status, errors, ...extra });
      return { status };
    };
    if (!sampleNumber) {
      errors.push('Message has no sample identifier');
      return setStatus('unmatched');
    }
    const samples = await this.store.query<SampleDoc>(C.samples, { where: [{ field: 'sampleNumber', op: '==', value: sampleNumber.toUpperCase() }], limit: 1 });
    const sample = samples.items[0];
    if (!sample) {
      errors.push(`No sample found with identifier ${sampleNumber}`);
      return setStatus('unmatched');
    }
    const order = await this.store.get<OrderDoc>(C.orders, sample.orderId);
    if (!order) {
      errors.push('Order for sample not found');
      return setStatus('unmatched');
    }

    const byResult = new Map<string, AnalyzerValueInput[]>();
    for (const r of msg.results) {
      let mapped = false;
      for (const item of order.items.filter((i) => i.sampleId === sample.id)) {
        const test = await this.store.get<TestDoc>(C.tests, item.testId);
        const mapping = test?.analyzerMappings.find((m) => m.analyzerId === msg.analyzerId);
        if (!test || !mapping) continue;
        const parameterId =
          mapping.parameterCodes[r.analyzerTestCode] ??
          (mapping.analyzerTestCode === r.analyzerTestCode && test.parameters.length === 1 ? test.parameters[0].id : undefined);
        if (!parameterId) continue;
        byResult.set(item.resultId, [...(byResult.get(item.resultId) ?? []), { parameterId, value: r.value }]);
        mapped = true;
        break;
      }
      if (!mapped) errors.push(`No test mapping for analyzer code ${r.analyzerTestCode} on order ${order.orderNumber}`);
    }
    if (!byResult.size) return setStatus('unmatched', { matchedOrderId: order.id, matchedSampleId: sample.id });

    let applied = 0;
    for (const [resultId, values] of byResult) {
      try {
        await this.results.applyAnalyzerValues(resultId, values, msg.id, by);
        applied++;
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    return setStatus(applied ? 'applied' : 'matched', {
      matchedOrderId: order.id,
      matchedSampleId: sample.id,
      ...(by.role !== 'bridge' && { matchedBy: by }),
    });
  }

  async messages(q: z.infer<typeof MessageQuery>) {
    const where: WhereClause[] = [];
    if (q.status) where.push({ field: 'status', op: '==', value: q.status });
    if (q.analyzerId) where.push({ field: 'analyzerId', op: '==', value: q.analyzerId });
    const res = await this.store.query<AnalyzerMessageDoc>(C.analyzerMessages, { where, orderBy: { field: 'receivedAt', direction: 'desc' }, limit: q.limit, cursor: q.cursor });
    return { ...res, items: res.items.map(({ raw, ...m }) => ({ ...m, rawPreview: raw.slice(0, 400), rawLength: raw.length })) };
  }

  async message(id: string) {
    const m = await this.store.get<AnalyzerMessageDoc>(C.analyzerMessages, id);
    if (!m) throw notFound('Analyzer message');
    return m;
  }

  /** Authorised manual matching (e.g. barcode misread). */
  async manualMatch(id: string, sampleNumber: string, actor: AuthUser) {
    const msg = await this.message(id);
    if (msg.isDemo) throw unprocessable('DEMO_MESSAGE', 'Demo messages are never applied to patient results');
    if (msg.status === 'applied') throw unprocessable('ALREADY_APPLIED', 'This message has already been applied');
    if (msg.status === 'parse_error') throw unprocessable('PARSE_ERROR', 'Messages with parse errors cannot be matched');
    const outcome = await this.match(msg, sampleNumber, toActor(actor));
    await this.audit.record({ action: 'analyzer.manual_match', entity: 'analyzerMessage', entityId: id, actor: toActor(actor), changes: { sampleNumber, outcome: outcome.status } });
    return { ...(await this.message(id)), raw: undefined };
  }
}
