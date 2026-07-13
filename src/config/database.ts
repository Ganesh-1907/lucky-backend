import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema/index';

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  max: 1,
  connect_timeout: 30,
  idle_timeout: 30,
  onnotice: () => {},
});

export const db = drizzle(client, { schema });

export default db;
