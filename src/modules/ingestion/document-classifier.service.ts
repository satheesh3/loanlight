import { Injectable } from '@nestjs/common';
import { DocType } from '../../database/models/document.model';

const RULES: Array<{ pattern: RegExp; type: DocType }> = [
  { pattern: /closing.?disclosure/i, type: DocType.CLOSING_DISCLOSURE },
  { pattern: /title.?report/i, type: DocType.TITLE_REPORT },
  { pattern: /\bw[-_]?2\b/i, type: DocType.W2 },
  { pattern: /1040|schedule.?c/i, type: DocType.TAX_RETURN },
  { pattern: /paystub|pay.?stub|paycheck/i, type: DocType.PAYSTUB },
  { pattern: /evoe|employment.?verif/i, type: DocType.EVOE },
  {
    pattern: /checking|savings|bank.?statement/i,
    type: DocType.BANK_STATEMENT,
  },
  {
    pattern: /letter.?of.?explanation|loe\b/i,
    type: DocType.LETTER_OF_EXPLANATION,
  },
  { pattern: /\bdocument\b|application|loan.?app/i, type: DocType.APPLICATION },
];

@Injectable()
export class DocumentClassifierService {
  classify(fileName: string): DocType {
    for (const rule of RULES) {
      if (rule.pattern.test(fileName)) return rule.type;
    }
    return DocType.UNKNOWN;
  }
}
