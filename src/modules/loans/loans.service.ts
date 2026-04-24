import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { plainToInstance } from 'class-transformer';
import { Loan } from '../../database/models/loan.model';
import { Borrower } from '../../database/models/borrower.model';
import { Document } from '../../database/models/document.model';
import { IncomeRecord } from '../../database/models/income-record.model';
import { AccountRecord } from '../../database/models/account-record.model';
import { LoanResponseDto } from './dto/loan-response.dto';
import { BorrowerResponseDto } from '../borrowers/dto/borrower-response.dto';
import { modelToPlain } from '../../common/utils/model.utils';

const TO_DTO = { excludeExtraneousValues: true };

@Injectable()
export class LoansService {
  constructor(
    @InjectModel(Loan) private loanModel: typeof Loan,
    @InjectModel(Borrower) private borrowerModel: typeof Borrower,
  ) {}

  async findAll() {
    const loans = await this.loanModel.findAll({
      include: [
        {
          model: Document,
          attributes: ['id', 'fileName', 'docType', 'extractionStatus'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
    return plainToInstance(LoanResponseDto, loans.map(modelToPlain), TO_DTO);
  }

  async findOne(id: string) {
    const loan = await this.loanModel.findByPk(id, {
      include: [
        {
          model: Document,
          attributes: [
            'id',
            'fileName',
            'docType',
            'extractionStatus',
            's3Key',
          ],
        },
        { model: Borrower, attributes: ['id', 'name', 'address'] },
      ],
    });
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);
    return plainToInstance(LoanResponseDto, modelToPlain(loan), TO_DTO);
  }

  async findBorrowers(id: string) {
    const loan = await this.loanModel.findByPk(id);
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);

    const borrowers = await this.borrowerModel.findAll({
      where: { loanId: id },
      include: [
        {
          model: IncomeRecord,
          include: [
            { model: Document, attributes: ['id', 'fileName', 'docType'] },
          ],
        },
        {
          model: AccountRecord,
          include: [
            { model: Document, attributes: ['id', 'fileName', 'docType'] },
          ],
        },
      ],
    });
    return plainToInstance(
      BorrowerResponseDto,
      borrowers.map(modelToPlain),
      TO_DTO,
    );
  }
}
