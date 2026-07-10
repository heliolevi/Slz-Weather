import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ALERT_ENGINE_STATE_ID, AlertEngineState, EstadoAlerta } from '../schemas/alert-engine-state.schema';
import { AlertEngineService } from './alert-engine.service';
import { SmsService } from './sms.service';
import { WeatherService } from './weather.service';

const NUMERO_DESTINO = '+5598900000000';

describe('AlertEngineService', () => {
  let service: AlertEngineService;
  let weatherService: { getCurrentWeatherReading: jest.Mock };
  let smsService: { enviarSms: jest.Mock };
  let alertStateModel: { findOneAndUpdate: jest.Mock };
  let estadoPersistidoSimulado: EstadoAlerta;

  const simularLeituraDeVento = (windSpeed: number) => {
    weatherService.getCurrentWeatherReading.mockResolvedValue({
      temperature_2m: 28,
      relative_humidity_2m: 80,
      precipitation: 1,
      wind_speed_10m: windSpeed,
      wind_gusts_10m: windSpeed,
    });
  };

  beforeEach(async () => {
    estadoPersistidoSimulado = 'NORMAL';

    weatherService = { getCurrentWeatherReading: jest.fn() };
    smsService = { enviarSms: jest.fn().mockResolvedValue(undefined) };

    // Simula o comportamento de upsert do Mongo sobre o documento singleton de estado:
    // a primeira chamada de cada ciclo é sempre a "leitura" ($setOnInsert), a segunda é a "escrita".
    alertStateModel = {
      findOneAndUpdate: jest.fn((_filter: unknown, update: any) => {
        if (update.$setOnInsert) {
          return {
            exec: () =>
              Promise.resolve({
                identificador: ALERT_ENGINE_STATE_ID,
                currentState: estadoPersistidoSimulado,
                updatedAt: new Date(),
              }),
          };
        }

        estadoPersistidoSimulado = update.currentState;
        return { exec: () => Promise.resolve({ ...update }) };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertEngineService,
        { provide: WeatherService, useValue: weatherService },
        { provide: SmsService, useValue: smsService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(NUMERO_DESTINO) } },
        { provide: getModelToken(AlertEngineState.name), useValue: alertStateModel },
      ],
    }).compile();

    service = module.get<AlertEngineService>(AlertEngineService);
  });

  describe('Sem SMS Fantasma', () => {
    it('não deve disparar um segundo SMS enquanto o estado EMERGENCIA persistir entre ciclos', async () => {
      simularLeituraDeVento(70); // > 60km/h => EMERGENCIA

      await service.avaliarEEmitirAlertas();
      await service.avaliarEEmitirAlertas();
      await service.avaliarEEmitirAlertas();

      expect(smsService.enviarSms).toHaveBeenCalledTimes(1);
      expect(smsService.enviarSms).toHaveBeenCalledWith(NUMERO_DESTINO, expect.stringContaining('EMERGÊNCIA'));
    });

    it('não deve disparar SMS quando o vento permanece em NORMAL entre ciclos', async () => {
      simularLeituraDeVento(15);

      await service.avaliarEEmitirAlertas();
      await service.avaliarEEmitirAlertas();

      expect(smsService.enviarSms).not.toHaveBeenCalled();
    });
  });

  describe('Transição de estado - subida', () => {
    it('deve notificar cada degrau da subida: NORMAL -> ATENCAO -> EMERGENCIA', async () => {
      simularLeituraDeVento(20); // NORMAL, igual ao estado inicial persistido
      await service.avaliarEEmitirAlertas();
      expect(smsService.enviarSms).not.toHaveBeenCalled();

      simularLeituraDeVento(45); // ATENCAO
      await service.avaliarEEmitirAlertas();

      simularLeituraDeVento(70); // EMERGENCIA
      await service.avaliarEEmitirAlertas();

      expect(smsService.enviarSms).toHaveBeenCalledTimes(2);
      expect(smsService.enviarSms).toHaveBeenNthCalledWith(1, NUMERO_DESTINO, expect.stringContaining('ATENÇÃO'));
      expect(smsService.enviarSms).toHaveBeenNthCalledWith(2, NUMERO_DESTINO, expect.stringContaining('EMERGÊNCIA'));
      expect(estadoPersistidoSimulado).toBe('EMERGENCIA');
    });
  });

  describe('Transição de estado - descida (onde a maioria dos bugs de lógica acontece)', () => {
    it('deve notificar a volta direta de EMERGENCIA para NORMAL', async () => {
      estadoPersistidoSimulado = 'EMERGENCIA';

      simularLeituraDeVento(10); // NORMAL

      await service.avaliarEEmitirAlertas();

      expect(smsService.enviarSms).toHaveBeenCalledTimes(1);
      expect(smsService.enviarSms).toHaveBeenCalledWith(NUMERO_DESTINO, expect.stringContaining('normalizada'));
      expect(estadoPersistidoSimulado).toBe('NORMAL');
    });

    it('deve notificar cada degrau da descida: EMERGENCIA -> ATENCAO -> NORMAL', async () => {
      estadoPersistidoSimulado = 'EMERGENCIA';

      simularLeituraDeVento(45); // ATENCAO
      await service.avaliarEEmitirAlertas();

      simularLeituraDeVento(10); // NORMAL
      await service.avaliarEEmitirAlertas();

      expect(smsService.enviarSms).toHaveBeenCalledTimes(2);
      expect(smsService.enviarSms).toHaveBeenNthCalledWith(1, NUMERO_DESTINO, expect.stringContaining('ATENÇÃO'));
      expect(smsService.enviarSms).toHaveBeenNthCalledWith(2, NUMERO_DESTINO, expect.stringContaining('normalizada'));
    });
  });

  describe('Segurança de Restart', () => {
    it('não deve reenviar SMS na primeira execução após reiniciar se o estado persistido já reflete a leitura atual', async () => {
      // Simula um restart do servidor: o Mongo já tinha um estado ATENCAO salvo de antes da queda.
      estadoPersistidoSimulado = 'ATENCAO';

      simularLeituraDeVento(45); // leitura atual ainda corresponde a ATENCAO

      await service.avaliarEEmitirAlertas();

      expect(smsService.enviarSms).not.toHaveBeenCalled();
    });

    it('deve detectar corretamente uma transição real já na primeira execução após reiniciar', async () => {
      // Servidor reiniciou com EMERGENCIA salva; a tempestade passou enquanto o processo estava fora do ar.
      estadoPersistidoSimulado = 'EMERGENCIA';

      simularLeituraDeVento(10); // NORMAL

      await service.avaliarEEmitirAlertas();

      expect(smsService.enviarSms).toHaveBeenCalledTimes(1);
      expect(smsService.enviarSms).toHaveBeenCalledWith(NUMERO_DESTINO, expect.stringContaining('normalizada'));
    });
  });

  describe('Falha na leitura climática (fail-safe, sem falhar em silêncio de forma perigosa)', () => {
    it('não deve enviar SMS nem tocar no estado persistido quando a leitura climática falhar', async () => {
      weatherService.getCurrentWeatherReading.mockRejectedValue(new Error('Falha ao consultar a Open-Meteo'));

      await service.avaliarEEmitirAlertas();

      expect(smsService.enviarSms).not.toHaveBeenCalled();
      expect(alertStateModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
