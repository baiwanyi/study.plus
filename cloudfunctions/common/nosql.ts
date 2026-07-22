import cloudbase from '@cloudbase/node-sdk'
import { ENV_ID } from './config'

const app = cloudbase.init({ env: ENV_ID })

/** CloudBase NoSQL（文档数据库）实例，用于 options 等配置类数据 */
export const nosql = app.database()

/** 通用配置集合名 */
export const COLLECTION_OPTIONS = 'options'
