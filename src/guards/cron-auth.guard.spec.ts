import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronAuthGuard } from './cron-auth.guard';

function createContext(authHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: authHeader !== undefined ? { authorization: authHeader } : {} }),
    }),
  } as unknown as ExecutionContext;
}

describe('CronAuthGuard', () => {
  it('deve rejeitar (401) quando CRON_SECRET não está configurado, mesmo com header correto por acaso', () => {
    const configService = { get: jest.fn().mockReturnValue('') } as unknown as ConfigService;
    const guard = new CronAuthGuard(configService);

    expect(() => guard.canActivate(createContext('Bearer qualquer-coisa'))).toThrow(UnauthorizedException);
  });

  it('deve rejeitar (401) quando o header Authorization está ausente', () => {
    const configService = { get: jest.fn().mockReturnValue('segredo-correto') } as unknown as ConfigService;
    const guard = new CronAuthGuard(configService);

    expect(() => guard.canActivate(createContext(undefined))).toThrow(UnauthorizedException);
  });

  it('deve rejeitar (401) quando o token não bate com CRON_SECRET', () => {
    const configService = { get: jest.fn().mockReturnValue('segredo-correto') } as unknown as ConfigService;
    const guard = new CronAuthGuard(configService);

    expect(() => guard.canActivate(createContext('Bearer token-errado'))).toThrow(UnauthorizedException);
  });

  it('deve permitir (true) quando o token bate exatamente com CRON_SECRET', () => {
    const configService = { get: jest.fn().mockReturnValue('segredo-correto') } as unknown as ConfigService;
    const guard = new CronAuthGuard(configService);

    expect(guard.canActivate(createContext('Bearer segredo-correto'))).toBe(true);
  });
});
