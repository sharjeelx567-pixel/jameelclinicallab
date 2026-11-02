import { api } from '@/lib/api-client';
import type {
  LabTest,
  Order,
  Paginated,
  Patient,
  Payment,
  PaymentMethod,
  Priority,
  Report,
  ReportListItem,
  Result,
  ResultWorkspace,
  Sample,
  TestCategory,
} from '@/types';

export const catalogService = {
  categories: () => api.get<TestCategory[]>('/tests/categories'),
  createCategory: (input: { name: string; sortOrder?: number }) => api.post<TestCategory>('/tests/categories', input),
  updateCategory: (id: string, input: Partial<TestCategory>) => api.patch<TestCategory>(`/tests/categories/${id}`, input),
  list: (q: { q?: string; categoryId?: string; active?: 'true' | 'false' } = {}) => api.get<LabTest[]>('/tests', q),
  get: (id: string) => api.get<LabTest>(`/tests/${id}`),
  create: (input: unknown) => api.post<LabTest>('/tests', input),
  update: (id: string, input: unknown) => api.patch<LabTest>(`/tests/${id}`, input),
  approveRange: (testId: string, parameterId: string, rangeId: string) => api.post<LabTest>(`/tests/${testId}/parameters/${parameterId}/ranges/${rangeId}/approve`),
  /** Whole catalogue (prices, samples, reporting times) in one request. */
  index: () => api.get<CatalogIndex>('/tests/catalog'),
  updatePrices: (changes: Array<{ testId: string; price: number }>) => api.put<{ updated: number }>('/tests/prices', { changes }),
  importRateList: (rows: RateListRow[], updateNames = false) =>
    api.post<{ rows: number; created: number; updated: number; unchanged: number }>('/tests/import', { rows, updateNames }),
};

export interface CatalogTest {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  price: number;
  sampleType: string;
  containerType?: string;
  turnaroundHours: number;
  reportingTime?: string;
  discountEligible: boolean;
  active: boolean;
}
export interface CatalogIndex {
  updatedAt: string;
  categories: Array<{ id: string; name: string; sortOrder: number; active: boolean }>;
  tests: CatalogTest[];
}
export interface RateListRow {
  code: string;
  name: string;
  price: number;
  sample?: string;
  reportingTime?: string;
}

export interface OrderQuote {
  lines: Array<{ testId: string; name: string; code: string; catalogPrice: number; unitPrice: number }>;
  subtotal: number;
  maxDiscount: number;
  panel: { id: string; name: string } | null;
}

export interface CreateOrderInput {
  patientId: string;
  testIds: string[];
  doctorId?: string;
  panelId?: string | null;
  priority: Priority;
  clinicalNotes?: string;
  discount?: { amount: number; reason: string };
  advancePayment?: { amount: number; method: PaymentMethod; reference?: string };
  homeSamplingRequestId?: string;
}

export interface OrderDetail {
  order: Order;
  patient: Pick<Patient, 'id' | 'mrNumber' | 'name' | 'gender' | 'ageYears' | 'mobile'> | null;
  samples: Sample[];
  results: Array<Pick<Result, 'id' | 'testId' | 'testName' | 'testCode' | 'status' | 'version' | 'hasCritical' | 'sampleId'>>;
  payments: Payment[];
  reports: Array<Omit<Report, 'snapshot'>>;
}

export const ordersService = {
  list: (q: { status?: string; patientId?: string; q?: string; from?: string; to?: string; cursor?: string; limit?: number }) => api.get<Paginated<Order>>('/orders', q),
  quote: (input: { patientId: string; testIds: string[]; panelId?: string | null }) => api.post<OrderQuote>('/orders/quote', input),
  create: (input: CreateOrderInput, idempotencyKey?: string) => api.post<Order>('/orders', input, { idempotencyKey }),
  detail: (id: string) => api.get<OrderDetail>(`/orders/${id}`),
  update: (id: string, input: { priority?: Priority; clinicalNotes?: string; doctorId?: string | null }) => api.patch<Order>(`/orders/${id}`, input),
  cancel: (id: string, reason: string) => api.post<Order & { refundDue: number }>(`/orders/${id}/cancel`, { reason }),
};

export type SampleAction = 'collect' | 'receive' | 'accept' | 'process' | 'complete' | 'reject';

export const samplesService = {
  list: (q: { status?: string; orderId?: string; limit?: number; cursor?: string }) => api.get<Paginated<Sample>>('/samples', { limit: 50, ...q }),
  get: (id: string) => api.get<Sample>(`/samples/${id}`),
  byBarcode: (code: string) => api.get<Sample>(`/samples/barcode/${encodeURIComponent(code)}`),
  act: (id: string, action: SampleAction, body: { location?: string; condition?: string; note?: string; reason?: string } = {}) =>
    api.post<{ sample: Sample; replacement?: Sample }>(`/samples/${id}/${action}`, body),
  labelPrinted: (id: string, kind: 'sample' | 'order' | 'patient' = 'sample') => api.post<{ printCount: number }>(`/samples/${id}/label-prints`, { kind }),
};

export const resultsService = {
  list: (q: { status?: string; orderId?: string; patientId?: string; limit?: number; cursor?: string }) => api.get<Paginated<Result>>('/results', { limit: 50, ...q }),
  workspace: (id: string) => api.get<ResultWorkspace>(`/results/${id}`),
  enter: (id: string, body: { values: Array<{ parameterId: string; value: string }>; technicianComment?: string; submit: boolean }) => api.put<Result>(`/results/${id}/values`, body),
  approve: (id: string, comment?: string) => api.post<Result>(`/results/${id}/approve`, { comment }),
  reject: (id: string, reason: string, kind: 'rejected' | 'correction_requested') => api.post<Result>(`/results/${id}/reject`, { reason, kind }),
  amend: (id: string, reason: string) => api.post<Result>(`/results/${id}/amend`, { reason }),
};

export const reportsService = {
  list: (q: { patientId?: string; orderId?: string; status?: string; limit?: number; cursor?: string } = {}) => api.get<Paginated<ReportListItem>>('/reports', q),
  get: (id: string) => api.get<Report>(`/reports/${id}`),
  generate: (orderId: string) => api.post<Report>(`/reports/orders/${orderId}`),
  pdf: (id: string) => api.blob(`/reports/${id}/pdf`),
  recordBrowserPrint: (id: string) => api.post<void>(`/reports/${id}/prints`),
  prints: (id: string) => api.get<Array<{ id: string; channel: string; by: { name: string }; at: string; copy: number }>>(`/reports/${id}/prints`),
  verify: (code: string) =>
    api.get<{ valid: boolean; laboratory?: string; reportNumber?: string; version?: number; status?: string; generatedAt?: string; patientInitials?: string; mrNumberMasked?: string; current?: boolean }>(
      `/reports/verify/${encodeURIComponent(code)}`,
    ),
};
