import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SeismicSensorStateDocument = SeismicSensorState & Document;

/**
 * Chave fixa do documento singleton de estado. O WeatherService sempre faz upsert
 * usando este identificador, garantindo uma única linha "leitura pendente" na coleção.
 */
export const SEISMIC_SENSOR_STATE_ID = 'ESTADO_SENSOR_SISMICO';

@Schema({ timestamps: false, collection: 'seismic_sensor_state' })
export class SeismicSensorState {
  @Prop({ required: true, unique: true, default: SEISMIC_SENSOR_STATE_ID })
  identificador: string;

  @Prop()
  leituraPendente?: number;

  @Prop()
  timestampLeituraPendente?: Date;
}

export const SeismicSensorStateSchema = SchemaFactory.createForClass(SeismicSensorState);
