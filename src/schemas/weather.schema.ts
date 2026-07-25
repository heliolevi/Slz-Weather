import { ApiProperty } from '@nestjs/swagger';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WeatherAlertDocument = WeatherAlert & Document;

@Schema({
  timestamps: false,
  collection: 'weather_alerts',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class WeatherAlert {
  @ApiProperty({ description: 'Identificador único do alerta gerado pelo MongoDB.' })
  id?: string;

  @ApiProperty({ example: 'São Luís - MA', description: 'Cidade monitorada pelo sistema de alerta precoce.' })
  @Prop({ required: true })
  cidade: string;

  @ApiProperty({ example: 'VENTANIA', description: 'Categoria técnica do evento detectado.' })
  @Prop({
    required: true,
    enum: ['VENTANIA', 'CHUVA_FORTE', 'TEMPORAL', 'TERREMOTO', 'NORMAL'],
  })
  tipoAlerta: string;

  @ApiProperty({
    example: 'Ventos fortes na Litorânea. Mantenha distância de áreas costeiras.',
    description: 'Descrição detalhada da ameaça e do comportamento esperado para a população.',
  })
  @Prop({ required: true })
  descricao: string;

  @ApiProperty({ example: 'EMERGÊNCIA', description: 'Nível de severidade do alerta para tomada de decisão civil.' })
  @Prop({
    required: true,
    enum: ['INFORMATIVO', 'ATENÇÃO', 'ALERTA', 'EMERGÊNCIA'],
  })
  nivelSeveridade: string;

  @ApiProperty({
    example: 'Busque abrigo seguro imediatamente e evite deslocamentos desnecessários.',
    description: 'Ação preventiva recomendada para reduzir riscos imediatos.',
  })
  @Prop({ required: true })
  acaoPreventiva: string;

  @ApiProperty({ example: 32.5, description: 'Velocidade do vento medida em km/h.' })
  @Prop({ required: true })
  velocidadeVento: number;

  @ApiProperty({ example: 6.8, description: 'Quantidade de precipitação em mm.' })
  @Prop({ required: true })
  precipitacao: number;

  @ApiProperty({ example: 28.4, description: 'Temperatura atual em graus Celsius.' })
  @Prop({ required: true })
  temperatura: number;

  @ApiProperty({ example: '2026-07-09T12:00:00.000Z', description: 'Momento exato em que o alerta foi gerado.' })
  @Prop({ required: true, default: () => new Date() })
  timestamp: Date;

  @ApiProperty({
    example: ['Orla Marítima', 'Península', 'Avenida Litorânea'],
    description: 'Bairros e zonas geograficamente afetadas, calculados por geofencing lógico a partir do tipo e severidade do alerta.',
  })
  @Prop({ type: [String], default: [] })
  zonasAfetadas: string[];
}

export const WeatherAlertSchema = SchemaFactory.createForClass(WeatherAlert);

// `timestamp` é o campo mais consultado da coleção: toda leitura de /clima/alertas, /clima/emergencias
// e /clima/tendencia ordena e/ou filtra por ele. Sem índice, essas consultas fazem um collection scan
// completo — barato hoje, com a coleção pequena, mas cada vez mais lento à medida que o histórico
// cresce (a coleção nunca é podada). Descendente porque toda ordenação no código é `{ timestamp: -1 }`.
WeatherAlertSchema.index({ timestamp: -1 });

// Índice composto para a consulta de findCriticalAlertsLast24h (/clima/emergencias): filtra por
// nivelSeveridade E por uma janela de timestamp, depois ordena por timestamp — um índice composto
// nessa ordem cobre filtro e ordenação na mesma busca, em vez de só o filtro OU só a ordenação.
WeatherAlertSchema.index({ nivelSeveridade: 1, timestamp: -1 });
