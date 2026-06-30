import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

const serverRoot = path.resolve(import.meta.dirname, '..', '..')
const envPath = path.resolve(serverRoot, '.env')
dotenv.config({ path: envPath })

const DB_PATH: string = process.env.DB_PATH
    ? path.resolve(serverRoot, process.env.DB_PATH)
    : path.resolve(serverRoot, 'data', 'study.db')

const dir: string = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
}

const client: Client = createClient({
    url: `file:${DB_PATH}`,
})

export const db = drizzle(client, { schema })
export { client }
