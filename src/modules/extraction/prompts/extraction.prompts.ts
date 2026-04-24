import { DocType } from '../../../database/models/document.model';

export interface ExtractedBorrower {
  name: string;
  address?: string;
  ssnLast4?: string;
}

export interface ExtractedIncomeRecord {
  borrowerName: string;
  year?: number;
  incomeType:
    | 'w2'
    | 'self_employment'
    | 'rental'
    | 'paystub'
    | 'evoe'
    | 'other';
  amount: number;
  employer?: string;
  period?: string;
  sourceSnippet?: string;
}

export interface ExtractedAccountRecord {
  borrowerName: string;
  accountType: 'checking' | 'savings' | 'loan' | 'other';
  accountNumber?: string;
  institution?: string;
  balance?: number;
  sourceSnippet?: string;
}

export interface ExtractionResult {
  borrowers: ExtractedBorrower[];
  incomeRecords: ExtractedIncomeRecord[];
  accountRecords: ExtractedAccountRecord[];
}

export const SYSTEM_PROMPT = `You are a mortgage document extraction specialist.

Your task is to extract structured data from the provided mortgage document and return it as valid JSON.

EXTRACTION RULES:
1. Extract ALL borrowers mentioned (primary and co-borrower)
2. Extract ALL income entries with exact dollar amounts as numbers (no commas, no $ signs)
3. Extract ALL account/loan numbers with institution names
4. For every extracted item, include a short sourceSnippet (the verbatim text from the document that supports it)
5. If a field is not present in the document, omit it entirely — do NOT guess or fabricate values
6. SSN: only extract the last 4 digits if visible — NEVER extract full SSNs
7. Income amounts must be annual unless clearly labeled as monthly/bi-weekly (in that case, note the period)
8. incomeType MUST be one of exactly: "w2", "self_employment", "rental", "paystub", "evoe", "other"
9. accountType MUST be one of exactly: "checking", "savings", "loan", "other"

RETURN FORMAT — respond ONLY with valid JSON, no markdown, no explanation:
{
  "borrowers": [
    {
      "name": "Full Name",
      "address": "Full street address if present",
      "ssnLast4": "1234"
    }
  ],
  "incomeRecords": [
    {
      "borrowerName": "Full Name",
      "year": 2024,
      "incomeType": "w2",
      "amount": 85000.00,
      "employer": "Employer Name",
      "period": "annual",
      "sourceSnippet": "exact text from document"
    }
  ],
  "accountRecords": [
    {
      "borrowerName": "Full Name",
      "accountType": "checking",
      "accountNumber": "****1234",
      "institution": "Bank Name",
      "balance": 12500.00,
      "sourceSnippet": "exact text from document"
    }
  ]
}`;

export function buildUserPrompt(docType: DocType, fileName: string): string {
  const hints: Partial<Record<DocType, string>> = {
    [DocType.W2]:
      'This is a W-2 form. Focus on: Box 1 (Wages), Box 2 (Tax withheld), employer name, employee name and address, tax year.',
    [DocType.TAX_RETURN]:
      'This is a tax return (1040 / Schedule C). Focus on: total income, self-employment income (Schedule C net profit), adjusted gross income, tax year, filer names.',
    [DocType.PAYSTUB]:
      'This is a pay stub. Focus on: YTD gross pay, pay period, employee name, employer name, pay date.',
    [DocType.EVOE]:
      'This is an Employment Verification of Employment (EVOE). Focus on: employee name, employer name, hire date, current salary/hourly rate, employment status.',
    [DocType.BANK_STATEMENT]:
      'This is a bank statement. Focus on: account holder name, account number (masked), institution name, ending balance, statement period.',
    [DocType.CLOSING_DISCLOSURE]:
      'This is a Closing Disclosure. Focus on: borrower names, loan amount, loan number, property address, closing date.',
    [DocType.TITLE_REPORT]:
      'This is a Title Report. Focus on: property address, borrower/owner names, loan/account numbers referenced.',
    [DocType.APPLICATION]:
      'This is a loan application. Focus on: all borrower PII (name, address, SSN last 4), income declarations, asset accounts.',
    [DocType.LETTER_OF_EXPLANATION]:
      'This is a Letter of Explanation. Focus on: borrower name, any account numbers or income figures mentioned.',
  };

  const hint =
    hints[docType] ??
    'Extract all borrower PII, income figures, and account numbers present.';

  return `Document: ${fileName}\nDocument type: ${docType}\n\n${hint}\n\nExtract all relevant data from this document and return the JSON.`;
}
