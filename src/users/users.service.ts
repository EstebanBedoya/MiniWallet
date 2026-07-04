import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /** Case-insensitive lookup — matches the LOWER(email) unique index. */
  findByEmail(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();
  }

  findById(userId: string): Promise<User | null> {
    return this.users.findOne({ where: { userId } });
  }

  create(
    data: Pick<User, 'email' | 'name' | 'passwordHash'> & { role?: 'USER' | 'ADMIN' },
  ): Promise<User> {
    const user = this.users.create({ role: 'USER', ...data });
    return this.users.save(user);
  }
}
