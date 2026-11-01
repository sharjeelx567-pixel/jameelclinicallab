import { api } from '@/lib/api-client';
import type { Doctor, DuplicateCandidate, Order, Paginated, Panel, Patient, Payment, ReportListItem, AuditLog } from '@/types';

export interface PatientInput {
  name: string;
  guardianName?: string;
  guardianRelation?: 'father' | 'husband' | 'other';
  dateOfBirth?: string;
  ageYears?: number;
  gender: 'male' | 'female' | 'other';
  mobile: string;
  alternateMobile?: string;
  cnic?: string;
  email?: string;
  address: Patient['address'];
  referringDoctorId?: string;
  branchId?: string;
  collectionCenterId?: string;
  sampleCollectionLocation?: string;
  panelId?: string;
  category?: string;
  notes?: string;
}

export interface PatientHistory {
  patient: Patient;
  referringDoctor: { id: string; name: string } | null;
  orders: Order[];
  payments: Payment[];
  reports: ReportListItem[];
  timeline: AuditLog[];
  summary: { totalOrders: number; totalBilled: number; totalPaid: number; outstanding: number };
}

export const patientsService = {
  list: (q: { q?: string; status?: string; gender?: string; cursor?: string; limit?: number }) => api.get<Paginated<Patient>>('/patients', q),
  get: (id: string) => api.get<Patient>(`/patients/${id}`),
  history: (id: string) => api.get<PatientHistory>(`/patients/${id}/history`),
  create: (input: PatientInput & { confirmNotDuplicate?: boolean }, idempotencyKey?: string) => api.post<Patient>('/patients', input, { idempotencyKey }),
  update: (id: string, input: Partial<PatientInput>) => api.patch<Patient>(`/patients/${id}`, input),
  archive: (id: string, archived: boolean, reason: string) => api.post<Patient>(`/patients/${id}/archive`, { archived, reason }),
  duplicateCheck: (input: { name: string; mobile: string; cnic?: string }) => api.post<DuplicateCandidate[]>('/patients/duplicate-check', input),
  attach: (id: string, file: File) => api.upload(`/patients/${id}/attachments`, file),
};

export interface DoctorStats {
  doctor: Doctor;
  totals: { orders: number; patients: number; revenue: number; estimatedCommission: number };
  tests: Array<{ testName: string; count: number; revenue: number }>;
  recentOrders: Array<{ id: string; orderNumber: string; patientName: string; total: number; status: string; createdAt: string }>;
  referredPatients: Array<{ id: string; mrNumber: string; name: string; createdAt: string }>;
}

export const doctorsService = {
  list: (q: { q?: string; status?: string; limit?: number; cursor?: string } = {}) => api.get<Paginated<Doctor>>('/doctors', { limit: 100, ...q }),
  stats: (id: string) => api.get<DoctorStats>(`/doctors/${id}`),
  create: (input: Partial<Doctor>) => api.post<Doctor>('/doctors', input),
  update: (id: string, input: Partial<Doctor>) => api.patch<Doctor>(`/doctors/${id}`, input),
};

export interface PanelStatement {
  panel: Panel;
  totals: { billed: number; outstanding: number; orders: number };
  outstandingOrders: Array<{ id: string; orderNumber: string; patientName: string; total: number; balance: number; createdAt: string }>;
  payments: Payment[];
}

export const panelsService = {
  list: () => api.get<Panel[]>('/panels'),
  statement: (id: string) => api.get<PanelStatement>(`/panels/${id}`),
  create: (input: Partial<Panel>) => api.post<Panel>('/panels', input),
  update: (id: string, input: Partial<Panel>) => api.patch<Panel>(`/panels/${id}`, input),
};
