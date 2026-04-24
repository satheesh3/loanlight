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
import { ExtractionEvent } from './extraction-event.model';

export enum DocType {
  APPLICATION = 'application',
  TITLE_REPORT = 'title_report',
  BANK_STATEMENT = 'bank_statement',
  CLOSING_DISCLOSURE = 'closing_disclosure',
  PAYSTUB = 'paystub',
  EVOE = 'evoe',
  W2 = 'w2',
  TAX_RETURN = 'tax_return',
  LETTER_OF_EXPLANATION = 'letter_of_explanation',
  UNKNOWN = 'unknown',
}

export enum ExtractionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Table({ tableName: 'documents', underscored: true })
export class Document extends Model<
  InferAttributes<Document>,
  InferCreationAttributes<Document, { omit: 'loan' | 'extractionEvents' }>
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
  declare fileName: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare filePath: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare s3Key: string | null;

  @Default(DocType.UNKNOWN)
  @Column({ type: DataType.ENUM(...Object.values(DocType)), allowNull: false })
  declare docType: CreationOptional<DocType>;

  @Default(ExtractionStatus.PENDING)
  @Column({
    type: DataType.ENUM(...Object.values(ExtractionStatus)),
    allowNull: false,
  })
  declare extractionStatus: CreationOptional<ExtractionStatus>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @HasMany(() => ExtractionEvent)
  declare extractionEvents: ExtractionEvent[];
}
