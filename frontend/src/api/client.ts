import type { RainTrendResult, WeatherAlert } from '../types/weather';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch {
    throw new ApiError('Não foi possível conectar à API. Verifique se o servidor está no ar.', 0);
  }

  if (!response.ok) {
    let message = `Falha ao consultar ${path} (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body?.message === 'string') message = body.message;
    } catch {
      // corpo não é JSON, mantém mensagem padrão
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const weatherApi = {
  getCurrentWeather: () => apiGet<WeatherAlert>('/clima/atual'),
  getAlertsHistory: () => apiGet<WeatherAlert[]>('/clima/alertas'),
  getEmergencies: () => apiGet<WeatherAlert[]>('/clima/emergencias'),
  getRainTrend: () => apiGet<RainTrendResult>('/clima/tendencia'),
};
