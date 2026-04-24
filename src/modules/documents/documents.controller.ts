import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { DocumentsService } from './documents.service';
import { GetDocumentsQueryDto } from './dto/get-documents-query.dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  findAll(@Query() query: GetDocumentsQueryDto) {
    return this.documentsService.findAll(query.loanId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.findOne(id);
  }

  @UseGuards(ApiKeyGuard)
  @Post(':id/re-extract')
  reExtract(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.reExtract(id);
  }
}
