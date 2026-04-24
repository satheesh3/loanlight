import { Logger } from '@nestjs/common';
import { RateLimitError } from '@anthropic-ai/sdk';
import { ExtractionService } from './extraction.service';
import { DocType } from '../../database/models/document.model';

jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

const MOCK_RESPONSE = {
  borrowers: [
    { name: 'John Homeowner', address: '123 Main St', ssnLast4: '1234' },
  ],
  incomeRecords: [
    {
      borrowerName: 'John Homeowner',
      year: 2024,
      incomeType: 'w2',
      amount: 85000,
      employer: 'Acme Corp',
      period: 'annual',
      sourceSnippet: 'Wages, tips... $85,000.00',
    },
  ],
  accountRecords: [
    {
      borrowerName: 'John Homeowner',
      accountType: 'checking',
      accountNumber: '****5678',
      institution: 'First Bank',
      balance: 12500,
      sourceSnippet: 'Ending Balance: $12,500.00',
    },
  ],
};

type MockClient = { messages: { create: jest.Mock } };

describe('ExtractionService', () => {
  let service: ExtractionService;
  let mockClient: MockClient;

  beforeEach(() => {
    service = new ExtractionService();
    mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(MOCK_RESPONSE) }],
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1000, output_tokens: 200 },
        }),
      },
    };
    (service as unknown as { client: MockClient }).client = mockClient;
  });

  it('extracts structured data from PDF buffer', async () => {
    const fakeBuffer = Buffer.from('%PDF fake content');
    const result = await service.extractFromPdf(
      fakeBuffer,
      DocType.W2,
      'W2 2024.pdf',
    );

    expect(result.result.borrowers).toHaveLength(1);
    expect(result.result.borrowers[0].name).toBe('John Homeowner');
    expect(result.result.incomeRecords).toHaveLength(1);
    expect(result.result.incomeRecords[0].amount).toBe(85000);
    expect(result.result.incomeRecords[0].incomeType).toBe('w2');
    expect(result.result.accountRecords).toHaveLength(1);
    expect(result.modelUsed).toBe('claude-sonnet-4-6');
    expect(result.inputTokens).toBe(1000);
  });

  it('handles malformed JSON gracefully', async () => {
    mockClient.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 500, output_tokens: 20 },
    });

    const fakeBuffer = Buffer.from('%PDF fake content');
    const result = await service.extractFromPdf(
      fakeBuffer,
      DocType.UNKNOWN,
      'unknown.pdf',
    );

    expect(result.result.borrowers).toEqual([]);
    expect(result.result.incomeRecords).toEqual([]);
    expect(result.result.accountRecords).toEqual([]);
  });

  it('strips markdown code fences from Claude response', async () => {
    mockClient.messages.create.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n' + JSON.stringify(MOCK_RESPONSE) + '\n```',
        },
      ],
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 500, output_tokens: 200 },
    });

    const result = await service.extractFromPdf(
      Buffer.from('%PDF'),
      DocType.W2,
      'test.pdf',
    );
    expect(result.result.borrowers[0].name).toBe('John Homeowner');
  });

  it('retries on 429 rate limit errors', async () => {
    const rateLimitError = Object.assign(
      Object.create(RateLimitError.prototype) as RateLimitError,
      { message: 'Rate limited', status: 429 },
    );
    mockClient.messages.create
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(MOCK_RESPONSE) }],
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 1000, output_tokens: 200 },
      });

    jest.useFakeTimers();
    const promise = service.extractFromPdf(
      Buffer.from('%PDF'),
      DocType.W2,
      'test.pdf',
    );
    void jest.runAllTimersAsync();
    const result = await promise;
    jest.useRealTimers();

    expect(result.result.borrowers).toHaveLength(1);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
  });
});
