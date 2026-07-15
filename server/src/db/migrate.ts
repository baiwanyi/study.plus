import {
    defaultQuotes,
    defaultHomeworkRules,
    defaultExamRules,
    defaultExchangeRules,
    defaultSystemSettings,
    DEFAULT_WEEKLY_AI_HELPER,
} from '@shared/constants'
import { client } from './index'

console.log('Running database migration...')

async function migrate(): Promise<void> {
    await client.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('composition', 'mindmap', 'notes')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'expired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    const tasksOldResult = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_old'",
    )
    if (tasksOldResult.rows.length > 0) {
        console.log('Found leftover tasks_old table, migrating data...')
        await client.execute('PRAGMA foreign_keys = OFF')
        const oldCount = await client.execute(
            'SELECT COUNT(*) as cnt FROM tasks_old',
        )
        const hasData =
            ((oldCount.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0) > 0
        if (!hasData) {
            console.log('tasks_old is empty, dropping without restoring.')
            await client.execute('DROP TABLE tasks_old')
            await client.execute('PRAGMA foreign_keys = ON')
        } else {
            await client.execute('DELETE FROM tasks')
            await client.execute(
                "INSERT INTO tasks (id, title, type, status, created_at) SELECT id, title, type, status, created_at FROM tasks_old WHERE type IN ('composition', 'mindmap', 'notes')",
            )
            const maxId = await client.execute(
                'SELECT MAX(id) as max_id FROM tasks',
            )
            const nextId = Number(maxId.rows[0]?.max_id ?? 0) + 1
            await client.execute({
                sql: 'DELETE FROM sqlite_sequence WHERE name = ?',
                args: ['tasks'],
            })
            await client.execute({
                sql: 'INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)',
                args: ['tasks', nextId - 1],
            })
            await client.execute('DROP TABLE tasks_old')
            await client.execute('PRAGMA foreign_keys = ON')
            console.log('Leftover tasks_old migrated successfully.')
        }
    }

    await client.execute('PRAGMA foreign_keys = OFF')

    // Migrate tasks table: remove math and english types
    const currentTasksSql = await client.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'",
    )
    const currentTasksCheck = currentTasksSql.rows[0]?.sql as string | undefined
    if (currentTasksCheck && currentTasksCheck.includes('math')) {
        console.log('Migrating tasks table to remove math and english types...')
        await client.execute('ALTER TABLE tasks RENAME TO tasks_old')
        await client.execute(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('composition', 'mindmap', 'notes')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'expired')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
        await client.execute(
            "INSERT INTO tasks (id, title, type, status, created_at) SELECT id, title, type, status, created_at FROM tasks_old WHERE type IN ('composition', 'mindmap', 'notes')",
        )
        await client.execute('DROP TABLE tasks_old')
        console.log('Tasks table migrated to remove math/english types.')
    }

    const subFKResult = await client.execute(
        'PRAGMA foreign_key_list(submissions)',
    )
    const subFKTable = subFKResult.rows[0]?.table as string | undefined
    if (subFKTable === 'tasks_old') {
        console.log(
            'Fixing submissions FK reference from tasks_old to tasks...',
        )
        await client.execute(
            'ALTER TABLE submissions RENAME TO submissions_old',
        )
        await client.execute(`
      CREATE TABLE submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        content TEXT NOT NULL,
        grade TEXT CHECK(grade IN ('A+', 'A', 'B', 'C', 'D', 'E')),
        ai_score TEXT,
        scored_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
        await client.execute(
            'INSERT INTO submissions (id, task_id, content, grade, ai_score, scored_at, created_at) SELECT id, task_id, content, grade, ai_score, scored_at, created_at FROM submissions_old',
        )
        await client.execute('DROP TABLE submissions_old')
        console.log('Submissions FK fixed successfully.')
    }
    await client.execute('PRAGMA foreign_keys = ON')

    const submissionsExists = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='submissions'",
    )
    if (submissionsExists.rows.length > 0) {
        try {
            await client.execute(
                "SELECT grade FROM submissions WHERE grade = 'E' LIMIT 1",
            )
        } catch {
            console.log('Migrating submissions table to support E grade...')
            await client.execute(
                'ALTER TABLE submissions RENAME TO submissions_old',
            )
            await client.execute(`
        CREATE TABLE submissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL REFERENCES tasks(id),
          content TEXT NOT NULL,
          grade TEXT CHECK(grade IN ('A+', 'A', 'B', 'C', 'D', 'E')),
          ai_score TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
            await client.execute(
                'INSERT INTO submissions (id, task_id, content, grade, ai_score, created_at) SELECT id, task_id, content, grade, ai_score, created_at FROM submissions_old',
            )
            await client.execute('DROP TABLE submissions_old')
            console.log('Submissions table migrated successfully.')
        }
    } else {
        await client.execute(`
      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        content TEXT NOT NULL,
        grade TEXT CHECK(grade IN ('A+', 'A', 'B', 'C', 'D', 'E')),
        ai_score TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    }

    await client.execute(`
    CREATE TABLE IF NOT EXISTS point_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('earn', 'deduct')),
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      rule_name TEXT,
      related_id INTEGER,
      related_type TEXT CHECK(related_type IN ('task', 'submission', 'exam', 'extra', 'custom', 'exchange', 'revoked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    await client.execute(`
    CREATE TABLE IF NOT EXISTS exchanges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL,
      points_cost INTEGER NOT NULL,
      detail TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    const exchangesExists = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='exchanges'",
    )
    if (exchangesExists.rows.length > 0) {
        try {
            const testResult = await client.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='exchanges'",
            )
            const tableSql = testResult.rows[0]?.sql as string | undefined
            if (
                tableSql &&
                tableSql.includes('item_type') &&
                tableSql.includes('CHECK')
            ) {
                console.log(
                    'Migrating exchanges table to support dynamic item_type...',
                )
                await client.execute(
                    'ALTER TABLE exchanges RENAME TO exchanges_old',
                )
                await client.execute(`
          CREATE TABLE exchanges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_type TEXT NOT NULL,
            points_cost INTEGER NOT NULL,
            detail TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)
                await client.execute(
                    'INSERT INTO exchanges SELECT * FROM exchanges_old',
                )
                await client.execute('DROP TABLE exchanges_old')
                console.log('Exchanges table migrated successfully.')
            }
        } catch {}
    }

    try {
        await client.execute('ALTER TABLE tasks DROP COLUMN points')
        console.log('Dropped unused column: tasks.points')
    } catch {}
    try {
        await client.execute('ALTER TABLE tasks DROP COLUMN deadline')
        console.log('Dropped unused column: tasks.deadline')
    } catch {}

    try {
        await client.execute('ALTER TABLE submissions DROP COLUMN self_grade')
        console.log('Dropped unused column: submissions.self_grade')
    } catch {}

    try {
        await client.execute(
            'ALTER TABLE submissions ADD COLUMN scored_at TEXT',
        )
        console.log('Added scored_at column to submissions table.')
    } catch {}

    try {
        await client.execute('ALTER TABLE exchanges DROP COLUMN expires_at')
        console.log('Dropped unused column: exchanges.expires_at')
    } catch {}
    try {
        await client.execute('ALTER TABLE exchanges DROP COLUMN revoked_at')
        console.log('Dropped unused column: exchanges.revoked_at')
    } catch {}

    await client.execute(`
    CREATE TABLE IF NOT EXISTS options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL
    )
  `)

    await client.execute(`
    CREATE TABLE IF NOT EXISTS point_advances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL,
      total_repayment INTEGER NOT NULL,
      installments INTEGER NOT NULL,
      installment_amount INTEGER NOT NULL,
      paid_installments INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    await client.execute(`
    CREATE TABLE IF NOT EXISTS month_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL UNIQUE,
      base_points INTEGER NOT NULL DEFAULT 500,
      total_earn INTEGER NOT NULL DEFAULT 0,
      total_deduct INTEGER NOT NULL DEFAULT 0,
      total_exchanges INTEGER NOT NULL DEFAULT 0,
      balance INTEGER NOT NULL DEFAULT 500
    )
  `)

    const monthSummaryColumns = await client.execute(
        'PRAGMA table_info(month_summary)',
    )
    const hasTotalExchanges = monthSummaryColumns.rows.some(
        (col) =>
            (col as unknown as { name: string }).name === 'total_exchanges',
    )
    if (!hasTotalExchanges) {
        await client.execute(
            'ALTER TABLE month_summary ADD COLUMN total_exchanges INTEGER NOT NULL DEFAULT 0',
        )
        console.log('Added total_exchanges column to month_summary table.')
    }

    await client.execute(`
    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      task_title TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    try {
        await client.execute(
            'ALTER TABLE ai_usage_logs ADD COLUMN task_title TEXT',
        )
        console.log('Added task_title column to ai_usage_logs table.')
    } catch {}

    try {
        await client.execute(
            'ALTER TABLE ai_usage_logs ADD COLUMN task_id INTEGER',
        )
        console.log('Added task_id column to ai_usage_logs table.')
    } catch {}

    await client.execute(`
    CREATE TABLE IF NOT EXISTS ai_score_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      submission_id INTEGER NOT NULL REFERENCES submissions(id),
      content TEXT NOT NULL,
      grade TEXT CHECK(grade IN ('A+', 'A', 'B', 'C', 'D', 'E')),
      ai_score TEXT NOT NULL,
      scored_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
    console.log('Created ai_score_logs table.')

    const oldDefault = await client.execute(
        "SELECT value FROM options WHERE key = 'default'",
    )
    if (oldDefault.rows.length > 0) {
        try {
            const raw = JSON.parse(oldDefault.rows[0].value as string)
            const src = raw?.rules ?? raw?.value ?? raw

            const separateKeys: { key: string; value: unknown }[] = []

            const homework = src?.gradingScale?.homework ?? src?.homework
            if (homework)
                separateKeys.push({ key: 'homework', value: homework })

            const examScoreRules = src?.examScoreRules ?? src?.exam?.ranges
            if (Array.isArray(examScoreRules) && examScoreRules.length > 0)
                separateKeys.push({ key: 'exam', value: examScoreRules })

            const exchange = src?.exchangeRates ?? src?.exchange
            if (exchange)
                separateKeys.push({ key: 'exchange', value: exchange })

            const custom = src?.customRules ?? src?.custom
            if (custom) separateKeys.push({ key: 'custom', value: custom })

            const system: Record<string, unknown> = {}
            if (src?.monthlyBasePoints)
                system.monthlyBasePoints = src.monthlyBasePoints
            else if (src?.exam?.basePoints)
                system.monthlyBasePoints = src.exam.basePoints
            if (src?.minimumPointsForPrivileges)
                system.minimumPointsForPrivileges =
                    src.minimumPointsForPrivileges
            else if (src?.exam?.privilegeMinPoints)
                system.minimumPointsForPrivileges = src.exam.privilegeMinPoints
            if (Object.keys(system).length > 0)
                separateKeys.push({ key: 'system', value: system })

            for (const item of separateKeys) {
                const existing = await client.execute({
                    sql: 'SELECT id FROM options WHERE key = ?',
                    args: [item.key],
                })
                if (existing.rows.length === 0) {
                    await client.execute({
                        sql: 'INSERT INTO options (key, value) VALUES (?, ?)',
                        args: [item.key, JSON.stringify(item.value)],
                    })
                    console.log(`Migrated rule key: ${item.key}`)
                }
            }

            await client.execute("DELETE FROM options WHERE key = 'default'")
            console.log(
                'Migrated rules from single default key to separate keys.',
            )
        } catch (e) {
            console.log(
                'Failed to parse old default rules, inserting new separate keys instead.',
            )
        }
    }

    try {
        const homeworkRow = await client.execute({
            sql: "SELECT value FROM options WHERE key = 'homework'",
            args: [],
        })
        if (homeworkRow.rows.length > 0) {
            const homeworkVal = JSON.parse(
                homeworkRow.rows[0].value as string,
            ) as Array<{ grade: string; points: number }>
            if (Array.isArray(homeworkVal)) {
                const existingGrades = new Set(homeworkVal.map((g) => g.grade))
                const missingGrades = defaultHomeworkRules.filter(
                    (d) => !existingGrades.has(d.grade),
                )
                if (missingGrades.length > 0) {
                    const updatedHomework = [...homeworkVal, ...missingGrades]
                    await client.execute({
                        sql: "UPDATE options SET value = ? WHERE key = 'homework'",
                        args: [JSON.stringify(updatedHomework)],
                    })
                    console.log(
                        `Added missing homework grades: ${missingGrades.map((g) => g.grade).join(', ')}`,
                    )
                }
            }
        }
    } catch (e) {
        console.log('Homework rules migration skipped:', (e as Error).message)
    }

    const defaultRules: { key: string; value: string }[] = [
        {
            key: 'quotes',
            value: JSON.stringify(defaultQuotes),
        },
        {
            key: 'homework',
            value: JSON.stringify(defaultHomeworkRules),
        },
        {
            key: 'exam',
            value: JSON.stringify(defaultExamRules),
        },
        {
            key: 'exchange',
            value: JSON.stringify(defaultExchangeRules),
        },
        {
            key: 'custom',
            value: JSON.stringify([]),
        },
        {
            key: 'system',
            value: JSON.stringify(defaultSystemSettings),
        },
        {
            key: 'weeklyAiHelper',
            value: JSON.stringify(DEFAULT_WEEKLY_AI_HELPER),
        },
    ]

    for (const rule of defaultRules) {
        const existing = await client.execute({
            sql: 'SELECT id FROM options WHERE key = ?',
            args: [rule.key],
        })
        if (existing.rows.length === 0) {
            await client.execute({
                sql: 'INSERT INTO options (key, value) VALUES (?, ?)',
                args: [rule.key, rule.value],
            })
            console.log(`Default rule inserted: ${rule.key}`)
        }
    }

    try {
        const examRow = await client.execute({
            sql: "SELECT value FROM options WHERE key = 'exam'",
            args: [],
        })
        if (examRow.rows.length > 0) {
            const examVal = JSON.parse(
                examRow.rows[0].value as string,
            ) as Record<string, unknown>
            if (
                examVal.basePoints !== undefined ||
                examVal.privilegeMinPoints !== undefined
            ) {
                const systemRow = await client.execute({
                    sql: "SELECT value FROM options WHERE key = 'system'",
                    args: [],
                })
                let systemVal: Record<string, unknown> = {}
                if (systemRow.rows.length > 0) {
                    systemVal = JSON.parse(
                        systemRow.rows[0].value as string,
                    ) as Record<string, unknown>
                }
                if (
                    systemVal.monthlyBasePoints === undefined &&
                    examVal.basePoints !== undefined
                ) {
                    systemVal.monthlyBasePoints = examVal.basePoints
                }
                if (
                    systemVal.minimumPointsForPrivileges === undefined &&
                    examVal.privilegeMinPoints !== undefined
                ) {
                    systemVal.minimumPointsForPrivileges =
                        examVal.privilegeMinPoints
                }
                delete examVal.basePoints
                delete examVal.privilegeMinPoints
                await client.execute({
                    sql: "UPDATE options SET value = ? WHERE key = 'exam'",
                    args: [JSON.stringify(examVal)],
                })
                if (systemRow.rows.length > 0) {
                    await client.execute({
                        sql: "UPDATE options SET value = ? WHERE key = 'system'",
                        args: [JSON.stringify(systemVal)],
                    })
                } else {
                    await client.execute({
                        sql: "INSERT INTO options (key, value) VALUES ('system', ?)",
                        args: [JSON.stringify(systemVal)],
                    })
                }
                console.log(
                    'Migrated basePoints/privilegeMinPoints from exam to system key.',
                )
            }
        }
    } catch (e) {
        console.log(
            'Exam→system key migration skipped or already done:',
            (e as Error).message,
        )
    }

    const currentMonth = new Date().toISOString().slice(0, 7)
    const existingMonth = await client.execute({
        sql: 'SELECT id FROM month_summary WHERE month = ?',
        args: [currentMonth],
    })
    if (existingMonth.rows.length === 0) {
        await client.execute({
            sql: 'INSERT INTO month_summary (month, base_points, total_earn, total_deduct, total_exchanges, balance) VALUES (?, 500, 0, 0, 0, 500)',
            args: [currentMonth],
        })
        console.log(`Month summary for ${currentMonth} created.`)
    }

    await client.execute(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      title TEXT NOT NULL,
      md5 TEXT NOT NULL UNIQUE,
      views INTEGER NOT NULL DEFAULT 0,
      resume_time INTEGER NOT NULL DEFAULT 0,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    try {
        await client.execute(
            'ALTER TABLE videos ADD COLUMN resume_time INTEGER NOT NULL DEFAULT 0',
        )
        console.log('Added resume_time column to videos table.')
    } catch {}
    try {
        await client.execute(
            'ALTER TABLE videos ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0',
        )
        console.log('Added favorite column to videos table.')
    } catch {}

    await client.execute(`
    CREATE TABLE IF NOT EXISTS weekly_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_number INTEGER NOT NULL,
      year INTEGER NOT NULL,
      content TEXT NOT NULL,
      analysis TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    await client.execute(`
    CREATE TABLE IF NOT EXISTS task_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    await client.execute(`
    CREATE TABLE IF NOT EXISTS task_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES task_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    await client.execute(`
    CREATE TABLE IF NOT EXISTS weekly_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weekly_report_id INTEGER NOT NULL REFERENCES weekly_reports(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    await client.execute(`
    CREATE TABLE IF NOT EXISTS weekly_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES weekly_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    await client.execute(`
    CREATE TABLE IF NOT EXISTS feynman_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      example TEXT NOT NULL,
      stuck_points TEXT NOT NULL,
      memory_hook TEXT,
      evaluation TEXT,
      evaluated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
    console.log('Created feynman_cards table.')

    await client.execute(`
    CREATE TABLE IF NOT EXISTS feynman_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feynman_card_id INTEGER NOT NULL REFERENCES feynman_cards(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
    console.log('Created feynman_conversations table.')

    await client.execute(`
    CREATE TABLE IF NOT EXISTS feynman_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES feynman_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
    console.log('Created feynman_messages table.')

    console.log('Migration completed successfully!')
}

migrate().catch((err: Error) => {
    console.error('Migration failed:', err.message)
    process.exit(1)
})
