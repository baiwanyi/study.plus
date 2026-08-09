import { client } from './index'

/**
 * 一次性历史数据迁移：将现有学习心得按 (subject, topic) 分组生成课程，
 * 并把组内第一条心得关联到对应课程（lesson_id），重复课题心得保持 NULL 不丢数据。
 *
 * 运行方式：pnpm --filter @study/server db:lessons-migrate
 */
interface StudynoteRow {
    id: number
    subject: string
    topic: string
}

async function migrate(): Promise<void> {
    console.log('Starting migration: build study_lessons from studynotes...')

    const rows = (await client.execute(
        'SELECT id, subject, topic FROM studynotes WHERE lesson_id IS NULL ORDER BY created_at ASC',
    )) as unknown as { rows: StudynoteRow[] }

    let lessonCreated = 0
    let noteLinked = 0

    for (const row of rows.rows) {
        const subject = row.subject
        const topic = row.topic || '未命名课题'

        // 查找是否已存在相同学科+课题的课程，避免重复建课
        const existing = (await client.execute({
            sql: 'SELECT id FROM study_lessons WHERE subject = ? AND topic = ?',
            args: [subject, topic],
        })) as unknown as { rows: { id: number }[] }

        let lessonId: number
        if (existing.rows.length > 0) {
            lessonId = existing.rows[0].id
        } else {
            const created = (await client.execute({
                sql: 'INSERT INTO study_lessons (subject, topic) VALUES (?, ?) RETURNING id',
                args: [subject, topic],
            })) as unknown as { rows: { id: number }[] }
            lessonId = created.rows[0].id
            lessonCreated++
        }

        await client.execute({
            sql: 'UPDATE studynotes SET lesson_id = ? WHERE id = ?',
            args: [lessonId, row.id],
        })
        noteLinked++
    }

    console.log(
        `Migration completed: created ${lessonCreated} lessons, linked ${noteLinked} studynotes.`,
    )
}

migrate().catch((err: Error) => {
    console.error('Migration failed:', err.message)
    process.exit(1)
})
