import { Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/permissions';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, CurrentUser, RequirePermissions, ZodBody } from '../../decorators';
import { CreateUserDto, UpdateRoleDto, UpdateUserDto, UsersService } from './users.service';

@ApiTags('Staff & roles')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @RequirePermissions('users.read')
  list() {
    return this.users.list();
  }

  @Get('users/:uid')
  @RequirePermissions('users.read')
  get(@Param('uid') uid: string) {
    return this.users.get(uid);
  }

  @Get('users/:uid/activity')
  @RequirePermissions('users.read', 'audit.read')
  activity(@Param('uid') uid: string) {
    return this.users.activity(uid);
  }

  @Post('users')
  @RequirePermissions('users.manage')
  @ApiZodBody(CreateUserDto)
  create(@ZodBody(CreateUserDto) dto: z.infer<typeof CreateUserDto>, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Patch('users/:uid')
  @RequirePermissions('users.manage')
  @ApiZodBody(UpdateUserDto)
  update(@Param('uid') uid: string, @ZodBody(UpdateUserDto) dto: z.infer<typeof UpdateUserDto>, @CurrentUser() actor: AuthUser) {
    return this.users.update(uid, dto, actor);
  }

  @Get('roles')
  @RequirePermissions('users.read')
  async roles() {
    return { roles: await this.users.roles(), permissions: PERMISSIONS };
  }

  @Put('roles/:roleId')
  @RequirePermissions('roles.manage')
  @ApiZodBody(UpdateRoleDto)
  updateRole(@Param('roleId') roleId: string, @ZodBody(UpdateRoleDto) dto: z.infer<typeof UpdateRoleDto>, @CurrentUser() actor: AuthUser) {
    return this.users.updateRole(roleId, dto, actor);
  }
}
