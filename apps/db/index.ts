import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const envPath = path.resolve(projectRoot, '.env');
dotenv.config({ path: envPath });

const DB_PATH: string = process.env.DB_PATH
  ? path.resolve(projectRoot, process.env.DB_PATH)
  : path.resolve(projectRoot, 'data/study.db');

const dir: string = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const client: Client = createClient({
  url: `file:${DB_PATH}`,
});

export const db = drizzle(client, { schema });
export { client };
