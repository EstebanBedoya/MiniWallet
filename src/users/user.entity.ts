import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  // bigint identity → TypeORM/pg surface it as string; keep it as string end-to-end.
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text', name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: 'USER' })
  role: 'USER' | 'ADMIN';

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
