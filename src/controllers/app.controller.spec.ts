import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { WeatherService } from '../services/weather.service';

describe('AppController', () => {
  let appController: AppController;
  let weatherService: { evaluateAndPersistCurrentWeather: jest.Mock };

  beforeEach(async () => {
    weatherService = {
      evaluateAndPersistCurrentWeather: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: WeatherService, useValue: weatherService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('deve retornar o alerta climático atual produzido pelo WeatherService', async () => {
      const mockAlert = {
        cidade: 'São Luís - MA',
        tipoAlerta: 'NORMAL',
        descricao: 'Condições climáticas estáveis. Situação segura para a população.',
        nivelSeveridade: 'INFORMATIVO',
        zonasAfetadas: [],
      };
      weatherService.evaluateAndPersistCurrentWeather.mockResolvedValue(mockAlert);

      const result = await appController.getCurrentWeather();

      expect(weatherService.evaluateAndPersistCurrentWeather).toHaveBeenCalled();
      expect(result).toEqual(mockAlert);
    });
  });
});
