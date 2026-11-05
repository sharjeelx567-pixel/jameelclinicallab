/** Mirrors the backend document shapes returned by the REST API (see backend/src/common/entities.ts). */

export type RoleId = 'super_admin' | 'lab_admin' | 'receptionist' | 'lab_technician' | 'pathologist' | 'accountant' | 'inventory_manager';
export type Gender = 'male' | 'female' | 'other';

export interface Actor {
  uid: string;
  name: string;
  role: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Me {
  uid: string;
  email: string;
  displayName: string;
  role: RoleId;
  roleLabel: string;
  permissions: string[];
  photo?: MediaRef | null;
}

export interface StaffUser {
  id: string;
  email: string;
  displayName: string;
  role: RoleId;
  status: 'active' | 'disabled';
  phone?: string;
  department?: string;
  branchId?: string;
  isDemo?: boolean;
  photo?: MediaRef;
  createdAt: string;
}

export interface Role {
  id: RoleId;
  label: string;
  permissions: string[];
  updatedAt: string;
}

export interface Patient {
  id: string;
  mrNumber: string;
  name: string;
  guardianName?: string;
  guardianRelation?: 'father' | 'husband' | 'other';
  dateOfBirth?: string;
  ageYears?: number;
  gender: Gender;
  mobile: string;
  alternateMobile?: string;
  cnic?: string;
  email?: string;
  address: { province?: string; division?: string; district?: string; tehsil?: string; unionCouncil?: string; line?: string };
  referringDoctorId?: string;
  branchId?: string;
  collectionCenterId?: string;
  sampleCollectionLocation?: string;
  panelId?: string;
  category?: string;
  notes?: string;
  attachments: Array<{ path: string; name: string; contentType: string; uploadedAt: string }>;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
}

export interface DuplicateCandidate {
  id: string;
  mrNumber: string;
  name: string;
  mobile: string;
  reason: 'same_cnic' | 'same_mobile_and_name';
}

export interface Doctor {
  id: string;
  name: string;
  specialization?: string;
  qualification?: string;
  phone?: string;
  email?: string;
  clinic?: string;
  address?: string;
  commission?: { type: 'none' | 'percent' | 'fixed'; value: number };
  status: 'active' | 'inactive';
  photo?: MediaRef;
  createdAt: string;
}

export interface TestCategory {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface ReferenceRange {
  id: string;
  gender: Gender | 'any';
  ageMinYears?: number;
  ageMaxYears?: number;
  low?: number;
  high?: number;
  text?: string;
  criticalLow?: number;
  criticalHigh?: number;
  status: 'draft' | 'approved';
  approvedBy?: Actor;
  approvedAt?: string;
}

export interface TestParameter {
  id: string;
  name: string;
  code?: string;
  unit?: string;
  inputType: 'numeric' | 'text' | 'select';
  options?: string[];
  decimals?: number;
  ranges: ReferenceRange[];
  sortOrder: number;
}

export interface LabTest {
  id: string;
  name: string;
  code: string;
  categoryId: string;
  description?: string;
  sampleType: string;
  containerType?: string;
  sampleVolume?: string;
  collectionInstructions?: string;
  processingInstructions?: string;
  turnaroundHours: number;
  price: number;
  discountEligible: boolean;
  active: boolean;
  parameters: TestParameter[];
  analyzerMappings: Array<{ analyzerId: string; analyzerTestCode: string; parameterCodes: Record<string, string> }>;
  updatedAt: string;
}

export type OrderStatus =
  | 'registered'
  | 'payment_pending'
  | 'sample_pending'
  | 'sample_collected'
  | 'processing'
  | 'results_pending'
  | 'verification_pending'
  | 'completed'
  | 'cancelled';
export type Priority = 'routine' | 'urgent' | 'stat';

export interface OrderItem {
  testId: string;
  testName: string;
  testCode: string;
  sampleType: string;
  unitPrice: number;
  resultId: string;
  sampleId: string;
}

export interface Billing {
  subtotal: number;
  collectionFee: number;
  discountAmount: number;
  discountReason?: string;
  total: number;
  paid: number;
  refunded: number;
  balance: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  patientId: string;
  patientMrNumber: string;
  patientName: string;
  doctorId?: string;
  doctorName?: string;
  panelId?: string;
  technicianId?: string;
  priority: Priority;
  clinicalNotes?: string;
  items: OrderItem[];
  billing: Billing;
  status: OrderStatus;
  statusHistory: Array<{ status: OrderStatus; at: string; by: Actor; note?: string }>;
  cancellation?: { reason: string; at: string; by: Actor };
  createdBy: Actor;
  createdAt: string;
}

export type SampleStatus = 'pending_collection' | 'collected' | 'received' | 'accepted' | 'rejected' | 'processing' | 'completed';

export interface Sample {
  id: string;
  sampleNumber: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  sampleType: string;
  containerType?: string;
  testIds: string[];
  status: SampleStatus;
  collectedAt?: string;
  collectedBy?: Actor;
  collectionLocation?: string;
  condition?: string;
  rejectionReason?: string;
  timeline: Array<{ status: SampleStatus; at: string; by: Actor; note?: string }>;
  createdAt: string;
}

export type ResultStatus = 'pending' | 'draft' | 'submitted' | 'correction_requested' | 'approved' | 'rejected';
export type ResultFlag = 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high' | 'abnormal' | 'no_range';

export interface ResultValue {
  parameterId: string;
  parameterName: string;
  unit?: string;
  value: string;
  referenceRange?: { low?: number; high?: number; text?: string };
  flag: ResultFlag;
  source: 'manual' | 'analyzer';
}

export interface Result {
  id: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  sampleId: string;
  testId: string;
  testName: string;
  testCode: string;
  status: ResultStatus;
  version: number;
  values: ResultValue[];
  hasCritical: boolean;
  hasAnalyzerValues: boolean;
  technicianComment?: string;
  approverComment?: string;
  enteredBy?: Actor;
  submittedAt?: string;
  approvedBy?: Actor;
  approvedAt?: string;
  rejection?: { reason: string; at: string; by: Actor; kind: string };
  amendment?: { reason: string; at: string; by: Actor; previousVersion: number };
  updatedAt: string;
  patientName?: string;
  patientMrNumber?: string;
  priority?: Priority;
}

export interface ResultWorkspace {
  result: Result;
  test: { id: string; name: string; code: string; sampleType: string; processingInstructions?: string };
  parameters: Array<{
    id: string;
    name: string;
    unit?: string;
    inputType: 'numeric' | 'text' | 'select';
    options?: string[];
    decimals?: number;
    approvedRange: { low?: number; high?: number; text?: string; criticalLow?: number; criticalHigh?: number } | null;
    hasDraftRanges: boolean;
  }>;
  order: { id: string; orderNumber: string; priority: Priority; clinicalNotes?: string; doctorName?: string; createdAt: string };
  patient: { id: string; mrNumber: string; name: string; gender: Gender; ageYears?: number };
  sample: { id: string; sampleNumber: string; status: SampleStatus; sampleType: string; collectedAt?: string; condition?: string } | null;
  versions: Array<{ version: number; approvedBy: Actor; approvedAt: string; supersededAt?: string; amendmentReason?: string; values: ResultValue[] }>;
  previousResults: Array<{ id: string; orderNumber: string; approvedAt?: string; values: Array<{ parameterId: string; value: string; unit?: string; flag: ResultFlag }> }>;
}

export type ReportStatus = 'final' | 'interim' | 'amended' | 'superseded';

export interface ReportSnapshot {
  lab: { name: string; tagline: string; address: string; phone: string; email: string; reportFooter?: string; signatories?: ReportSignatory[] };
  patient: { name: string; mrNumber: string; age?: string; gender: Gender; guardian?: string; mobile?: string; address?: string };
  doctorName?: string;
  orderNumber: string;
  centre?: string;
  registeredAt?: string;
  samples: Array<{ sampleNumber: string; sampleType: string; collectedAt?: string }>;
  tests: Array<{
    resultId: string;
    testName: string;
    testCode: string;
    category: string;
    status: 'approved' | 'pending';
    resultVersion?: number;
    values: Array<{ parameterName: string; value: string; unit?: string; range?: string; flag: ResultFlag }>;
    comment?: string;
    approvedBy?: string;
    approvedAt?: string;
    amended?: boolean;
    amendmentReason?: string;
  }>;
  verifiedBy: string[];
  technicians: string[];
}

export interface Report {
  id: string;
  reportNumber: string;
  orderId: string;
  patientId: string;
  version: number;
  status: ReportStatus;
  snapshot: ReportSnapshot;
  verificationCode: string;
  generatedBy: Actor;
  generatedAt: string;
  printCount: number;
}

export interface ReportListItem extends Omit<Report, 'snapshot'> {
  patientName: string;
  mrNumber: string;
  orderNumber: string;
  testCount: number;
}

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'panel';

export interface Payment {
  id: string;
  receiptNumber: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  type: 'payment' | 'refund';
  method: PaymentMethod;
  amount: number;
  reference?: string;
  reason?: string;
  recordedBy: Actor;
  recordedAt: string;
  businessDate: string;
}

export interface Panel {
  id: string;
  name: string;
  type: 'insurance' | 'corporate';
  contactPerson?: string;
  phone?: string;
  email?: string;
  discountPercent: number;
  rates: Record<string, number>;
  creditLimit?: number;
  active: boolean;
}

export type HomeSamplingStatus = 'requested' | 'scheduled' | 'assigned' | 'en_route' | 'collected' | 'cancelled';

export interface HomeSamplingRequest {
  id: string;
  requestNumber: string;
  patientId?: string;
  patientName: string;
  mobile: string;
  address: string;
  requestedTestIds: string[];
  scheduledFor?: string;
  collectorId?: string;
  collectorName?: string;
  fee: number;
  status: HomeSamplingStatus;
  orderId?: string;
  notes?: string;
  history: Array<{ status: HomeSamplingStatus; at: string; by: Actor; note?: string }>;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minimumLevel: number;
  supplier?: string;
  purchasePrice?: number;
  batchNumber?: string;
  expiryDate?: string;
  location?: string;
  active: boolean;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  itemName: string;
  type: 'receive' | 'consume' | 'adjust' | 'discard';
  quantity: number;
  balanceAfter: number;
  unitPrice?: number;
  batchNumber?: string;
  expiryDate?: string;
  supplier?: string;
  note?: string;
  by: Actor;
  at: string;
}

export type ConnectionState = 'never_connected' | 'connected' | 'disconnected' | 'error';

export interface Analyzer {
  id: string;
  name: string;
  brand: string;
  model?: string;
  serialNumber?: string;
  machineType: string;
  connectionType: 'tcp' | 'serial' | 'file' | 'vendor_api' | 'none';
  host?: string;
  port?: number;
  serialPort?: string;
  baudRate?: number;
  protocol: 'astm' | 'hl7' | 'vendor' | 'unconfirmed';
  mode: 'live' | 'demo';
  enabled: boolean;
  integrationStatus: 'pending_documentation' | 'configured' | 'verified';
  connectionState: ConnectionState;
  demoActive?: boolean;
  bridgeId?: string;
  lastHeartbeatAt?: string;
  lastDemoHeartbeatAt?: string;
  lastMessageAt?: string;
  lastError?: { at: string; message: string };
  notes?: string;
}

export type AnalyzerMessageStatus = 'received' | 'parse_error' | 'unmatched' | 'matched' | 'applied' | 'duplicate' | 'demo';

export interface AnalyzerMessage {
  id: string;
  analyzerId: string;
  bridgeId: string;
  protocol: string;
  receivedAt: string;
  isDemo: boolean;
  status: AnalyzerMessageStatus;
  sampleIdentifier?: string;
  results: Array<{ analyzerTestCode: string; value: string; unit?: string; flags?: string }>;
  matchedOrderId?: string;
  matchedSampleId?: string;
  errors: string[];
  rawPreview?: string;
  raw?: string;
}

export interface AppNotification {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  link?: string;
  createdAt: string;
  read: boolean;
  acknowledgedBy?: Actor;
  acknowledgedAt?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  actor: Actor;
  at: string;
  ip?: string;
  changes?: Record<string, unknown>;
  note?: string;
}

export interface LabSettings {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  logoPath?: string;
  logo?: MediaRef;
  reportHeaderNote?: string;
  reportFooter?: string;
  reportSignatories?: ReportSignatory[];
  branches: Array<{ id: string; name: string; address?: string; active: boolean }>;
  collectionCenters: Array<{ id: string; name: string; branchId?: string; active: boolean }>;
  patientCategories: string[];
  billing: { maxDiscountPercent: number; currency: string };
  results: { allowSelfVerification: boolean; criticalEscalationMinutes: number };
  barcode: { format: 'CODE128'; labelWidthMm: number; labelHeightMm: number };
  notifications: { lowStock: boolean; expiryDays: number; criticalResults: boolean };
  retention: { auditLogYears: number; reportYears: number };
  updatedAt: string;
}

export interface ReferenceData {
  name: string;
  tagline: string;
  logo: MediaRef | null;
  branches: Array<{ id: string; name: string }>;
  collectionCenters: Array<{ id: string; name: string }>;
  patientCategories: string[];
  maxDiscountPercent: number;
  currency: string;
  barcode: { labelWidthMm: number; labelHeightMm: number };
}

// ─── Media (Cloudinary — non-sensitive images only) ──────────────────────────

export type MediaCategory = 'lab_logo' | 'lab_gallery' | 'staff_profile' | 'doctor_profile' | 'website_illustration';

export interface MediaRef {
  assetId: string;
  publicId: string;
  secureUrl: string;
  width?: number;
  height?: number;
}

export interface MediaAsset {
  id: string;
  category: MediaCategory;
  ownerId?: string;
  publicId: string;
  secureUrl: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  originalName: string;
  alt?: string;
  uploadedBy: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface MediaConfig {
  configured: boolean;
  provider: 'cloudinary';
  cloudName: string | null;
  categories: Array<{ id: MediaCategory; label: string; folder: string; maxBytes: number; accept: string[] }>;
}

export interface ReportSignatory {
  name: string;
  qualification?: string;
  title?: string;
}
