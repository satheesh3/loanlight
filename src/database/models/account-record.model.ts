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

export enum AccountType {
  CHECKING = 'checking',
  SAVINGS = 'savings',
  LOAN = 'loan',
  OTHER = 'other',
}

@Table({ tableName: 'account_records', underscored: true })
export class AccountRecord extends Model<
  InferAttributes<AccountRecord>,
  InferCreationAttributes<AccountRecord, { omit: 'borrower' | 'document' }>
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

  @Default(AccountType.OTHER)
  @Column({
    type: DataType.ENUM(...Object.values(AccountType)),
    allowNull: false,
  })
  declare accountType: CreationOptional<AccountType>;

  @Column({ type: DataType.STRING, allowNull: true })
  declare accountNumber: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare institution: string | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  declare balance: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare sourceSnippet: string | null;
}
