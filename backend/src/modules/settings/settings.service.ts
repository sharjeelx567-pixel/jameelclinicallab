import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { LabSettingsDoc } from '../../common/entities';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore } from '../../database/data-store';
import { diff, optionalText, requiredText, text } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';

export const DEFAULT_SETTINGS: Omit<LabSettingsDoc, 'updatedAt'> = {
  id: 'main',
  name: 'JAMEEL CLINICAL LABORATORY',
  tagline: 'Accurate Diagnosis, Better Healthcare',
  address: '',
  phone: '',
  email: '',
  branches: [{ id: 'main', name: 'Main Laboratory', active: true }],
  collectionCenters: [],
  patientCategories: ['General', 'Staff', 'Panel', 'Welfare'],
  billing: { maxDiscountPercent: 20, currency: 'PKR' },
  results: { allowSelfVerification: false, criticalEscalationMinutes: 30 },
  barcode: { format: 'CODE128', labelWidthMm: 50, labelHeightMm: 25 },
  notifications: { lowStock: true, expiryDays: 30, criticalResults: true },
  retention: { auditLogYears: 10, reportYears: 10 },
};

const idName = z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), name: requiredText(80), active: z.boolean() });

export const UpdateSettingsDto = z
  .object({
    name: requiredText(100),
    tagline: text(140),
    address: text(300),
    phone: text(60),
    email: text(120),
    website: optionalText(120),
    reportHeaderNote: optionalText(300),
    reportFooter: optionalText(500),
    reportSignatories: z
      .array(z.object({ name: requiredText(80), qualification: optionalText(120), title: optionalText(80) }))
      .max(6),
    branches: z.array(idName.extend({ address: optionalText(200) })).min(1).max(50),
    collectionCenters: z.array(idName.extend({ branchId: optionalText(40) })).max(200),
    patientCategories: z.array(requiredText(40)).max(30),
    billing: z.object({ maxDiscountPercent: z.number().min(0).max(100), currency: z.string().length(3) }),
    results: z.object({ allowSelfVerification: z.boolean(), criticalEscalationMinutes: z.number().int().min(5).max(1440) }),
    barcode: z.object({ format: z.literal('CODE128'), labelWidthMm: z.number().min(20).max(120), labelHeightMm: z.number().min(10).max(80) }),
    notifications: z.object({ lowStock: z.boolean(), expiryDays: z.number().int().min(1).max(365), criticalResults: z.boolean() }),
    retention: z.object({ auditLogYears: z.number().int().min(1).max(50), reportYears: z.number().int().min(1).max(50) }),
  })
  .partial();

@Injectable()
export class SettingsService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<LabSettingsDoc> {
    const doc = await this.store.get<LabSettingsDoc>(C.laboratorySettings, 'main');
    return { ...DEFAULT_SETTINGS, updatedAt: '', ...doc } as LabSettingsDoc;
  }

  async update(dto: z.infer<typeof UpdateSettingsDto>, actor: AuthUser): Promise<LabSettingsDoc> {
    const before = await this.get();
    const next: LabSettingsDoc = { ...before, ...dto, id: 'main', updatedAt: this.store.now(), updatedBy: toActor(actor) };
    await this.store.set(C.laboratorySettings, 'main', next);
    await this.audit.record({ action: 'settings.update', entity: 'settings', entityId: 'main', actor: toActor(actor), changes: diff(before, dto) });
    return next;
  }
}
