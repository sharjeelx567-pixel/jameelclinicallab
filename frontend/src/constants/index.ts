import {
  Activity,
  BarChart3,
  Beaker,
  Bell,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Cpu,
  FileText,
  FlaskConical,
  HeartHandshake,
  Home,
  LayoutDashboard,
  type LucideIcon,
  Receipt,
  ScrollText,
  Settings,
  Stethoscope,
  TestTubes,
  Users,
  UserCog,
} from 'lucide-react';
import type { BadgeTone } from '@/components/ui/badge';

export const BRAND = {
  name: 'JAMEEL CLINICAL LABORATORY',
  short: 'Jameel Clinical Lab',
  tagline: 'Accurate Diagnosis, Better Healthcare',
} as const;

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Items are shown only if the user's role holds the permission (the backend enforces it regardless). */
export const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }] },
  {
    label: 'Front desk',
    items: [
      { label: 'Patients', href: '/patients', icon: Users, permission: 'patients.read' },
      { label: 'Orders', href: '/orders', icon: ClipboardList, permission: 'orders.read' },
      { label: 'Home sampling', href: '/home-sampling', icon: Home, permission: 'homeSampling.read' },
      { label: 'Doctors', href: '/doctors', icon: Stethoscope, permission: 'doctors.read' },
    ],
  },
  {
    label: 'Laboratory',
    items: [
      { label: 'Samples', href: '/samples', icon: TestTubes, permission: 'samples.read' },
      { label: 'Result entry', href: '/results', icon: FlaskConical, permission: 'results.enter' },
      { label: 'Verification', href: '/verification', icon: ClipboardCheck, permission: 'results.approve' },
      { label: 'Reports', href: '/reports', icon: FileText, permission: 'reports.read' },
      { label: 'Analyzers', href: '/analyzers', icon: Cpu, permission: 'analyzers.read' },
      { label: 'Test catalogue', href: '/tests', icon: Beaker, permission: 'tests.read' },
    ],
  },
  {
    label: 'Finance & stock',
    items: [
      { label: 'Billing', href: '/billing', icon: Receipt, permission: 'billing.read' },
      { label: 'Insurance & panels', href: '/panels', icon: HeartHandshake, permission: 'panels.read' },
      { label: 'Inventory', href: '/inventory', icon: Boxes, permission: 'inventory.read' },
      { label: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'analytics.read' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Staff & roles', href: '/staff', icon: UserCog, permission: 'users.read' },
      { label: 'Audit logs', href: '/audit-logs', icon: ScrollText, permission: 'audit.read' },
      { label: 'Notifications', href: '/notifications', icon: Bell, permission: 'notifications.read' },
      { label: 'Settings', href: '/settings', icon: Settings, permission: 'settings.read' },
    ],
  },
];

export const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', patients: 'Patients', new: 'New', orders: 'Orders', 'home-sampling': 'Home sampling', doctors: 'Doctors', samples: 'Samples',
  results: 'Result entry', verification: 'Verification', reports: 'Reports', analyzers: 'Analyzers', messages: 'Messages', tests: 'Test catalogue',
  billing: 'Billing', invoice: 'Invoice', panels: 'Insurance & panels', inventory: 'Inventory', analytics: 'Analytics', staff: 'Staff & roles',
  'audit-logs': 'Audit logs', notifications: 'Notifications', settings: 'Settings', profile: 'My profile',
};

export const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'lab_admin', label: 'Lab Administrator' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'lab_technician', label: 'Lab Technician' },
  { value: 'pathologist', label: 'Pathologist / Result Approver' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'inventory_manager', label: 'Inventory Manager' },
] as const;

type StatusMap = Record<string, { label: string; tone: BadgeTone }>;

export const ORDER_STATUS: StatusMap = {
  registered: { label: 'Registered', tone: 'neutral' },
  payment_pending: { label: 'Payment pending', tone: 'warning' },
  sample_pending: { label: 'Sample pending', tone: 'warning' },
  sample_collected: { label: 'Sample collected', tone: 'info' },
  processing: { label: 'Processing', tone: 'info' },
  results_pending: { label: 'Results pending', tone: 'info' },
  verification_pending: { label: 'Verification pending', tone: 'primary' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const SAMPLE_STATUS: StatusMap = {
  pending_collection: { label: 'Pending collection', tone: 'warning' },
  collected: { label: 'Collected', tone: 'info' },
  received: { label: 'Received', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'primary' },
  rejected: { label: 'Rejected', tone: 'danger' },
  processing: { label: 'Processing', tone: 'primary' },
  completed: { label: 'Completed', tone: 'success' },
};

export const RESULT_STATUS: StatusMap = {
  pending: { label: 'Not started', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'info' },
  submitted: { label: 'Awaiting verification', tone: 'primary' },
  correction_requested: { label: 'Correction requested', tone: 'warning' },
  rejected: { label: 'Re-test required', tone: 'danger' },
  approved: { label: 'Approved', tone: 'success' },
};

export const REPORT_STATUS: StatusMap = {
  final: { label: 'Final', tone: 'success' },
  interim: { label: 'Interim', tone: 'warning' },
  amended: { label: 'Amended', tone: 'info' },
  superseded: { label: 'Superseded', tone: 'danger' },
};

export const PRIORITY: StatusMap = {
  routine: { label: 'Routine', tone: 'outline' },
  urgent: { label: 'Urgent', tone: 'warning' },
  stat: { label: 'STAT', tone: 'danger' },
};

export const CONNECTION_STATE: StatusMap = {
  never_connected: { label: 'Never connected', tone: 'outline' },
  connected: { label: 'Connected', tone: 'success' },
  disconnected: { label: 'Disconnected', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
};

export const INTEGRATION_STATUS: StatusMap = {
  pending_documentation: { label: 'Pending vendor documentation', tone: 'warning' },
  configured: { label: 'Configured — not yet verified', tone: 'info' },
  verified: { label: 'Verified', tone: 'success' },
};

export const MESSAGE_STATUS: StatusMap = {
  received: { label: 'Received', tone: 'neutral' },
  parse_error: { label: 'Parse error', tone: 'danger' },
  unmatched: { label: 'Unmatched', tone: 'warning' },
  matched: { label: 'Matched — not applied', tone: 'info' },
  applied: { label: 'Applied as draft', tone: 'success' },
  duplicate: { label: 'Duplicate', tone: 'outline' },
  demo: { label: 'DEMO', tone: 'demo' },
};

export const HOME_STATUS: StatusMap = {
  requested: { label: 'Requested', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  assigned: { label: 'Assigned', tone: 'primary' },
  en_route: { label: 'En route', tone: 'warning' },
  collected: { label: 'Collected', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const FLAG_META: Record<string, { label: string; short: string; tone: BadgeTone }> = {
  normal: { label: 'Normal', short: '', tone: 'success' },
  low: { label: 'Low', short: 'L', tone: 'info' },
  high: { label: 'High', short: 'H', tone: 'danger' },
  critical_low: { label: 'Critical low', short: 'LL', tone: 'danger' },
  critical_high: { label: 'Critical high', short: 'HH', tone: 'danger' },
  abnormal: { label: 'Abnormal', short: 'A', tone: 'warning' },
  no_range: { label: 'No approved range', short: '', tone: 'outline' },
};

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'panel', label: 'Panel / insurance' },
] as const;

export const INVENTORY_CATEGORIES = [
  { value: 'reagent', label: 'Reagent' },
  { value: 'chemical', label: 'Chemical' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'tube', label: 'Collection tube' },
  { value: 'needle', label: 'Needle' },
  { value: 'gloves', label: 'Gloves' },
  { value: 'equipment_supply', label: 'Equipment supply' },
  { value: 'other', label: 'Other' },
] as const;

export const PROVINCES = ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad Capital Territory', 'Gilgit-Baltistan', 'Azad Jammu & Kashmir'];

export const ActivityIcon = Activity;
