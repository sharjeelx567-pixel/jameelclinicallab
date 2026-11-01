import { Controller, Get, HttpCode, Module, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, ApiZodQuery, BridgeOnly, CurrentUser, RequirePermissions, ZodBody, ZodQuery } from '../../decorators';
import { BridgeGuard, BridgeRequest } from '../../guards/bridge.guard';
import { patchOf, requiredText } from '../../utils';
import { ResultsModule } from '../results/results.module';
import { AnalyzerDto, AnalyzersService, BridgeMessageDto, HeartbeatDto, MessageQuery } from './analyzers.service';

const PartialAnalyzer = patchOf(AnalyzerDto);
const MatchDto = z.object({ sampleNumber: requiredText(40).transform((s) => s.toUpperCase()) });

@ApiTags('Analyzers')
@ApiBearerAuth()
@Controller('analyzers')
@UseGuards(BridgeGuard)
export class AnalyzersController {
  constructor(private readonly analyzers: AnalyzersService) {}

  // ── Machine-bridge endpoints (device token auth) ──
  @BridgeOnly()
  @Post('bridge/heartbeat')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Bridge-Id', required: true })
  @ApiZodBody(HeartbeatDto)
  heartbeat(@Req() req: BridgeRequest, @ZodBody(HeartbeatDto) dto: z.infer<typeof HeartbeatDto>) {
    return this.analyzers.heartbeat(req.bridgeId!, dto);
  }

  @BridgeOnly()
  @Post('bridge/messages')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Bridge-Id', required: true })
  @ApiZodBody(BridgeMessageDto)
  ingest(@Req() req: BridgeRequest, @ZodBody(BridgeMessageDto) dto: z.infer<typeof BridgeMessageDto>) {
    return this.analyzers.ingest(req.bridgeId!, dto);
  }

  /** Bridge pulls its analyzer configuration (no secrets). */
  @BridgeOnly()
  @Get('bridge/config')
  async bridgeConfig(@Req() req: BridgeRequest) {
    return (await this.analyzers.list())
      .filter((a) => a.bridgeId === req.bridgeId && a.enabled)
      .map((a) => ({ id: a.id, name: a.name, mode: a.mode, protocol: a.protocol, connectionType: a.connectionType, host: a.host, port: a.port, serialPort: a.serialPort, baudRate: a.baudRate }));
  }

  // ── Staff endpoints ──
  @Get()
  @RequirePermissions('analyzers.read')
  list() {
    return this.analyzers.list();
  }

  @Get('messages')
  @RequirePermissions('analyzers.read')
  @ApiZodQuery(MessageQuery)
  messages(@ZodQuery(MessageQuery) q: z.infer<typeof MessageQuery>) {
    return this.analyzers.messages(q);
  }

  @Get('messages/:id')
  @RequirePermissions('analyzers.read')
  message(@Param('id') id: string) {
    return this.analyzers.message(id);
  }

  @Post('messages/:id/match')
  @RequirePermissions('analyzers.match')
  @ApiZodBody(MatchDto)
  match(@Param('id') id: string, @ZodBody(MatchDto) dto: z.infer<typeof MatchDto>, @CurrentUser() u: AuthUser) {
    return this.analyzers.manualMatch(id, dto.sampleNumber, u);
  }

  @Get(':id')
  @RequirePermissions('analyzers.read')
  get(@Param('id') id: string) {
    return this.analyzers.get(id);
  }

  @Post()
  @RequirePermissions('analyzers.write')
  @ApiZodBody(AnalyzerDto)
  create(@ZodBody(AnalyzerDto) dto: z.infer<typeof AnalyzerDto>, @CurrentUser() u: AuthUser) {
    return this.analyzers.create(dto, u);
  }

  @Patch(':id')
  @RequirePermissions('analyzers.write')
  @ApiZodBody(PartialAnalyzer)
  update(@Param('id') id: string, @ZodBody(PartialAnalyzer) dto: z.infer<typeof PartialAnalyzer>, @CurrentUser() u: AuthUser) {
    return this.analyzers.update(id, dto, u);
  }
}

@Module({ imports: [ResultsModule], controllers: [AnalyzersController], providers: [AnalyzersService] })
export class AnalyzersModule {}
