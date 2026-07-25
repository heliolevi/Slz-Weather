import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Protege os endpoints de cron (`/cron/*`): só aceita requisições com o header
 * `Authorization: Bearer <CRON_SECRET>`. É exatamente o header que a Vercel injeta automaticamente
 * nas chamadas de Cron Jobs quando `CRON_SECRET` está configurado nas variáveis de ambiente do
 * projeto — qualquer outro disparador (GitHub Actions, curl manual) precisa enviar o mesmo header.
 *
 * Sem essa proteção, qualquer um poderia bater em /cron/motor-alertas e forçar o disparo de SMS
 * pra Defesa Civil repetidamente — bem mais sensível do que só reexecutar a análise climática
 * (que já é pública, com rate limit, em /clima/atual).
 */
@Injectable()
export class CronAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const cronSecret = this.configService.get<string>('CRON_SECRET', '');

    if (!cronSecret) {
      // Sem CRON_SECRET configurado, os endpoints de cron ficam desabilitados por padrão —
      // mais seguro do que aceitar qualquer requisição sem autenticação por engano.
      throw new UnauthorizedException('CRON_SECRET não configurado — endpoints de cron desabilitados.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (authHeader !== `Bearer ${cronSecret}`) {
      throw new UnauthorizedException('Token de autenticação de cron inválido.');
    }

    return true;
  }
}
