import { Injectable, Logger } from '@nestjs/common';
import Anthropic, { RateLimitError } from '@anthropic-ai/sdk';
import { DocType } from '../../database/models/document.model';
import {
  ExtractionResult,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from './prompts/extraction.prompts';

interface ExtractionOutput {
  result: ExtractionResult;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
  }

  async extractFromPdf(
    pdfBuffer: Buffer,
    docType: DocType,
    fileName: string,
  ): Promise<ExtractionOutput> {
    const userPrompt = buildUserPrompt(docType, fileName);
    const base64Pdf = pdfBuffer.toString('base64');

    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64Pdf,
                  },
                } as any,
                {
                  type: 'text',
                  text: userPrompt,
                },
              ],
            },
          ],
        });

        const rawText =
          response.content[0].type === 'text' ? response.content[0].text : '';

        const result = this.parseJson(rawText, fileName);

        return {
          result,
          modelUsed: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      } catch (error: unknown) {
        attempt++;
        if (error instanceof RateLimitError && attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(
            `Rate limited on ${fileName}, retrying in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `Extraction failed after ${maxAttempts} attempts for ${fileName}`,
    );
  }

  private parseJson(raw: string, fileName: string): ExtractionResult {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as Partial<ExtractionResult>;
      return {
        borrowers: parsed.borrowers ?? [],
        incomeRecords: parsed.incomeRecords ?? [],
        accountRecords: parsed.accountRecords ?? [],
      };
    } catch {
      this.logger.error(
        `Failed to parse JSON from Claude for ${fileName}: ${cleaned.slice(0, 200)}`,
      );
      return { borrowers: [], incomeRecords: [], accountRecords: [] };
    }
  }
}
