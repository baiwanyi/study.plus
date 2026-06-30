import fs from 'fs'
import path from 'path'
import { createClient } from '@libsql/client'
import dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

const serverRoot = path.resolve(import.meta.dirname, '..', '..')
const envPath = path.resolve(serverRoot, '.env')
dotenv.config({ path: envPath })

const DB_PATH = process.env.DB_PATH
    ? path.resolve(serverRoot, process.env.DB_PATH)
    : path.resolve(serverRoot, 'data', 'study.db')

const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
}

const client = createClient({
    url: `file:${DB_PATH}`,
})

export const db = drizzle(client, { schema })
export { client }
