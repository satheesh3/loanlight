import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const apiKey = process.env.ADMIN_API_KEY;
    if (!apiKey) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers['x-api-key'] !== apiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}
