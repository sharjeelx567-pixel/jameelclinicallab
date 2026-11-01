import type { Permission, RoleId } from './permissions';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  role: RoleId;
  permissions: Permission[];
  branchId?: string;
}

export interface AuditActor {
  uid: string;
  name: string;
  /** 'system' / 'bridge' for automated actions (e.g. analyzer message intake). */
  role: RoleId | 'system' | 'bridge';
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export const toActor = (u: AuthUser): AuditActor => ({ uid: u.uid, name: u.displayName, role: u.role });
