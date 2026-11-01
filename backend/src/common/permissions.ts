/**
 * Permission catalogue. Roles map to permission sets that Super Admins can
 * reconfigure at runtime (stored in the `roles` collection). Every sensitive
 * endpoint is guarded by one of these on the server.
 */
export const PERMISSIONS = {
  'patients.read': 'View patients and their history',
  'patients.write': 'Register and edit patients',
  'patients.archive': 'Archive patients',
  'doctors.read': 'View referring doctors',
  'doctors.write': 'Create and edit doctors',
  'tests.read': 'View test catalogue',
  'tests.write': 'Edit test catalogue, parameters and prices',
  'tests.approveRanges': 'Approve reference ranges (qualified professional)',
  'orders.read': 'View laboratory orders',
  'orders.create': 'Create laboratory orders',
  'orders.cancel': 'Cancel orders',
  'orders.discount': 'Apply discounts to orders',
  'samples.read': 'View samples',
  'samples.collect': 'Collect and receive samples',
  'samples.process': 'Accept, reject and process samples',
  'results.read': 'View results',
  'results.enter': 'Enter and submit results',
  'results.approve': 'Verify and approve results',
  'results.amend': 'Amend approved results',
  'reports.read': 'View reports',
  'reports.generate': 'Generate reports',
  'reports.print': 'Print / download reports',
  'billing.read': 'View invoices and payments',
  'billing.collect': 'Record payments',
  'billing.refund': 'Record refunds',
  'panels.read': 'View insurance / corporate panels',
  'panels.write': 'Manage insurance / corporate panels',
  'homeSampling.read': 'View home sampling requests',
  'homeSampling.write': 'Manage home sampling requests',
  'inventory.read': 'View inventory',
  'inventory.write': 'Manage inventory and stock movements',
  'analyzers.read': 'View analyzers and messages',
  'analyzers.write': 'Configure analyzers',
  'analyzers.match': 'Manually match analyzer results',
  'notifications.read': 'Receive notifications',
  'analytics.read': 'View analytics',
  'audit.read': 'View audit logs',
  'users.read': 'View staff accounts',
  'users.manage': 'Create and manage staff accounts',
  'roles.manage': 'Configure role permissions',
  'settings.read': 'View laboratory settings',
  'settings.write': 'Change laboratory settings',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_IDS = [
  'super_admin',
  'lab_admin',
  'receptionist',
  'lab_technician',
  'pathologist',
  'accountant',
  'inventory_manager',
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export const ROLE_LABELS: Record<RoleId, string> = {
  super_admin: 'Super Admin',
  lab_admin: 'Lab Administrator',
  receptionist: 'Receptionist',
  lab_technician: 'Lab Technician',
  pathologist: 'Pathologist / Result Approver',
  accountant: 'Accountant',
  inventory_manager: 'Inventory Manager',
};

const read: Permission[] = ['notifications.read'];

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleId, Permission[]> = {
  super_admin: [...ALL_PERMISSIONS],
  lab_admin: ALL_PERMISSIONS.filter((p) => !['roles.manage', 'results.approve', 'results.amend'].includes(p)),
  receptionist: [
    ...read,
    'patients.read',
    'patients.write',
    'doctors.read',
    'doctors.write',
    'tests.read',
    'orders.read',
    'orders.create',
    'samples.read',
    'samples.collect',
    'reports.read',
    'reports.print',
    'billing.read',
    'billing.collect',
    'panels.read',
    'homeSampling.read',
    'homeSampling.write',
  ],
  lab_technician: [
    ...read,
    'patients.read',
    'tests.read',
    'orders.read',
    'samples.read',
    'samples.collect',
    'samples.process',
    'results.read',
    'results.enter',
    'reports.read',
    'analyzers.read',
    'analyzers.match',
    'inventory.read',
  ],
  pathologist: [
    ...read,
    'patients.read',
    'doctors.read',
    'tests.read',
    'tests.approveRanges',
    'orders.read',
    'samples.read',
    'results.read',
    'results.approve',
    'results.amend',
    'reports.read',
    'reports.generate',
    'reports.print',
    'analyzers.read',
    'analytics.read',
  ],
  accountant: [
    ...read,
    'patients.read',
    'doctors.read',
    'orders.read',
    'billing.read',
    'billing.collect',
    'billing.refund',
    'panels.read',
    'panels.write',
    'analytics.read',
    'orders.discount',
  ],
  inventory_manager: [...read, 'inventory.read', 'inventory.write', 'analytics.read'],
};

/** Permissions that can never be removed from Super Admin (prevents lock-out). */
export const SUPER_ADMIN_LOCKED: Permission[] = ['users.manage', 'roles.manage', 'users.read'];
