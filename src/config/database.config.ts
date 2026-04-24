import { types } from 'pg';
import { SequelizeModuleOptions } from '@nestjs/sequelize';
import { Loan } from '../database/models/loan.model';
import { Borrower } from '../database/models/borrower.model';
import { Document } from '../database/models/document.model';
import { IncomeRecord } from '../database/models/income-record.model';
import { AccountRecord } from '../database/models/account-record.model';
import { ExtractionEvent } from '../database/models/extraction-event.model';

// pg returns DECIMAL/NUMERIC as strings by default to avoid precision loss.
// For the amounts in this app (loan financials up to ~$10M) parseFloat is safe.
types.setTypeParser(1700, parseFloat);

export const databaseConfig = (): SequelizeModuleOptions => ({
  dialect: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  database: process.env.DATABASE_NAME || 'loanlight',
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  models: [
    Loan,
    Borrower,
    Document,
    IncomeRecord,
    AccountRecord,
    ExtractionEvent,
  ],
  autoLoadModels: true,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 20, min: 2, acquire: 30000, idle: 10000 },
});
