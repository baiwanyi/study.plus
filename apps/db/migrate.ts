import { client } from '@apps/db/index'
import {
    defaultQuotes,
    defaultHomeworkRules,
    defaultExamRules,
    defaultExchangeRules,
    defaultSystemSettings,
} from '@apps/lib/default'

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

    // Migrate submissions table to add 'E' grade support
    // Check if the current CHECK constraint includes 'E'
    const submissionsExists = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='submissions'",
    )
    if (submissionsExists.rows.length > 0) {
        // Check if we need to migrate by trying to insert a test value
        try {
            // Try to see if the current constraint allows 'E'
            await client.execute(
                "SELECT grade FROM submissions WHERE grade = 'E' LIMIT 1",
            )
        } catch {
            // Need to recreate the table with E support
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
            // Copy data excluding self_grade column
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

    // Migrate exchanges table to remove item_type CHECK constraint (allow any string)
    const exchangesExists = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='exchanges'",
    )
    if (exchangesExists.rows.length > 0) {
        // Check if item_type still has the old CHECK constraint
        try {
            // Try inserting a non-standard item_type to see if constraint exists
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
        } catch {
            // Migration not needed or already done
        }
    }

    // Drop unused columns from tasks table
    try {
        await client.execute('ALTER TABLE tasks DROP COLUMN points')
        console.log('Dropped unused column: tasks.points')
    } catch {
        // Column already dropped or doesn't exist
    }
    try {
        await client.execute('ALTER TABLE tasks DROP COLUMN deadline')
        console.log('Dropped unused column: tasks.deadline')
    } catch {
        // Column already dropped or doesn't exist
    }

    // Drop unused column from submissions table
    try {
        await client.execute('ALTER TABLE submissions DROP COLUMN self_grade')
        console.log('Dropped unused column: submissions.self_grade')
    } catch {
        // Column already dropped or doesn't exist
    }

    // Add scored_at column to submissions if missing
    try {
        await client.execute(
            'ALTER TABLE submissions ADD COLUMN scored_at TEXT',
        )
        console.log('Added scored_at column to submissions table.')
    } catch {
        // Column already exists, ignore
    }

    // Add expires_at column if missing (for existing databases)
    // NOTE: expires_at and revoked_at are no longer used, will be dropped below

    // Drop unused columns from exchanges table
    try {
        await client.execute('ALTER TABLE exchanges DROP COLUMN expires_at')
        console.log('Dropped unused column: exchanges.expires_at')
    } catch {
        // Column already dropped or doesn't exist
    }
    try {
        await client.execute('ALTER TABLE exchanges DROP COLUMN revoked_at')
        console.log('Dropped unused column: exchanges.revoked_at')
    } catch {
        // Column already dropped or doesn't exist
    }

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

    // Migrate month_summary to add total_exchanges column if not exists
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

    // Add task_title column if missing (for existing databases)
    try {
        await client.execute(
            'ALTER TABLE ai_usage_logs ADD COLUMN task_title TEXT',
        )
        console.log('Added task_title column to ai_usage_logs table.')
    } catch {
        // Column already exists, ignore
    }

    // Add task_id column if missing (for existing databases)
    try {
        await client.execute(
            'ALTER TABLE ai_usage_logs ADD COLUMN task_id INTEGER',
        )
        console.log('Added task_id column to ai_usage_logs table.')
    } catch {
        // Column already exists, ignore
    }

    // Migrate from single 'default' key to separate keys
    // If old 'default' key exists, split it into separate rows
    const oldDefault = await client.execute(
        "SELECT value FROM options WHERE key = 'default'",
    )
    if (oldDefault.rows.length > 0) {
        try {
            const raw = JSON.parse(oldDefault.rows[0].value as string)
            const src = raw?.rules ?? raw?.value ?? raw

            // Extract and insert separate keys (skip if already exist)
            const separateKeys: { key: string; value: unknown }[] = []

            // homework
            const homework = src?.gradingScale?.homework ?? src?.homework
            if (homework)
                separateKeys.push({ key: 'homework', value: homework })

            // exam
            const examScoreRules = src?.examScoreRules ?? src?.exam?.ranges
            if (Array.isArray(examScoreRules) && examScoreRules.length > 0)
                separateKeys.push({ key: 'exam', value: examScoreRules })

            // exchange
            const exchange = src?.exchangeRates ?? src?.exchange
            if (exchange)
                separateKeys.push({ key: 'exchange', value: exchange })

            // custom
            const custom = src?.customRules ?? src?.custom
            if (custom) separateKeys.push({ key: 'custom', value: custom })

            // system
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

            // Delete old default key
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

    // Ensure homework rules contain all default grades (C, D, E may be missing from older data)
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
                    // Add missing grades and update
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

    // Insert default separate rules if they don't exist
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

    // Migrate exam key: remove basePoints/privilegeMinPoints from exam data, ensure they are in system key
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
                // Move to system key
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
                // Remove old fields from exam
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

    // Create current month summary if not exists
    const currentMonth: string = new Date().toISOString().slice(0, 7)
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

    // Create videos table
    await client.execute(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      title TEXT NOT NULL,
      md5 TEXT NOT NULL UNIQUE,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    console.log('Migration completed successfully!')
}

migrate().catch((err: Error) => {
    console.error('Migration failed:', err.message)
    process.exit(1)
})
