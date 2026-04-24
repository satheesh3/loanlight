import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { plainToInstance } from 'class-transformer';
import { Borrower } from '../../database/models/borrower.model';
import { IncomeRecord } from '../../database/models/income-record.model';
import { AccountRecord } from '../../database/models/account-record.model';
import { Document } from '../../database/models/document.model';
import {
  BorrowerResponseDto,
  IncomeRecordResponseDto,
} from './dto/borrower-response.dto';
import { modelToPlain } from '../../common/utils/model.utils';

const TO_DTO = { excludeExtraneousValues: true };

@Injectable()
export class BorrowersService {
  constructor(@InjectModel(Borrower) private borrowerModel: typeof Borrower) {}

  async findOne(id: string): Promise<BorrowerResponseDto> {
    const borrower = await this.borrowerModel.findByPk(id, {
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
    if (!borrower) throw new NotFoundException(`Borrower ${id} not found`);
    return plainToInstance(BorrowerResponseDto, modelToPlain(borrower), TO_DTO);
  }

  async findIncome(id: string): Promise<IncomeRecordResponseDto[]> {
    const borrower = await this.borrowerModel.findByPk(id);
    if (!borrower) throw new NotFoundException(`Borrower ${id} not found`);

    const records = await IncomeRecord.findAll({
      where: { borrowerId: id },
      include: [
        {
          model: Document,
          attributes: ['id', 'fileName', 'docType', 'filePath'],
        },
      ],
      order: [['year', 'DESC']],
    });
    return plainToInstance(
      IncomeRecordResponseDto,
      records.map(modelToPlain),
      TO_DTO,
    );
  }
}
