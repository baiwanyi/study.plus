import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

const appRoot = path.resolve(import.meta.dirname, '..', '..')
const envPath = path.resolve(appRoot, '.env')
dotenv.config({ path: envPath })

const DB_PATH: string = process.env.DB_PATH
    ? path.resolve(appRoot, process.env.DB_PATH)
    : path.resolve(appRoot, 'data/study.db')

const dir: string = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
}

const client: Client = createClient({
    url: `file:${DB_PATH}`,
})

export const db = drizzle(client, { schema })
export { client }
