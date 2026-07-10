import { IsNumber, Max, Min } from 'class-validator';

/**
 * Contrato esperado do bloco "current"/"current_weather" da resposta da Open-Meteo.
 * Validado em runtime (class-validator) para que uma mudança de schema da API externa
 * vire um erro claro (422) em vez de propagar `undefined`/NaN silenciosamente pelo motor de regras.
 *
 * Os limites Min/Max não são só "tipo correto" — são faixas fisicamente plausíveis para São Luís/Terra.
 * Um payload corrompido (ex.: vento negativo, rajada de 9999km/h) nunca deveria virar um alerta de
 * EMERGÊNCIA; com esses limites, ele é rejeitado (422) antes de chegar ao motor de regras.
 */
export class OpenMeteoCurrentWeatherDto {
  @IsNumber()
  @Min(-20)
  @Max(60)
  temperature_2m: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  relative_humidity_2m: number;

  @IsNumber()
  @Min(0)
  @Max(500)
  precipitation: number;

  @IsNumber()
  @Min(0)
  @Max(400)
  wind_speed_10m: number;

  @IsNumber()
  @Min(0)
  @Max(400)
  wind_gusts_10m: number;
}
