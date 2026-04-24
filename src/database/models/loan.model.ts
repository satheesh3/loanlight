import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import {
  Column,
  DataType,
  Default,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { Borrower } from './borrower.model';
import { Document } from './document.model';

export enum LoanStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Table({ tableName: 'loans', underscored: true })
export class Loan extends Model<
  InferAttributes<Loan>,
  InferCreationAttributes<Loan, { omit: 'borrowers' | 'documents' }>
> {
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: CreationOptional<string>;

  @Column({ type: DataType.STRING, unique: true, allowNull: false })
  declare loanNumber: string;

  @Default(LoanStatus.PENDING)
  @Column({
    type: DataType.ENUM(...Object.values(LoanStatus)),
    allowNull: false,
  })
  declare status: CreationOptional<LoanStatus>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @HasMany(() => Borrower)
  declare borrowers: Borrower[];

  @HasMany(() => Document)
  declare documents: Document[];
}
