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
import { Borrower } from './borrower.model';
import { Document } from './document.model';

export enum IncomeType {
  W2 = 'w2',
  SELF_EMPLOYMENT = 'self_employment',
  RENTAL = 'rental',
  PAYSTUB = 'paystub',
  EVOE = 'evoe',
  OTHER = 'other',
}

@Table({ tableName: 'income_records', underscored: true })
export class IncomeRecord extends Model<
  InferAttributes<IncomeRecord>,
  InferCreationAttributes<IncomeRecord, { omit: 'borrower' | 'document' }>
> {
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: CreationOptional<string>;

  @ForeignKey(() => Borrower)
  @Column({ type: DataType.UUID, allowNull: false })
  declare borrowerId: string;

  @BelongsTo(() => Borrower)
  declare borrower: Borrower;

  @ForeignKey(() => Document)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @BelongsTo(() => Document)
  declare document: Document;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare year: number | null;

  @Default(IncomeType.OTHER)
  @Column({
    type: DataType.ENUM(...Object.values(IncomeType)),
    allowNull: false,
  })
  declare incomeType: CreationOptional<IncomeType>;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare amount: number;

  @Column({ type: DataType.STRING, allowNull: true })
  declare employer: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare period: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare sourceSnippet: string | null;
}
