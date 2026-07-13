export type TipoAlerta =
  | 'VENTANIA'
  | 'CHUVA_FORTE'
  | 'TEMPORAL'
  | 'TERREMOTO'
  | 'NORMAL';

export type NivelSeveridade =
  | 'INFORMATIVO'
  | 'ATENÇÃO'
  | 'ALERTA'
  | 'EMERGÊNCIA';

export interface WeatherAlert {
  id: string;
  cidade: string;
  tipoAlerta: TipoAlerta;
  descricao: string;
  nivelSeveridade: NivelSeveridade;
  acaoPreventiva: string;
  velocidadeVento: number;
  precipitacao: number;
  temperatura: number;
  timestamp: string;
  zonasAfetadas: string[];
}

export interface RainTrendResult {
  riscoInundacaoSubita: boolean;
  mediaChuva: number;
  mensagem: string;
}

export const CONTINGENCY_PREFIX = '[MODO CONTINGÊNCIA - DADO EM CACHE]';

export function parseContingency(descricao: string): {
  emContingencia: boolean;
  descricaoLimpa: string;
} {
  if (descricao.startsWith(CONTINGENCY_PREFIX)) {
    return {
      emContingencia: true,
      descricaoLimpa: descricao.slice(CONTINGENCY_PREFIX.length).trim(),
    };
  }
  return { emContingencia: false, descricaoLimpa: descricao };
}
