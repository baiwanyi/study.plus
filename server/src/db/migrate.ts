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

export async function migrate(): Promise<void> {
    await client.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('composition', 'mindmap', 'notes')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'expired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    try {
        await client.execute('ALTER TABLE tasks ADD COLUMN updated_at TEXT')
        console.log('Added updated_at column to tasks table.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
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
        task_id INTEGER NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        grade TEXT CHECK(grade IN ('A+', 'A', 'B', 'C', 'D', 'E')),
        ai_score TEXT,
        scored_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      detail TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        } catch (e) {
            console.warn(
                '迁移步骤跳过（通常因对象已存在）:',
                (e as Error).message,
            )
        }
    }

    try {
        await client.execute('ALTER TABLE tasks DROP COLUMN points')
        console.log('Dropped unused column: tasks.points')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }
    try {
        await client.execute('ALTER TABLE tasks DROP COLUMN deadline')
        console.log('Dropped unused column: tasks.deadline')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

    try {
        await client.execute('ALTER TABLE submissions DROP COLUMN self_grade')
        console.log('Dropped unused column: submissions.self_grade')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

    try {
        await client.execute(
            'ALTER TABLE submissions ADD COLUMN scored_at TEXT',
        )
        console.log('Added scored_at column to submissions table.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

    try {
        await client.execute(
            'ALTER TABLE submissions ADD COLUMN updated_at TEXT',
        )
        console.log('Added updated_at column to submissions table.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

    // Ensure task_id unique index (one submission per task)
    try {
        await client.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS submissions_task_id_unique ON submissions(task_id)',
        )
    } catch (e) {
        console.warn('创建 submissions 唯一索引跳过:', (e as Error).message)
    }

    try {
        await client.execute('ALTER TABLE exchanges DROP COLUMN expires_at')
        console.log('Dropped unused column: exchanges.expires_at')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }
    try {
        await client.execute('ALTER TABLE exchanges DROP COLUMN revoked_at')
        console.log('Dropped unused column: exchanges.revoked_at')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

    try {
        await client.execute('ALTER TABLE exchanges ADD COLUMN updated_at TEXT')
        console.log('Added updated_at column to exchanges table.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    try {
        await client.execute(
            'ALTER TABLE point_advances ADD COLUMN updated_at TEXT',
        )
        console.log('Added updated_at column to point_advances table.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

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
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

    try {
        await client.execute(
            'ALTER TABLE ai_usage_logs ADD COLUMN task_id INTEGER',
        )
        console.log('Added task_id column to ai_usage_logs table.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

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
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }
    try {
        await client.execute(
            'ALTER TABLE videos ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0',
        )
        console.log('Added favorite column to videos table.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

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

    // Ensure unique index on (year, week_number) for existing tables
    try {
        await client.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS week_year_unique ON weekly_reports(year, week_number)',
        )
        console.log('Created week_year_unique index on weekly_reports.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

    await client.execute(`
    CREATE TABLE IF NOT EXISTS task_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    // Ensure task_id unique index for existing tables
    try {
        await client.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS task_conversations_task_id_unique ON task_conversations(task_id)',
        )
        console.log('Created unique index on task_conversations.task_id.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

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
      weekly_report_id INTEGER NOT NULL UNIQUE REFERENCES weekly_reports(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    // Ensure weekly_report_id unique index for existing tables
    try {
        await client.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS weekly_conversations_report_id_unique ON weekly_conversations(weekly_report_id)',
        )
        console.log(
            'Created unique index on weekly_conversations.weekly_report_id.',
        )
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

    await client.execute(`
    CREATE TABLE IF NOT EXISTS weekly_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES weekly_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    // ===== 表重命名：studynotes → study_notes、studynote_quiz → study_quiz =====
    // 兼容旧库：仅当旧表存在且目标表不存在时执行 RENAME（SQLite 会自动更新引用旧表的外键）
    const tableExists = async (name: string): Promise<boolean> => {
        const result = await client.execute({
            sql: "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
            args: [name],
        })
        return result.rows.length > 0
    }
    if ((await tableExists('studynotes')) && !(await tableExists('study_notes'))) {
        await client.execute('ALTER TABLE studynotes RENAME TO study_notes')
        console.log('Renamed studynotes to study_notes.')
    }
    if (
        (await tableExists('studynote_quiz')) &&
        !(await tableExists('study_quiz'))
    ) {
        await client.execute('ALTER TABLE studynote_quiz RENAME TO study_quiz')
        console.log('Renamed studynote_quiz to study_quiz.')
    }

    await client.execute(`
    CREATE TABLE IF NOT EXISTS study_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      example TEXT NOT NULL,
      stuck_points TEXT NOT NULL,
      memory_hook TEXT,
      evaluation TEXT,
      evaluated_at TEXT,
      quiz_score REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
    console.log('Created study_notes table.')

    await client.execute(`
    CREATE TABLE IF NOT EXISTS study_quiz (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studynote_id INTEGER NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
      questions_json TEXT NOT NULL,
      answers_json TEXT,
      results_json TEXT,
      score REAL,
      correct_count INTEGER,
      comment TEXT NOT NULL DEFAULT '',
      suggestions_json TEXT NOT NULL DEFAULT '[]',
      generated_at TEXT NOT NULL,
      submitted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
    console.log('Created study_quiz table.')

    // 一条笔记仅对应一套测验：为 studynote_id 补唯一索引（幂等）
    try {
        await client.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS study_quiz_studynote_id_unique ON study_quiz(studynote_id)',
        )
        console.log('Created unique index on study_quiz.studynote_id.')
    } catch (e) {
        console.warn('创建 study_quiz 唯一索引跳过:', (e as Error).message)
    }

    // ===== 课程维度学习中心：study_lessons / study_previews =====
    await client.execute(`
    CREATE TABLE IF NOT EXISTS study_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
    console.log('Created study_lessons table.')

    // 学科+课题 唯一索引，防止重复建课
    try {
        await client.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS study_lessons_subject_topic_unique ON study_lessons(subject, topic)',
        )
        console.log('Created unique index on study_lessons(subject, topic).')
    } catch (e) {
        console.warn('创建课程唯一索引跳过:', (e as Error).message)
    }

    await client.execute(`
    CREATE TABLE IF NOT EXISTS study_previews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL UNIQUE REFERENCES study_lessons(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      old_knowledge TEXT NOT NULL DEFAULT '',
      questions TEXT NOT NULL DEFAULT '',
      ai_analysis TEXT,
      ai_analyzed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
    console.log('Created study_previews table.')

    // study_notes 表增加 lesson_id（幂等：列已存在时 ALTER 抛错跳过）
    try {
        await client.execute(
            'ALTER TABLE study_notes ADD COLUMN lesson_id INTEGER REFERENCES study_lessons(id) ON DELETE CASCADE',
        )
        console.log('Added lesson_id column to study_notes table.')
    } catch (e) {
        console.warn('迁移步骤跳过（通常因对象已存在）:', (e as Error).message)
    }

    // 按课程筛笔记的高频查询：为 lesson_id 补索引（幂等）
    try {
        await client.execute(
            'CREATE INDEX IF NOT EXISTS study_notes_lesson_id_idx ON study_notes(lesson_id)',
        )
        console.log('Created index on study_notes.lesson_id.')
    } catch (e) {
        console.warn('创建 study_notes 索引跳过:', (e as Error).message)
    }

    // 按会话拉取消息的高频查询：为消息表 conversation_id 补索引（幂等）
    try {
        await client.execute(
            'CREATE INDEX IF NOT EXISTS task_messages_conversation_id_idx ON task_messages(conversation_id)',
        )
        console.log('Created index on task_messages.conversation_id.')
    } catch (e) {
        console.warn('创建 task_messages 索引跳过:', (e as Error).message)
    }
    try {
        await client.execute(
            'CREATE INDEX IF NOT EXISTS weekly_messages_conversation_id_idx ON weekly_messages(conversation_id)',
        )
        console.log('Created index on weekly_messages.conversation_id.')
    } catch (e) {
        console.warn('创建 weekly_messages 索引跳过:', (e as Error).message)
    }

    // ===== 成绩精度修复：score/quiz_score 列由 INTEGER 改为 REAL，并重算历史成绩 =====
    // SQLite 的 INTEGER 列亲和性会把插入的浮点分取整，导致 99.5 存成 100。
    // 通过 rename → add(REAL) → 回填 → drop 旧列 的方式改变列亲和性（幂等）。
    const colIsInteger = async (
        table: string,
        column: string,
    ): Promise<boolean> => {
        const info = await client.execute({
            sql: `PRAGMA table_info(${table})`,
            args: [],
        })
        const col = info.rows.find(
            (r) => (r as unknown as { name: string }).name === column,
        )
        return !!col && (col as unknown as { type: string }).type === 'INTEGER'
    }

    const colExists = async (
        table: string,
        column: string,
    ): Promise<boolean> => {
        const info = await client.execute({
            sql: `PRAGMA table_info(${table})`,
            args: [],
        })
        return info.rows.some(
            (r) => (r as unknown as { name: string }).name === column,
        )
    }

    const changeColumnToReal = async (
        table: string,
        column: string,
    ): Promise<void> => {
        if (!(await colIsInteger(table, column))) {
            console.log(`列 ${table}.${column} 已为 REAL，跳过变更。`)
            return
        }
        console.log(`将 ${table}.${column} 列类型由 INTEGER 改为 REAL...`)
        const tmp = `${column}_old`
        await client.execute({
            sql: `ALTER TABLE ${table} RENAME COLUMN ${column} TO ${tmp}`,
            args: [],
        })
        await client.execute({
            sql: `ALTER TABLE ${table} ADD COLUMN ${column} REAL`,
            args: [],
        })
        await client.execute({
            sql: `UPDATE ${table} SET ${column} = ${tmp}`,
            args: [],
        })
        await client.execute({
            sql: `ALTER TABLE ${table} DROP COLUMN ${tmp}`,
            args: [],
        })
        console.log(`列 ${table}.${column} 已变更为 REAL。`)
    }

    await changeColumnToReal('study_quiz', 'score')
    await changeColumnToReal('study_notes', 'quiz_score')

    // 基于已存的 results_json 重新计算百分制成绩（保留一位小数），修正被取整的历史数据
    try {
        const quizzes = await client.execute(
            'SELECT id, study_id, results_json, score FROM study_quiz',
        )
        let recalculated = 0
        for (const row of quizzes.rows) {
            const q = row as unknown as {
                id: number
                study_id: number
                results_json: string | null
                score: number | null
            }
            let newScore: number | null = null
            if (q.results_json) {
                try {
                    const results = JSON.parse(q.results_json) as Array<{
                        score?: number
                    }>
                    if (Array.isArray(results) && results.length > 0) {
                        const totalScore = results.reduce(
                            (sum, r) => sum + (r.score || 0),
                            0,
                        )
                        newScore =
                            Math.round(
                                (totalScore / (results.length * 10)) *
                                    100 *
                                    10,
                            ) / 10
                    }
                } catch {
                    // results_json 解析失败时沿用原 score
                }
            }
            if (newScore === null) newScore = q.score
            await client.execute({
                sql: 'UPDATE study_quiz SET score = ? WHERE id = ?',
                args: [newScore, q.id],
            })
            await client.execute({
                sql: 'UPDATE study_notes SET quiz_score = ? WHERE id = ?',
                args: [newScore, q.study_id],
            })
            recalculated++
        }
        console.log(`已重新计算 ${recalculated} 条历史测验成绩。`)
    } catch (e) {
        console.warn('历史成绩重算跳过:', (e as Error).message)
    }

    // ===== 模型去冗余与关联重构 =====
    // 1) study_notes 去掉冗余的 subject/topic 列（权威来源为 study_lessons）
    // 2) study_quiz.studynote_id 改为 study_id，直接关联 study_lessons.id
    // 采用重建表方式，确保外键指向正确且数据经 notes.lesson_id 完整迁移。

    // 1) study_notes 去冗余列（libSQL 支持 DROP COLUMN，幂等）
    const notesHasSubject = await colExists('study_notes', 'subject')
    if (notesHasSubject) {
        await client.execute('ALTER TABLE study_notes DROP COLUMN subject')
        console.log('Dropped study_notes.subject.')
    }
    const notesHasTopic = await colExists('study_notes', 'topic')
    if (notesHasTopic) {
        await client.execute('ALTER TABLE study_notes DROP COLUMN topic')
        console.log('Dropped study_notes.topic.')
    }

    // 2) study_quiz 重建为 study_id 关联 study_lessons
    const quizHasOldCol = await colExists('study_quiz', 'studynote_id')
    if (quizHasOldCol) {
        // 备份旧表
        await client.execute(
            'ALTER TABLE study_quiz RENAME TO study_quiz_old',
        )
        // 新建结构：study_id 关联 study_lessons
        await client.execute(`
            CREATE TABLE study_quiz (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                study_id INTEGER NOT NULL UNIQUE REFERENCES study_lessons(id) ON DELETE CASCADE,
                questions_json TEXT NOT NULL,
                answers_json TEXT,
                results_json TEXT,
                score REAL,
                correct_count INTEGER,
                comment TEXT NOT NULL DEFAULT '',
                suggestions_json TEXT NOT NULL DEFAULT '[]',
                generated_at TEXT NOT NULL,
                submitted_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        `)
        // 数据回填：study_id = lessons.id，经 notes.lesson_id 关联
        await client.execute(`
            INSERT INTO study_quiz (
                id, study_id, questions_json, answers_json, results_json,
                score, correct_count, comment, suggestions_json,
                generated_at, submitted_at, created_at
            )
            SELECT
                q.id,
                l.id AS study_id,
                q.questions_json, q.answers_json, q.results_json,
                q.score, q.correct_count, q.comment, q.suggestions_json,
                q.generated_at, q.submitted_at, q.created_at
            FROM study_quiz_old q
            JOIN study_notes n ON n.id = q.studynote_id
            JOIN study_lessons l ON l.id = n.lesson_id
        `)
        // 重置自增序列
        const maxId = await client.execute(
            'SELECT MAX(id) as max_id FROM study_quiz',
        )
        const nextId = Number(maxId.rows[0]?.max_id ?? 0) + 1
        await client.execute({
            sql: 'DELETE FROM sqlite_sequence WHERE name = ?',
            args: ['study_quiz'],
        })
        await client.execute({
            sql: 'INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)',
            args: ['study_quiz', nextId - 1],
        })
        await client.execute('DROP TABLE study_quiz_old')
        console.log('Rebuilt study_quiz with study_id -> study_lessons.')
    } else {
        // 首次建表或已迁移：无需处理，后续统一迁移块会确保部分唯一索引
    }

    // ===== study_quiz 支持多套历史：去除 study_id 全量唯一，改为部分唯一索引 =====
    // 需求：已提交的测验保留为历史，重新生成时插入新行。
    // 约束改为「同一课程同时最多一套未提交(进行中)测验」，已提交记录可多条。
    // 幂等：检测到全量唯一约束（partial=0 且非主键）时重建表去除，再建部分唯一索引。
    const quizIndexList = await client.execute(
        "PRAGMA index_list('study_quiz')",
    )
    const hasFullUnique = quizIndexList.rows.some((row) => {
        const r = row as unknown as {
            unique: number
            origin: string
            partial: number
        }
        return r.unique === 1 && r.partial === 0 && r.origin !== 'pk'
    })
    if (hasFullUnique) {
        console.log('Rebuilding study_quiz to drop full unique(study_id)...')
        await client.execute(
            'ALTER TABLE study_quiz RENAME TO study_quiz_old',
        )
        await client.execute(`
            CREATE TABLE study_quiz (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                study_id INTEGER NOT NULL REFERENCES study_lessons(id) ON DELETE CASCADE,
                questions_json TEXT NOT NULL,
                answers_json TEXT,
                results_json TEXT,
                score REAL,
                correct_count INTEGER,
                comment TEXT NOT NULL DEFAULT '',
                suggestions_json TEXT NOT NULL DEFAULT '[]',
                generated_at TEXT NOT NULL,
                submitted_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        `)
        await client.execute(
            'INSERT INTO study_quiz SELECT id, study_id, questions_json, answers_json, results_json, score, correct_count, comment, suggestions_json, generated_at, submitted_at, created_at FROM study_quiz_old',
        )
        const maxId = await client.execute(
            'SELECT MAX(id) as max_id FROM study_quiz',
        )
        const nextId = Number(maxId.rows[0]?.max_id ?? 0) + 1
        await client.execute({
            sql: 'DELETE FROM sqlite_sequence WHERE name = ?',
            args: ['study_quiz'],
        })
        await client.execute({
            sql: 'INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)',
            args: ['study_quiz', nextId - 1],
        })
        await client.execute('DROP TABLE study_quiz_old')
        console.log('Dropped full unique constraint on study_quiz.study_id.')
    }

    // 确保部分唯一索引存在（幂等）：同一课程同时最多一套未提交测验
    try {
        await client.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS study_quiz_study_id_pending_unique ON study_quiz(study_id) WHERE submitted_at IS NULL',
        )
    } catch (e) {
        console.warn('创建 study_quiz 部分唯一索引跳过:', (e as Error).message)
    }

    console.log('Migration completed successfully!')
}

// 仅当作为脚本直接运行时执行迁移；被测试 import 时不触发，避免 vitest 内意外退出。
if (import.meta.main) {
    migrate().catch((err: Error) => {
        console.error('Migration failed:', err.message)
        process.exit(1)
    })
}
