import { Injectable } from '@nestjs/common';
import type { RoleDoc, UserDoc } from '../../common/entities';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, Permission, ROLE_IDS, ROLE_LABELS, RoleId } from '../../common/permissions';
import type { AuthUser } from '../../common/types';
import { C, DataStore } from '../../database/data-store';

const ROLE_CACHE_MS = 15_000;

/** Resolves the authenticated staff member and their CURRENT role permissions. */
@Injectable()
export class AccessService {
  private roleCache = new Map<RoleId, { permissions: Permission[]; at: number }>();

  constructor(private readonly store: DataStore) {}

  invalidateRoleCache(): void {
    this.roleCache.clear();
  }

  async permissionsFor(role: RoleId): Promise<Permission[]> {
    const cached = this.roleCache.get(role);
    if (cached && Date.now() - cached.at < ROLE_CACHE_MS) return cached.permissions;
    const doc = await this.store.get<RoleDoc>(C.roles, role);
    const permissions = (doc?.permissions ?? DEFAULT_ROLE_PERMISSIONS[role] ?? []).filter((p) =>
      ALL_PERMISSIONS.includes(p),
    );
    this.roleCache.set(role, { permissions, at: Date.now() });
    return permissions;
  }

  async loadAuthUser(uid: string): Promise<AuthUser | null> {
    const user = await this.store.get<UserDoc>(C.users, uid);
    if (!user || user.status !== 'active' || !ROLE_IDS.includes(user.role)) return null;
    return {
      uid: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      permissions: await this.permissionsFor(user.role),
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
