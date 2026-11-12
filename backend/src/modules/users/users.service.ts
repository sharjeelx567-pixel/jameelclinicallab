import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { RoleDoc, UserDoc } from '../../common/entities';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import { ALL_PERMISSIONS, Permission, ROLE_IDS, ROLE_LABELS, RoleId, SUPER_ADMIN_LOCKED } from '../../common/permissions';
import { AuthUser, toActor } from '../../common/types';
import { getEnv } from '../../config/env';
import { C, DataStore } from '../../database/data-store';
import { FirebaseService } from '../../firebase/firebase.service';
import { optionalText, requiredText } from '../../utils';
import { AccessService } from '../auth/access.service';
import { AuditService } from '../audit-logs/audit.service';

export const CreateUserDto = z.object({
  email: z.email().max(120).transform((e) => e.toLowerCase()),
  displayName: requiredText(80),
  role: z.enum(ROLE_IDS),
  phone: optionalText(20),
  department: optionalText(60),
  branchId: optionalText(40),
  /** Initial password; the staff member should change it after first sign-in. */
  initialPassword: z.string().min(10, 'At least 10 characters').max(128),
});

export const UpdateUserDto = z.object({
  displayName: requiredText(80).optional(),
  role: z.enum(ROLE_IDS).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  phone: optionalText(20),
  department: optionalText(60),
  branchId: optionalText(40),
});

export const UpdateRoleDto = z.object({
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])).max(ALL_PERMISSIONS.length),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly store: DataStore,
    private readonly firebase: FirebaseService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserDoc[]> {
    const res = await this.store.query<UserDoc>(C.users, { orderBy: { field: 'displayName' } });
    return res.items;
  }

  async get(uid: string): Promise<UserDoc> {
    const u = await this.store.get<UserDoc>(C.users, uid);
    if (!u) throw notFound('Staff account');
    return u;
  }

  async create(dto: z.infer<typeof CreateUserDto>, actor: AuthUser): Promise<UserDoc> {
    const existing = await this.store.query<UserDoc>(C.users, { where: [{ field: 'email', op: '==', value: dto.email }], limit: 1 });
    if (existing.items.length) throw conflict('EMAIL_IN_USE', 'A staff account with this email already exists');

    let uid: string;
    if (getEnv().AUTH_MODE === 'firebase') {
      try {
        const record = await this.firebase.auth.createUser({
          email: dto.email,
          password: dto.initialPassword,
          displayName: dto.displayName,
          disabled: false,
        });
        uid = record.uid;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'auth/email-already-exists') throw conflict('EMAIL_IN_USE', 'This email is already registered in Firebase Authentication');
        throw err;
      }
    } else {
      uid = `dev-${this.store.newId().slice(0, 10)}`;
    }

    const now = this.store.now();
    const user: UserDoc = {
      id: uid,
      email: dto.email,
      displayName: dto.displayName,
      role: dto.role,
      status: 'active',
      phone: dto.phone,
      department: dto.department,
      branchId: dto.branchId,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.create(C.users, uid, user);
    this.access.invalidateUser(uid);
    await this.audit.record({ action: 'user.create', entity: 'user', entityId: uid, actor: toActor(actor), changes: { role: dto.role } });
    return user;
  }

  async update(uid: string, dto: z.infer<typeof UpdateUserDto>, actor: AuthUser): Promise<UserDoc> {
    const user = await this.get(uid);
    if (uid === actor.uid && (dto.role || dto.status === 'disabled'))
      throw forbidden('You cannot change your own role or disable your own account');
    if (user.role === 'super_admin' && actor.role !== 'super_admin') throw forbidden('Only a Super Admin can modify a Super Admin');
    if (dto.role === 'super_admin' && actor.role !== 'super_admin') throw forbidden('Only a Super Admin can grant Super Admin');

    const patch = { ...dto, updatedAt: this.store.now() };
    await this.store.update(C.users, uid, patch);
    this.access.invalidateUser(uid);

    if (getEnv().AUTH_MODE === 'firebase' && dto.status) {
      await this.firebase.auth.updateUser(uid, { disabled: dto.status === 'disabled' });
      if (dto.status === 'disabled') await this.firebase.auth.revokeRefreshTokens(uid);
    }
    await this.audit.record({
      action: dto.role ? 'user.role_change' : 'user.update',
      entity: 'user',
      entityId: uid,
      actor: toActor(actor),
      changes: { ...(dto.role && { role: { from: user.role, to: dto.role } }), ...(dto.status && { status: { from: user.status, to: dto.status } }) },
    });
    return { ...user, ...patch };
  }

  roles(): Promise<RoleDoc[]> {
    return this.access.listRoles();
  }

  async updateRole(roleId: string, dto: z.infer<typeof UpdateRoleDto>, actor: AuthUser): Promise<RoleDoc> {
    if (!ROLE_IDS.includes(roleId as RoleId)) throw notFound('Role');
    const id = roleId as RoleId;
    const permissions = [...new Set(dto.permissions)];
    if (id === 'super_admin') {
      const missing = SUPER_ADMIN_LOCKED.filter((p) => !permissions.includes(p));
      if (missing.length) throw badRequest('LOCKED_PERMISSION', `Super Admin must keep: ${missing.join(', ')}`);
    }
    const before = (await this.access.listRoles()).find((r) => r.id === id);
    const doc: RoleDoc = { id, label: ROLE_LABELS[id], permissions, updatedAt: this.store.now(), updatedBy: actor.uid };
    await this.store.set(C.roles, id, doc);
    this.access.invalidateRoleCache();
    await this.audit.record({
      action: 'role.permissions_change',
      entity: 'role',
      entityId: id,
      actor: toActor(actor),
      changes: {
        added: permissions.filter((p) => !before?.permissions.includes(p)),
        removed: (before?.permissions ?? []).filter((p) => !permissions.includes(p)),
      },
    });
    return doc;
  }

  async activity(uid: string) {
    const res = await this.store.query(C.auditLogs, {
      where: [{ field: 'actor.uid', op: '==', value: uid }],
      orderBy: { field: 'at', direction: 'desc' },
      limit: 50,
    });
    return res.items;
  }
}
