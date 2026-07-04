import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Single source of truth for the TypeORM connection.
 * Reused by the Nest runtime (AppModule) and the TypeORM CLI (migrations),
 * so the app and the migration tooling can never drift apart.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'miniwallet',
  password: process.env.DB_PASSWORD ?? 'miniwallet',
  database: process.env.DB_NAME ?? 'miniwallet',
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  // Never true: schema changes go through migrations only (BUILD_CONVENTIONS §5).
  synchronize: false,
  // Run pending migrations on boot so `docker compose up` sets up the schema
  // in one command.
  migrationsRun: true,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
