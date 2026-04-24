import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Document } from './document.model';

export enum ExtractionEventStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Table({ tableName: 'extraction_events', underscored: true })
export class ExtractionEvent extends Model<
  InferAttributes<ExtractionEvent>,
  InferCreationAttributes<ExtractionEvent, { omit: 'document' }>
> {
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: CreationOptional<string>;

  @ForeignKey(() => Document)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @BelongsTo(() => Document)
  declare document: Document;

  @Column({
    type: DataType.ENUM(...Object.values(ExtractionEventStatus)),
    allowNull: false,
  })
  declare status: ExtractionEventStatus;

  @Column({ type: DataType.STRING, allowNull: true })
  declare modelUsed: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare inputTokens: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare outputTokens: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare errorMessage: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
