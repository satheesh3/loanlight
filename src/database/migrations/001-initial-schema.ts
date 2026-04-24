import { DataTypes, QueryInterface } from 'sequelize';

export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.createTable('loans', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    loan_number: { type: DataTypes.STRING, allowNull: false, unique: true },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.createTable('borrowers', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    loan_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'loans', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: { type: DataTypes.STRING, allowNull: false },
    address: { type: DataTypes.TEXT, allowNull: true },
    ssn_last4: { type: DataTypes.STRING(4), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.createTable('documents', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    loan_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'loans', key: 'id' },
      onDelete: 'CASCADE',
    },
    file_name: { type: DataTypes.STRING, allowNull: false },
    file_path: { type: DataTypes.STRING, allowNull: false },
    s3_key: { type: DataTypes.STRING, allowNull: true },
    doc_type: {
      type: DataTypes.ENUM(
        'application',
        'title_report',
        'bank_statement',
        'closing_disclosure',
        'paystub',
        'evoe',
        'w2',
        'tax_return',
        'letter_of_explanation',
        'unknown',
      ),
      allowNull: false,
      defaultValue: 'unknown',
    },
    extraction_status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.createTable('income_records', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    borrower_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'borrowers', key: 'id' },
      onDelete: 'CASCADE',
    },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    year: { type: DataTypes.INTEGER, allowNull: true },
    income_type: {
      type: DataTypes.ENUM(
        'w2',
        'self_employment',
        'rental',
        'paystub',
        'evoe',
        'other',
      ),
      allowNull: false,
      defaultValue: 'other',
    },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    employer: { type: DataTypes.STRING, allowNull: true },
    period: { type: DataTypes.STRING, allowNull: true },
    source_snippet: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.createTable('account_records', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    borrower_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'borrowers', key: 'id' },
      onDelete: 'CASCADE',
    },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    account_type: {
      type: DataTypes.ENUM('checking', 'savings', 'loan', 'other'),
      allowNull: false,
      defaultValue: 'other',
    },
    account_number: { type: DataTypes.STRING, allowNull: true },
    institution: { type: DataTypes.STRING, allowNull: true },
    balance: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    source_snippet: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.createTable('extraction_events', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    status: {
      type: DataTypes.ENUM('success', 'failed'),
      allowNull: false,
    },
    model_used: { type: DataTypes.STRING, allowNull: true },
    input_tokens: { type: DataTypes.INTEGER, allowNull: true },
    output_tokens: { type: DataTypes.INTEGER, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  // Indexes for FK columns (PostgreSQL doesn't create them automatically)
  await qi.addIndex('borrowers', ['loan_id']);
  await qi.addIndex('documents', ['loan_id']);
  await qi.addIndex('income_records', ['borrower_id']);
  await qi.addIndex('income_records', ['document_id']);
  await qi.addIndex('account_records', ['borrower_id']);
  await qi.addIndex('account_records', ['document_id']);
  await qi.addIndex('extraction_events', ['document_id']);
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.dropTable('extraction_events');
  await qi.dropTable('account_records');
  await qi.dropTable('income_records');
  await qi.dropTable('documents');
  await qi.dropTable('borrowers');
  await qi.dropTable('loans');

  // Drop ENUM types left behind by PostgreSQL
  for (const typeName of [
    'enum_loans_status',
    'enum_documents_doc_type',
    'enum_documents_extraction_status',
    'enum_income_records_income_type',
    'enum_account_records_account_type',
    'enum_extraction_events_status',
  ]) {
    await qi.sequelize.query(`DROP TYPE IF EXISTS "${typeName}"`);
  }
}
