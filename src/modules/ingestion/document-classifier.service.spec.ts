import { DocumentClassifierService } from './document-classifier.service';
import { DocType } from '../../database/models/document.model';

describe('DocumentClassifierService', () => {
  let service: DocumentClassifierService;

  beforeEach(() => {
    service = new DocumentClassifierService();
  });

  const cases: Array<[string, DocType]> = [
    ['Closing_Disclosure.pdf', DocType.CLOSING_DISCLOSURE],
    ['Title Report.pdf', DocType.TITLE_REPORT],
    ['W2 2024- John Homeowner.pdf', DocType.W2],
    [
      '1040 and Schedule C (2023 and 2024) - John and Mary Homeowner .pdf',
      DocType.TAX_RETURN,
    ],
    ['Paystub- John Homeowner (Current).pdf', DocType.PAYSTUB],
    ['EVOE - John Homeowner.pdf', DocType.EVOE],
    ['Checking - John Mary Homeowner (Current).pdf', DocType.BANK_STATEMENT],
    ['Savings - John Mary Homeowner (Current).pdf', DocType.BANK_STATEMENT],
    ['Letter_of_Explanation.pdf', DocType.LETTER_OF_EXPLANATION],
    ['document.pdf', DocType.APPLICATION],
    ['random-file.pdf', DocType.UNKNOWN],
  ];

  test.each(cases)('classifies "%s" as %s', (fileName, expected) => {
    expect(service.classify(fileName)).toBe(expected);
  });
});
