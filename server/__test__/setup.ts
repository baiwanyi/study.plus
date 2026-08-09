// 必须在任何业务模块（db/index 等）import 之前设置，使 db/index 指向隔离内存库。
// file::memory:?cache=shared 让同一进程内所有连接共享同一内存库，避免 pushSQLiteSchema
// 建表的连接与后续业务查询的连接各自独立（默认 :memory: 每连接隔离）。
process.env.TEST_DB_URL =
    process.env.TEST_DB_URL || 'file::memory:?cache=shared'
// 测试环境固定 API Key，测试请求统一携带该 Key 通过认证守卫。
process.env.API_KEY = process.env.API_KEY || 'test-api-key'
