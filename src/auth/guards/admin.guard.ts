import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../strategies/jwt.strategy';

/** Requires an authenticated ADMIN. Use after JwtAuthGuard. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Admin role required' });
    }
    return true;
  }
}
