import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { Loan, LoanStatus } from '../../database/models/loan.model';
import {
  Document,
  ExtractionStatus,
} from '../../database/models/document.model';
import { StorageService } from '../storage/storage.service';
import { DocumentClassifierService } from './document-classifier.service';

export const EXTRACTION_QUEUE = 'document-extraction';

export interface IngestionRunResult {
  loansProcessed: number;
  documentsQueued: number;
  loans: Array<{ loanNumber: string; loanId: string; documentsQueued: number }>;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly loanDocsPath: string;

  constructor(
    @InjectModel(Loan) private loanModel: typeof Loan,
    @InjectModel(Document) private documentModel: typeof Document,
    @InjectQueue(EXTRACTION_QUEUE) private queue: Queue,
    private readonly storage: StorageService,
    private readonly classifier: DocumentClassifierService,
  ) {
    this.loanDocsPath =
      process.env.LOAN_DOCS_PATH ||
      path.join(process.cwd(), '..', 'Loan Documents');
  }

  async runAll(): Promise<IngestionRunResult> {
    const loanFolders = this.scanLoanFolders();
    const results: IngestionRunResult = {
      loansProcessed: 0,
      documentsQueued: 0,
      loans: [],
    };

    for (const { loanNumber, folderPath } of loanFolders) {
      const { loanId, documentsQueued } = await this.ingestLoan(
        loanNumber,
        folderPath,
      );
      results.loansProcessed++;
      results.documentsQueued += documentsQueued;
      results.loans.push({ loanNumber, loanId, documentsQueued });
    }

    return results;
  }

  async runLoan(
    loanNumber: string,
  ): Promise<{ loanId: string; documentsQueued: number }> {
    const loanFolders = this.scanLoanFolders();
    const target = loanFolders.find((f) => f.loanNumber === loanNumber);
    if (!target) throw new Error(`Loan folder not found: ${loanNumber}`);
    return this.ingestLoan(target.loanNumber, target.folderPath);
  }

  private async ingestLoan(
    loanNumber: string,
    folderPath: string,
  ): Promise<{ loanId: string; documentsQueued: number }> {
    const [loan] = await this.loanModel.upsert({
      loanNumber,
      status: LoanStatus.PROCESSING,
    });

    const pdfFiles = fs
      .readdirSync(folderPath)
      .filter((f) => f.toLowerCase().endsWith('.pdf'));

    let documentsQueued = 0;

    for (const fileName of pdfFiles) {
      const filePath = path.join(folderPath, fileName);
      const s3Key = this.storage.buildKey(loanNumber, fileName);
      const docType = this.classifier.classify(fileName);

      const pdfBuffer = fs.readFileSync(filePath);
      await this.storage.upload(s3Key, pdfBuffer);

      const [doc] = await this.documentModel.upsert({
        loanId: loan.id,
        fileName,
        filePath,
        s3Key,
        docType,
        extractionStatus: ExtractionStatus.PENDING,
      });

      await this.queue.add('extract', { documentId: doc.id });
      documentsQueued++;
      this.logger.log(`Queued extraction for ${fileName} (${docType})`);
    }

    return { loanId: loan.id, documentsQueued };
  }

  private scanLoanFolders(): Array<{ loanNumber: string; folderPath: string }> {
    if (!fs.existsSync(this.loanDocsPath)) {
      this.logger.warn(`Loan docs path not found: ${this.loanDocsPath}`);
      return [];
    }

    return fs
      .readdirSync(this.loanDocsPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const match = d.name.match(/Loan\s+(\w+)/i);
        return {
          loanNumber: match ? match[1] : d.name,
          folderPath: path.join(this.loanDocsPath, d.name),
        };
      });
  }
}
