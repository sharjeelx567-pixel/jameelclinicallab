import { api } from '@/lib/api-client';
import type {
  Analyzer,
  AnalyzerMessage,
  AppNotification,
  AuditLog,
  HomeSamplingRequest,
  InventoryItem,
  InventoryTransaction,
  LabSettings,
  MediaAsset,
  MediaCategory,
  MediaConfig,
  Paginated,
  Payment,
  PaymentMethod,
  ReferenceData,
  Role,
  RoleId,
  StaffUser,
  Billing,
} from '@/types';

export const billingService = {
  payments: (q: { businessDate?: string; method?: string; type?: string; limit?: number; cursor?: string }) => api.get<Paginated<Payment>>('/billing/payments', { limit: 50, ...q }),
  daily: (date?: string) =>
    api.get<{
      businessDate: string;
      totals: { collected: number; refunded: number; net: number; cashInHand: number; transactions: number };
      byMethod: Record<string, { payments: number; refunds: number; net: number; count: number }>;
      byUser: Array<{ name: string; net: number; count: number }>;
      transactions: Payment[];
    }>('/billing/daily-summary', { date }),
  outstanding: (cursor?: string) =>
    api.get<Paginated<{ id: string; orderNumber: string; patientName: string; patientMrNumber: string; total: number; paid: number; balance: number; status: string; createdAt: string }>>(
      '/billing/outstanding',
      { cursor, limit: 50 },
    ),
  invoice: (orderId: string) =>
    api.get<{
      invoiceNumber: string;
      lab: { name: string; tagline: string; address: string; phone: string; email?: string; currency: string };
      order: { id: string; orderNumber: string; createdAt: string; status: string; doctorName?: string; createdByName?: string };
      patient: { name: string; mrNumber: string; mobile: string; ageYears?: number; gender: string; guardianName?: string; guardianRelation?: string; centre?: string } | null;
      lines: Array<{ testCode: string; testName: string; amount: number; reportDue?: string }>;
      billing: Billing;
      payments: Payment[];
    }>(`/billing/orders/${orderId}/invoice`),
  pay: (orderId: string, body: { amount: number; method: PaymentMethod; reference?: string }, idempotencyKey?: string) =>
    api.post<{ payment: Payment; billing: Billing }>(`/billing/orders/${orderId}/payments`, body, { idempotencyKey }),
  refund: (orderId: string, body: { amount: number; method: Exclude<PaymentMethod, 'panel'>; reason: string; reference?: string }, idempotencyKey?: string) =>
    api.post<{ payment: Payment; billing: Billing }>(`/billing/orders/${orderId}/refunds`, body, { idempotencyKey }),
};

export const inventoryService = {
  list: (q: { q?: string; category?: string } = {}) => api.get<InventoryItem[]>('/inventory/items', q),
  alerts: () => api.get<{ lowStock: InventoryItem[]; expiringSoon: InventoryItem[]; expired: InventoryItem[] }>('/inventory/alerts'),
  get: (id: string) => api.get<{ item: InventoryItem; transactions: InventoryTransaction[] }>(`/inventory/items/${id}`),
  create: (input: unknown, idempotencyKey?: string) => api.post<InventoryItem>('/inventory/items', input, { idempotencyKey }),
  update: (id: string, input: unknown) => api.patch<InventoryItem>(`/inventory/items/${id}`, input),
  move: (id: string, input: { type: InventoryTransaction['type']; quantity: number; note?: string; unitPrice?: number; batchNumber?: string; expiryDate?: string; supplier?: string }, idempotencyKey?: string) =>
    api.post<InventoryTransaction>(`/inventory/items/${id}/movements`, input, { idempotencyKey }),
};

export const homeSamplingService = {
  list: (status?: string) => api.get<HomeSamplingRequest[]>('/home-sampling', { status }),
  create: (input: unknown, idempotencyKey?: string) => api.post<HomeSamplingRequest>('/home-sampling', input, { idempotencyKey }),
  update: (id: string, input: { scheduledFor?: string; collectorId?: string; fee?: number; status?: string; note?: string }) => api.patch<HomeSamplingRequest>(`/home-sampling/${id}`, input),
};

export interface AnalyzerDetail {
  analyzer: Analyzer;
  recentMessages: AnalyzerMessage[];
  activity: AuditLog[];
  mappedTests: Array<{ testId: string; testName: string; testCode: string; mapping?: { analyzerTestCode: string; parameterCodes: Record<string, string> } }>;
}

export const analyzersService = {
  list: () => api.get<Analyzer[]>('/analyzers'),
  get: (id: string) => api.get<AnalyzerDetail>(`/analyzers/${id}`),
  create: (input: unknown) => api.post<Analyzer>('/analyzers', input),
  update: (id: string, input: unknown) => api.patch<Analyzer>(`/analyzers/${id}`, input),
  messages: (q: { status?: string; analyzerId?: string; cursor?: string }) => api.get<Paginated<AnalyzerMessage>>('/analyzers/messages', { limit: 50, ...q }),
  message: (id: string) => api.get<AnalyzerMessage>(`/analyzers/messages/${id}`),
  match: (id: string, sampleNumber: string) => api.post<AnalyzerMessage>(`/analyzers/messages/${id}/match`, { sampleNumber }),
};

export const usersService = {
  list: () => api.get<StaffUser[]>('/users'),
  create: (input: { email: string; displayName: string; role: RoleId; initialPassword: string; phone?: string; department?: string }) => api.post<StaffUser>('/users', input),
  update: (uid: string, input: Partial<Pick<StaffUser, 'displayName' | 'role' | 'status' | 'phone' | 'department'>>) => api.patch<StaffUser>(`/users/${uid}`, input),
  activity: (uid: string) => api.get<AuditLog[]>(`/users/${uid}/activity`),
  roles: () => api.get<{ roles: Role[]; permissions: Record<string, string> }>('/roles'),
  updateRole: (roleId: RoleId, permissions: string[]) => api.put<Role>(`/roles/${roleId}`, { permissions }),
};

export const settingsService = {
  get: () => api.get<LabSettings>('/settings'),
  reference: () => api.get<ReferenceData>('/settings/reference'),
  update: (input: Partial<LabSettings>) => api.put<LabSettings>('/settings', input),
};

type Progress = { onProgress?: (percent: number) => void; signal?: AbortSignal };

/** Non-sensitive images on Cloudinary. Uploads go through the backend, which holds the API secret. */
export const mediaService = {
  config: () => api.get<MediaConfig>('/media/config'),
  list: (category: MediaCategory, ownerId?: string) => api.get<MediaAsset[]>('/media', { category, ownerId }),
  upload: (category: MediaCategory, file: File, opts: Progress & { ownerId?: string; alt?: string } = {}) =>
    api.uploadWithProgress<MediaAsset>('POST', `/media/${category}`, file, { ...opts, fields: { ownerId: opts.ownerId, alt: opts.alt } }),
  replace: (id: string, file: File, opts: Progress = {}) => api.uploadWithProgress<MediaAsset>('PUT', `/media/${id}`, file, opts),
  remove: (id: string) => api.delete(`/media/${id}`),
};

export const notificationsService = {
  list: (unread = false) => api.get<{ items: AppNotification[]; unread: number; cursor: string | null }>('/notifications', { unread: unread ? 'true' : undefined }),
  /** Only notifications created after `after` (cheap polling: 1 database read when none are new). */
  newSince: (after: string) => api.get<{ items: AppNotification[]; incremental: true; cursor: string }>('/notifications', { after }),
  read: (id: string) => api.post<void>(`/notifications/${id}/read`),
  readAll: () => api.post<void>('/notifications/read-all'),
  acknowledge: (id: string) => api.post<void>(`/notifications/${id}/acknowledge`),
};

export interface UsageReport {
  quotaDay: string;
  timeZone: string;
  freeDailyLimits: { reads: number; writes: number };
  notes: string[];
  anomalies: Array<{ level: 'warning' | 'critical'; message: string }>;
  today: {
    date: string; requests: number; reads: number; writes: number; percentOfFreeReads: number; percentOfFreeWrites: number; serverProcesses: number;
    routes: Array<{ route: string; workflow: string; requests: number; reads: number; writes: number; maxReads: number }>;
    workflows: Array<{ name: string; requests: number; reads: number; writes: number; readsPerRequest: number }>;
    caches: Array<{ name: string; hits: number; misses: number; hitRate: number | null }>;
  };
  days: Array<{ date: string; requests: number; reads: number; writes: number; percentOfFreeReads: number; monitoringWrites: number; serverProcesses: number }>;
}

/** Super Admin only: database usage counted by the backend (no patient data). */
export const usageService = {
  report: (days = 7) => api.get<UsageReport>('/system/usage', { days }),
};

export const auditService = {
  list: (q: { entity?: string; action?: string; actorUid?: string; from?: string; to?: string; cursor?: string }) => api.get<Paginated<AuditLog>>('/audit-logs', { limit: 50, ...q }),
};

export interface DashboardData {
  generatedAt: string;
  patients?: { total: number; today: number };
  recentPatients?: Array<{ id: string; mrNumber: string; name: string; gender: string; ageYears?: number; createdAt: string }>;
  weeklyRegistrations?: Array<{ date: string; count: number }>;
  orders?: { today: number; completedTotal: number; verificationPending: number };
  recentOrders?: Array<{ id: string; orderNumber: string; patientName: string; status: string; total: number; priority: string; createdAt: string }>;
  testDistribution?: Array<{ name: string; count: number }>;
  samples?: { pendingCollection: number; awaitingReceipt: number; received: number; processing: number };
  results?: { pending: number; awaitingVerification: number };
  criticalResults?: Array<{ id: string; orderId: string; orderNumber: string; testCode: string; status: string; updatedAt: string }>;
  reports?: { total: number };
  revenue?: { today: number; outstanding: number; outstandingOrders: number };
  monthlyRevenue?: Array<{ month: string; revenue: number }>;
  analyzers?: Array<{ id: string; name: string; mode: 'live' | 'demo'; enabled: boolean; integrationStatus: string; connectionState: string; lastMessageAt?: string }>;
  inventory?: { lowStock: number; expiringSoon: number; expired: number; items: Array<{ id: string; name: string; quantity: number; unit: string; minimumLevel: number; expiryDate?: string }> };
}

export interface RangeAnalytics {
  from: string;
  to: string;
  totals: { patients: number; orders: number; cancelledOrders: number; completedOrders: number; billed: number; collected: number; refunded: number; outstanding: number; discounts: number };
  daily: Array<{ date: string; patients: number; orders: number; revenue: number }>;
  tests: Array<{ testName: string; category: string; count: number; revenue: number }>;
  doctors: Array<{ doctorName: string; orders: number; revenue: number }>;
  staffActivity: Array<{ name: string; role: string; actions: number }>;
  inventoryConsumption: Array<{ itemName: string; quantity: number }>;
}

export const analyticsService = {
  dashboard: () => api.get<DashboardData>('/analytics/dashboard'),
  range: (from: string, to: string) => api.get<RangeAnalytics>('/analytics/range', { from, to }),
};

export const authService = {
  config: () => api.get<{ authMode: string; dataBackend: string; environment: string }>('/auth/config'),
  loginActivity: () => api.get<Array<{ id: string; event: string; at: string; ip?: string; userAgent?: string }>>('/auth/login-activity'),
};
