import { Readable } from 'stream';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  CreateBucketCommand: jest.fn().mockImplementation((input) => ({ input })),
  HeadBucketCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { StorageService } from './storage.service';

function makeReadable(content: Buffer): Readable {
  const stream = new Readable({ read() {} });
  stream.push(content);
  stream.push(null);
  return stream;
}

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageService();
  });

  describe('onModuleInit', () => {
    it('creates the bucket when it does not exist', async () => {
      mockSend
        .mockRejectedValueOnce(new Error('NoSuchBucket'))
        .mockResolvedValueOnce({});

      await service.onModuleInit();

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('skips bucket creation when bucket already exists', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.onModuleInit();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('upload', () => {
    it('calls S3 PutObjectCommand with correct parameters', async () => {
      mockSend.mockResolvedValue({});
      const buffer = Buffer.from('pdf-bytes');

      const key = await service.upload('214/doc.pdf', buffer);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(key).toBe('214/doc.pdf');
    });

    it('uses application/pdf as default content type', async () => {
      mockSend.mockResolvedValue({});
      const { PutObjectCommand } = jest.requireMock('@aws-sdk/client-s3');

      await service.upload('test.pdf', Buffer.from('x'));

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ ContentType: 'application/pdf' }),
      );
    });

    it('accepts a custom content type', async () => {
      mockSend.mockResolvedValue({});
      const { PutObjectCommand } = jest.requireMock('@aws-sdk/client-s3');

      await service.upload('test.txt', Buffer.from('x'), 'text/plain');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ ContentType: 'text/plain' }),
      );
    });
  });

  describe('download', () => {
    it('returns a buffer from the S3 response stream', async () => {
      const content = Buffer.from('pdf-content');
      mockSend.mockResolvedValue({ Body: makeReadable(content) });

      const result = await service.download('214/doc.pdf');

      expect(result).toEqual(content);
    });

    it('concatenates multiple stream chunks into a single buffer', async () => {
      const chunk1 = Buffer.from('part1');
      const chunk2 = Buffer.from('part2');
      const stream = new Readable({ read() {} });
      stream.push(chunk1);
      stream.push(chunk2);
      stream.push(null);
      mockSend.mockResolvedValue({ Body: stream });

      const result = await service.download('multi.pdf');

      expect(result).toEqual(Buffer.concat([chunk1, chunk2]));
    });
  });

  describe('buildKey', () => {
    it('joins loanNumber and fileName with a slash', () => {
      expect(service.buildKey('214', 'document.pdf')).toBe('214/document.pdf');
    });

    it('preserves spaces and special characters in filename', () => {
      expect(service.buildKey('214', 'W2 2024- John Homeowner.pdf')).toBe(
        '214/W2 2024- John Homeowner.pdf',
      );
    });
  });
});
