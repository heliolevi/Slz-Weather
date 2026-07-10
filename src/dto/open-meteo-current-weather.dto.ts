import { IsNumber } from 'class-validator';

/**
 * Contrato esperado do bloco "current"/"current_weather" da resposta da Open-Meteo.
 * Validado em runtime (class-validator) para que uma mudança de schema da API externa
 * vire um erro claro (422) em vez de propagar `undefined`/NaN silenciosamente pelo motor de regras.
 */
export class OpenMeteoCurrentWeatherDto {
  @IsNumber()
  temperature_2m: number;

  @IsNumber()
  relative_humidity_2m: number;

  @IsNumber()
  precipitation: number;

  @IsNumber()
  wind_speed_10m: number;

  @IsNumber()
  wind_gusts_10m: number;
}
