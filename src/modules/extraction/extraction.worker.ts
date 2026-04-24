import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Job } from 'bullmq';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  Document,
  ExtractionStatus,
} from '../../database/models/document.model';
import { Borrower } from '../../database/models/borrower.model';
import {
  IncomeRecord,
  IncomeType,
} from '../../database/models/income-record.model';
import {
  AccountRecord,
  AccountType,
} from '../../database/models/account-record.model';
import {
  ExtractionEvent,
  ExtractionEventStatus,
} from '../../database/models/extraction-event.model';
import { StorageService } from '../storage/storage.service';
import { ExtractionService } from './extraction.service';
import { EXTRACTION_QUEUE } from '../ingestion/ingestion.service';
import { Loan, LoanStatus } from '../../database/models/loan.model';

@Processor(EXTRACTION_QUEUE, {
  concurrency: parseInt(process.env.EXTRACTION_CONCURRENCY || '3', 10),
})
export class ExtractionWorker extends WorkerHost {
  private readonly logger = new Logger(ExtractionWorker.name);

  constructor(
    @InjectModel(Document) private documentModel: typeof Document,
    @InjectModel(Borrower) private borrowerModel: typeof Borrower,
    @InjectModel(IncomeRecord) private incomeRecordModel: typeof IncomeRecord,
    @InjectModel(AccountRecord)
    private accountRecordModel: typeof AccountRecord,
    @InjectModel(ExtractionEvent)
    private extractionEventModel: typeof ExtractionEvent,
    @InjectModel(Loan) private loanModel: typeof Loan,
    private readonly storage: StorageService,
    private readonly extraction: ExtractionService,
    private readonly sequelize: Sequelize,
  ) {
    super();
  }

  private normalizeIncomeType(raw: string): IncomeType {
    const valid = Object.values(IncomeType) as string[];
    if (valid.includes(raw)) return raw as IncomeType;
    if (raw === 'paystub_ytd') return IncomeType.PAYSTUB;
    return IncomeType.OTHER;
  }

  private normalizeAccountType(raw: string): AccountType {
    const valid = Object.values(AccountType) as string[];
    return valid.includes(raw) ? (raw as AccountType) : AccountType.OTHER;
  }

  async process(job: Job<{ documentId: string }>): Promise<void> {
    const { documentId } = job.data;
    const doc = await this.documentModel.findByPk(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    this.logger.log(`Processing ${doc.fileName}`);

    try {
      const pdfBuffer = await this.storage.download(doc.s3Key!);
      const { result, modelUsed, inputTokens, outputTokens } =
        await this.extraction.extractFromPdf(
          pdfBuffer,
          doc.docType,
          doc.fileName,
        );

      await this.sequelize.transaction(async (t) => {
        await this.incomeRecordModel.destroy({
          where: { documentId: doc.id },
          transaction: t,
        });
        await this.accountRecordModel.destroy({
          where: { documentId: doc.id },
          transaction: t,
        });

        for (const b of result.borrowers) {
          if (!b.name?.trim()) continue;
          await this.upsertBorrower(doc.loanId, b, t);
        }

        for (const ir of result.incomeRecords) {
          const borrower = await this.findOrCreateBorrower(
            doc.loanId,
            ir.borrowerName,
            t,
          );
          if (!borrower) continue;
          await this.incomeRecordModel.create(
            {
              borrowerId: borrower.id,
              documentId: doc.id,
              year: ir.year ?? null,
              incomeType: this.normalizeIncomeType(ir.incomeType),
              amount: ir.amount,
              employer: ir.employer ?? null,
              period: ir.period ?? null,
              sourceSnippet: ir.sourceSnippet ?? null,
            },
            { transaction: t },
          );
        }

        for (const ar of result.accountRecords) {
          const borrower = await this.findOrCreateBorrower(
            doc.loanId,
            ar.borrowerName,
            t,
          );
          if (!borrower) continue;
          await this.accountRecordModel.create(
            {
              borrowerId: borrower.id,
              documentId: doc.id,
              accountType: this.normalizeAccountType(ar.accountType),
              accountNumber: ar.accountNumber ?? null,
              institution: ar.institution ?? null,
              balance: ar.balance ?? null,
              sourceSnippet: ar.sourceSnippet ?? null,
            },
            { transaction: t },
          );
        }

        await doc.update(
          { extractionStatus: ExtractionStatus.COMPLETED },
          { transaction: t },
        );

        await this.extractionEventModel.create(
          {
            documentId: doc.id,
            status: ExtractionEventStatus.SUCCESS,
            modelUsed,
            inputTokens,
            outputTokens,
          },
          { transaction: t },
        );
      });

      await this.updateLoanStatus(doc.loanId);
      this.logger.log(`Completed extraction for ${doc.fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed extraction for ${doc.fileName}: ${message}`);
      await doc.update({ extractionStatus: ExtractionStatus.FAILED });
      await this.extractionEventModel.create({
        documentId: doc.id,
        status: ExtractionEventStatus.FAILED,
        errorMessage: message,
      });
      throw error;
    }
  }

  private async upsertBorrower(
    loanId: string,
    b: { name: string; address?: string; ssnLast4?: string },
    transaction: Transaction,
  ): Promise<Borrower> {
    const [borrower] = await this.borrowerModel.findOrCreate({
      where: { loanId, name: b.name },
      defaults: {
        loanId,
        name: b.name,
        address: b.address ?? null,
        ssnLast4: b.ssnLast4 ?? null,
      },
      transaction,
    });
    const updates: { address?: string; ssnLast4?: string } = {};
    if (b.address && !borrower.address) updates.address = b.address;
    if (b.ssnLast4 && !borrower.ssnLast4) updates.ssnLast4 = b.ssnLast4;
    if (Object.keys(updates).length > 0) {
      await borrower.update(updates, { transaction });
    }
    return borrower;
  }

  private async findOrCreateBorrower(
    loanId: string,
    borrowerName: string,
    transaction: Transaction,
  ): Promise<Borrower | null> {
    if (!borrowerName?.trim()) return null;
    return this.upsertBorrower(
      loanId,
      { name: borrowerName.trim() },
      transaction,
    );
  }

  private async updateLoanStatus(loanId: string) {
    const docs = await this.documentModel.findAll({ where: { loanId } });
    const allDone = docs.every(
      (d) =>
        (d.extractionStatus as ExtractionStatus) ===
          ExtractionStatus.COMPLETED ||
        (d.extractionStatus as ExtractionStatus) === ExtractionStatus.FAILED,
    );
    if (allDone) {
      const anyFailed = docs.some(
        (d) =>
          (d.extractionStatus as ExtractionStatus) === ExtractionStatus.FAILED,
      );
      await this.loanModel.update(
        { status: anyFailed ? LoanStatus.FAILED : LoanStatus.COMPLETED },
        { where: { id: loanId } },
      );
    }
  }
}
