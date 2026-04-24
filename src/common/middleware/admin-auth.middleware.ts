import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AdminAuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = process.env.ADMIN_API_KEY;
    if (!apiKey) return next();

    if (req.headers['x-api-key'] !== apiKey) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    next();
  }
}
