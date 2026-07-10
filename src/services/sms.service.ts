import { Injectable, Logger } from '@nestjs/common';

/**
 * Contrato de envio de SMS. Uma futura integração real (Twilio, Zenvia, etc.)
 * implementa esta mesma interface e substitui o provider via injeção de dependência,
 * sem exigir nenhuma mudança no AlertEngineService.
 */
export interface SmsProvider {
  enviarSms(destinatario: string, mensagem: string): Promise<void>;
}

@Injectable()
export class SmsService implements SmsProvider {
  private readonly logger = new Logger(SmsService.name);

  /**
   * Stub: simula o envio via log estruturado. Troque o corpo deste método pela chamada
   * real ao provedor (ex.: `twilioClient.messages.create(...)`) mantendo a assinatura da interface.
   */
  async enviarSms(destinatario: string, mensagem: string): Promise<void> {
    this.logger.log(`[SMS SIMULADO] destinatario=${destinatario} mensagem="${mensagem}"`);
  }
}
