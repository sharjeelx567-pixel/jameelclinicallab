import { Injectable } from '@nestjs/common';
import type { RoleDoc, UserDoc } from '../../common/entities';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, Permission, ROLE_IDS, ROLE_LABELS, RoleId } from '../../common/permissions';
import type { AuthUser } from '../../common/types';
import { C, DataStore } from '../../database/data-store';

/**
 * Database read quota: every API request needs the caller's profile and role permissions.
 *  - Requests that only READ data (GET) reuse them for up to 60 s.
 *  - Requests that CHANGE data always re-read the profile, and use role permissions at
 *    most 15 s old, so a removed role or disabled profile can never write.
 * A disabled account is also refused by Firebase Authentication on every request
 * (verifyIdToken with checkRevoked), independently of these copies. They live only in
 * this server process and are cleared here when users or roles are changed.
 */
const READ_TTL_MS = 60_000;
const WRITE_ROLE_TTL_MS = 15_000;

@Injectable()
export class AccessService {
  private roleCache = new Map<RoleId, { permissions: Permission[]; at: number }>();
  private userCache = new Map<string, { doc: UserDoc | null; at: number }>();

  constructor(private readonly store: DataStore) {}

  invalidateRoleCache(): void {
    this.roleCache.clear();
  }

  /** Call after a user's profile/role/status/photo changes. */
  invalidateUser(uid?: string): void {
    if (uid) this.userCache.delete(uid);
    else this.userCache.clear();
  }

  async permissionsFor(role: RoleId, maxAgeMs = WRITE_ROLE_TTL_MS): Promise<Permission[]> {
    const cached = this.roleCache.get(role);
    if (cached && Date.now() - cached.at < maxAgeMs) return cached.permissions;
    const doc = await this.store.get<RoleDoc>(C.roles, role);
    const permissions = (doc?.permissions ?? DEFAULT_ROLE_PERMISSIONS[role] ?? []).filter((p) =>
      ALL_PERMISSIONS.includes(p),
    );
    this.roleCache.set(role, { permissions, at: Date.now() });
    return permissions;
  }

  /** The stored profile; `fresh` forces a database read. */
  async userDoc(uid: string, fresh = false): Promise<UserDoc | null> {
    const hit = this.userCache.get(uid);
    if (!fresh && hit && Date.now() - hit.at < READ_TTL_MS) return hit.doc;
    const doc = await this.store.get<UserDoc>(C.users, uid);
    if (this.userCache.size > 500) this.userCache.clear();
    this.userCache.set(uid, { doc, at: Date.now() });
    return doc;
  }

  /** `fresh` = the request changes data: profile re-read, role permissions at most 15 s old. */
  async loadAuthUser(uid: string, fresh = true): Promise<AuthUser | null> {
    const user = await this.userDoc(uid, fresh);
    if (!user || user.status !== 'active' || !ROLE_IDS.includes(user.role)) return null;
    return {
      uid: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      permissions: await this.permissionsFor(user.role, fresh ? WRITE_ROLE_TTL_MS : READ_TTL_MS),
      branchId: user.branchId,
    };
  }

  async listRoles(): Promise<RoleDoc[]> {
    return Promise.all(
      ROLE_IDS.map(async (id) => {
        const doc = await this.store.get<RoleDoc>(C.roles, id);
        return doc ?? { id, label: ROLE_LABELS[id], permissions: DEFAULT_ROLE_PERMISSIONS[id], updatedAt: '' };
      }),
    );
  }
}
