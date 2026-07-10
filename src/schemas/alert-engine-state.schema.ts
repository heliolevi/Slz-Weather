import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EstadoAlerta = 'NORMAL' | 'ATENCAO' | 'EMERGENCIA';

export type AlertEngineStateDocument = AlertEngineState & Document;

/**
 * Chave fixa do documento singleton de estado. O AlertEngineService sempre faz upsert
 * usando este identificador, garantindo uma única linha "estado atual" na coleção.
 */
export const ALERT_ENGINE_STATE_ID = 'ESTADO_ATUAL_VENTO';

@Schema({ timestamps: false, collection: 'alert_engine_state' })
export class AlertEngineState {
  @Prop({ required: true, unique: true, default: ALERT_ENGINE_STATE_ID })
  identificador: string;

  @Prop({
    required: true,
    enum: ['NORMAL', 'ATENCAO', 'EMERGENCIA'],
    default: 'NORMAL',
  })
  currentState: EstadoAlerta;

  @Prop({ required: true, default: () => new Date() })
  updatedAt: Date;

  @Prop()
  velocidadeVento?: number;
}

export const AlertEngineStateSchema = SchemaFactory.createForClass(AlertEngineState);
