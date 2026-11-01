import { Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, ApiZodQuery, CurrentUser, RequirePermissions, ZodBody, ZodQuery } from '../../decorators';
import { pkMobile, requiredText, cnic } from '../../utils';
import type { UploadedBinary } from '../settings/storage.service';
import { CreatePatientDto, PatientQuery, PatientsService, UpdatePatientDto } from './patients.service';
import { Idempotent } from '../../interceptors/idempotency.interceptor';

const ArchiveDto = z.object({ archived: z.boolean(), reason: requiredText(300) });
const DuplicateCheckDto = z.object({ name: requiredText(100), mobile: pkMobile, cnic: cnic.optional() });

@ApiTags('Patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @RequirePermissions('patients.read')
  @ApiZodQuery(PatientQuery)
  list(@ZodQuery(PatientQuery) q: z.infer<typeof PatientQuery>) {
    return this.patients.list(q);
  }

  @Post('duplicate-check')
  @RequirePermissions('patients.write')
  @ApiZodBody(DuplicateCheckDto)
  duplicateCheck(@ZodBody(DuplicateCheckDto) dto: z.infer<typeof DuplicateCheckDto>) {
    return this.patients.findDuplicates(dto);
  }

  @Post()
  @Idempotent()
  @RequirePermissions('patients.write')
  @ApiZodBody(CreatePatientDto)
  create(@ZodBody(CreatePatientDto) dto: z.infer<typeof CreatePatientDto>, @CurrentUser() user: AuthUser) {
    return this.patients.create(dto, user);
  }

  @Get(':id')
  @RequirePermissions('patients.read')
  async get(@Param('id') id: string) {
    const { searchTokens: _t, ...p } = await this.patients.get(id);
    return p;
  }

  @Get(':id/history')
  @RequirePermissions('patients.read')
  history(@Param('id') id: string) {
    return this.patients.history(id);
  }

  @Patch(':id')
  @RequirePermissions('patients.write')
  @ApiZodBody(UpdatePatientDto)
  update(@Param('id') id: string, @ZodBody(UpdatePatientDto) dto: z.infer<typeof UpdatePatientDto>, @CurrentUser() user: AuthUser) {
    return this.patients.update(id, dto, user);
  }

  @Post(':id/archive')
  @RequirePermissions('patients.archive')
  @ApiZodBody(ArchiveDto)
  archive(@Param('id') id: string, @ZodBody(ArchiveDto) dto: z.infer<typeof ArchiveDto>, @CurrentUser() user: AuthUser) {
    return this.patients.setArchived(id, dto.archived, dto.reason, user);
  }

  @Post(':id/attachments')
  @RequirePermissions('patients.write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * 1024 * 1024, files: 1 } }))
  attach(@Param('id') id: string, @UploadedFile() file: UploadedBinary | undefined, @CurrentUser() user: AuthUser) {
    return this.patients.addAttachment(id, file, user);
  }
}
