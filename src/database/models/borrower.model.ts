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
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { Loan } from './loan.model';
import { IncomeRecord } from './income-record.model';
import { AccountRecord } from './account-record.model';

@Table({ tableName: 'borrowers', underscored: true })
export class Borrower extends Model<
  InferAttributes<Borrower>,
  InferCreationAttributes<
    Borrower,
    { omit: 'loan' | 'incomeRecords' | 'accountRecords' }
  >
> {
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: CreationOptional<string>;

  @ForeignKey(() => Loan)
  @Column({ type: DataType.UUID, allowNull: false })
  declare loanId: string;

  @BelongsTo(() => Loan)
  declare loan: Loan;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare address: string | null;

  @Column({ type: DataType.STRING(4), allowNull: true })
  declare ssnLast4: string | null;

  @HasMany(() => IncomeRecord)
  declare incomeRecords: IncomeRecord[];

  @HasMany(() => AccountRecord)
  declare accountRecords: AccountRecord[];
}
