/**
 * 每日练字纯函数测试：覆盖 A4 几何自洽、语料 Markdown 解析、节选字数过滤与网格排版规则。
 * 用例直接引用 @shared/handwriting，与前端渲染走同一份实现，避免两份逻辑漂移。
 * 关键约束：几何用例断言「列数 × 格边 + 边距 = 纸张宽」与「行高总和 + 行距 = 可用高」，
 * 任一常量被改动而未同步换算都会在此失败，防止字帖打印时溢出到第二页。
 */
import { describe, expect, it } from 'vitest'
import {
    buildHandwritingSheet,
    CELL_ROW_GAP_MM,
    CELL_SIZE_MM,
    clampGlyphScale,
    filterPassageEntries,
    GLYPH_SCALE,
    MAX_PASSAGE_CHARS,
    maxGlyphScale,
    MIN_PASSAGE_CHARS,
    minGlyphScale,
    normalizeFontFamilyFromFile,
    parseHandwritingCorpus,
    resolveLayoutKind,
    sanitizeFontFamily,
    sanitizeHexColor,
    SHEET_COLUMNS,
    SHEET_HEIGHT_MM,
    SHEET_PADDING_X_MM,
    SHEET_PADDING_Y_MM,
    SHEET_ROWS,
    SHEET_WIDTH_MM,
    toCells,
    wrapCells,
} from '@shared/handwriting'

describe('字帖几何', () => {
    it('横向：列数 × 格边恰好填满左右留白之间的宽度', () => {
        expect(CELL_SIZE_MM * SHEET_COLUMNS).toBeCloseTo(
            SHEET_WIDTH_MM - SHEET_PADDING_X_MM * 2,
            6,
        )
    })

    it('纵向：14 行加行间距恰好填满上下留白之间的高度', () => {
        const totalHeight =
            SHEET_ROWS * CELL_SIZE_MM + (SHEET_ROWS - 1) * CELL_ROW_GAP_MM
        expect(totalHeight).toBeCloseTo(
            SHEET_HEIGHT_MM - SHEET_PADDING_Y_MM * 2,
            6,
        )
    })
})

describe('语料解析', () => {
    it('识别二级标题、朝代作者行与诗句', () => {
        const markdown = [
            '# 古诗词',
            '',
            '## 咏鹅',
            '> 〔唐代〕骆宾王',
            '> 鹅，鹅，鹅，',
            '> 曲项向天歌。',
        ].join('\n')
        const entries = parseHandwritingCorpus(markdown)
        expect(entries).toHaveLength(1)
        expect(entries[0].title).toBe('咏鹅')
        expect(entries[0].subtitle).toBe('〔唐代〕骆宾王')
        expect(entries[0].lines).toEqual(['鹅，鹅，鹅，', '曲项向天歌。'])
    })

    it('作者行之后不带引用前缀的普通行同样作为正文', () => {
        const markdown = [
            '## 送元二使安西',
            '> 〔唐代〕王维',
            '渭城朝雨浥轻尘，',
            '客舍青青柳色新。',
        ].join('\n')
        const entries = parseHandwritingCorpus(markdown)
        expect(entries).toHaveLength(1)
        expect(entries[0].subtitle).toBe('〔唐代〕王维')
        expect(entries[0].lines).toEqual([
            '渭城朝雨浥轻尘，',
            '客舍青青柳色新。',
        ])
    })

    it('跨行 HTML 注释内的说明文字不计入任何条目', () => {
        const markdown = [
            '<!--',
            '编写约定：',
            '## 不是标题',
            '> 不是作者',
            '-->',
            '## 咏鹅',
            '> 〔唐代〕骆宾王',
            '鹅，鹅，鹅，',
        ].join('\n')
        const entries = parseHandwritingCorpus(markdown)
        expect(entries).toHaveLength(1)
        expect(entries[0].title).toBe('咏鹅')
        expect(entries[0].lines).toEqual(['鹅，鹅，鹅，'])
    })

    it('首条引用含句读时视为正文，不当作副标题', () => {
        const markdown = ['## 无出处', '> 白日依山尽，', '> 黄河入海流。'].join(
            '\n',
        )
        const entries = parseHandwritingCorpus(markdown)
        expect(entries[0].subtitle).toBe('')
        expect(entries[0].lines).toHaveLength(2)
    })

    it('忽略注释与无引用正文的标题段', () => {
        const markdown = [
            '<!-- 说明 -->',
            '## 空条目',
            '',
            '## 有内容',
            '> 作者',
            '> 千里之行。',
        ].join('\n')
        const entries = parseHandwritingCorpus(markdown)
        expect(entries).toHaveLength(1)
        expect(entries[0].title).toBe('有内容')
    })

    it('节选正文不在 20–40 字区间时从随机池剔除，并单独归入 rejected 交由调用方告警', () => {
        const fill = (count: number) => '一'.repeat(count)
        const entries = [
            { title: '下限', subtitle: '', lines: [fill(MIN_PASSAGE_CHARS)] },
            { title: '上限', subtitle: '', lines: [fill(MAX_PASSAGE_CHARS)] },
            { title: '过短', subtitle: '', lines: [fill(MIN_PASSAGE_CHARS - 1)] },
            { title: '过长', subtitle: '', lines: [fill(MAX_PASSAGE_CHARS + 1)] },
        ]
        const { entries: filtered, rejected } = filterPassageEntries(entries)
        expect(filtered.map((entry) => entry.title)).toEqual(['下限', '上限'])
        expect(rejected.map((entry) => entry.title)).toEqual(['过短', '过长'])
    })
})

describe('版式判定', () => {
    it('正文多行按诗歌排版', () => {
        expect(resolveLayoutKind(['床前明月光，', '疑是地上霜。'])).toBe('poem')
    })

    it('正文只有一行按节选排版', () => {
        expect(
            resolveLayoutKind(['荷叶挨挨挤挤的，像一个个碧绿的大圆盘。']),
        ).toBe('passage')
    })

    it('空行不参与计数，单行正文仍按节选排版', () => {
        expect(resolveLayoutKind(['一', '', '  '])).toBe('passage')
    })
})

describe('网格排版', () => {
    const emptySource = { title: '', subtitle: '', lines: [] }

    it('输出恒为 14 行 × 11 格', () => {
        const sheet = buildHandwritingSheet(
            { title: '静夜思', subtitle: '〔唐代〕李白', lines: ['床前明月光，'] },
            { punctuation: 'grid', indent: 0 },
        )
        expect(sheet.rows).toHaveLength(SHEET_ROWS)
        expect(sheet.rows.every((row) => row.length === SHEET_COLUMNS)).toBe(
            true,
        )
        expect(sheet.isOverflow).toBe(false)
    })

    it('标题按格居中，留白整除时左右相等', () => {
        const sheet = buildHandwritingSheet(
            { title: '静夜思', subtitle: '', lines: [] },
            { punctuation: 'grid', indent: 0 },
        )
        const chars = sheet.rows[0].map((cell) => cell.char)
        // (11 - 3) / 2 = 4，标题落在第 5–7 格
        expect(chars.slice(0, 4).every((char) => char === '')).toBe(true)
        expect(chars.slice(4, 7).join('')).toBe('静夜思')
    })

    it('标题留白为奇数时左侧多一格', () => {
        const sheet = buildHandwritingSheet(
            { title: '静夜思月', subtitle: '', lines: [] },
            { punctuation: 'grid', indent: 0 },
        )
        const chars = sheet.rows[0].map((cell) => cell.char)
        // 4 字留白 7 格：左侧 4、右侧 3
        expect(chars.slice(0, 4).every((char) => char === '')).toBe(true)
        expect(chars.slice(4, 8).join('')).toBe('静夜思月')
        expect(chars.slice(8).every((char) => char === '')).toBe(true)
    })

    it('标点占格时每个标点单独占一格', () => {
        const sheet = buildHandwritingSheet(
            { ...emptySource, lines: ['床前明月光，'] },
            { punctuation: 'grid', indent: 0 },
        )
        const row = sheet.rows[0]
        expect(row[0].char).toBe('床')
        expect(row[5].char).toBe('，')
        expect(row[5].trailing).toBe('')
    })

    it('标点随字时标点压在前字 trailing，不占格', () => {
        const sheet = buildHandwritingSheet(
            { ...emptySource, lines: ['床前明月光，'] },
            { punctuation: 'inline', indent: 0 },
        )
        const row = sheet.rows[0]
        expect(row[4].char).toBe('光')
        expect(row[4].trailing).toBe('，')
        expect(row[5].char).toBe('')
    })

    it('行首闭标点挤入上一行末格（避头）', () => {
        const cells = toCells('一二三四五六七八九十一，二', 'grid')
        const rows = wrapCells(cells, SHEET_COLUMNS)
        expect(rows).toHaveLength(2)
        expect(rows[0][SHEET_COLUMNS - 1].trailing).toBe('，')
        expect(rows[1][0].char).toBe('二')
    })

    it('行末开标点移到下一行（避尾）', () => {
        const cells = toCells('一二三四五六七八九十一《书》', 'grid')
        const rows = wrapCells(cells, SHEET_COLUMNS)
        expect(rows[0][SHEET_COLUMNS - 1].char).not.toBe('《')
        expect(rows[1][0].char).toBe('《')
    })

    it('内容超过 14 行时截断并标记溢出', () => {
        const lines = Array.from({ length: 20 }, () => '一二三')
        const sheet = buildHandwritingSheet(
            { ...emptySource, lines },
            { punctuation: 'grid', indent: 0 },
        )
        expect(sheet.rows).toHaveLength(SHEET_ROWS)
        expect(sheet.isOverflow).toBe(true)
    })

    it('正文不足时补空行，空行格子全部为空', () => {
        const sheet = buildHandwritingSheet(
            { ...emptySource, lines: ['一二三'] },
            { punctuation: 'grid', indent: 0 },
        )
        const lastRow = sheet.rows[SHEET_ROWS - 1]
        expect(lastRow.every((cell) => cell.char === '')).toBe(true)
    })

    it('古诗词正文逐句居中，左侧留白多于右侧', () => {
        const sheet = buildHandwritingSheet(
            { ...emptySource, lines: ['好雨知时节，'] },
            { punctuation: 'grid', indent: 0, bodyAlign: 'center' },
        )
        const chars = sheet.rows[0].map((cell) => cell.char)
        // 6 个字符留白 5 格：前导取上整 = 3，右侧 2，落在第 4–9 格
        expect(chars.slice(0, 3).every((char) => char === '')).toBe(true)
        expect(chars.slice(3, 9).join('')).toBe('好雨知时节，')
        expect(chars.slice(9).every((char) => char === '')).toBe(true)
    })

    it('未指定对齐方式时正文自首格起排', () => {
        const sheet = buildHandwritingSheet(
            { ...emptySource, lines: ['好雨知时节，'] },
            { punctuation: 'grid', indent: 0 },
        )
        expect(sheet.rows[0][0].char).toBe('好')
    })

    it('节选正文首行空出两格', () => {
        const sheet = buildHandwritingSheet(
            { ...emptySource, lines: ['荷叶挨挨挤挤的，'] },
            { punctuation: 'grid', indent: 2 },
        )
        const chars = sheet.rows[0].map((cell) => cell.char)
        expect(chars.slice(0, 2)).toEqual(['', ''])
        expect(chars[2]).toBe('荷')
    })

    it('题名压到正文之后右对齐，顶部不再重复标题', () => {
        const sheet = buildHandwritingSheet(
            {
                title: '《荷花》',
                subtitle: '叶圣陶',
                lines: ['荷叶挨挨挤挤的，像一个个碧绿的大圆盘。'],
            },
            { punctuation: 'grid', indent: 2, titlePlacement: 'footer' },
        )
        // 正文 19 个字符 + 缩进 2 格 = 21 格，折成 2 行，署名紧随其后落在第 3 行
        const footerRow = sheet.rows[2]
        expect(footerRow.slice(0, 4).every((cell) => cell.char === '')).toBe(
            true,
        )
        expect(footerRow.slice(4).map((cell) => cell.char).join('')).toBe(
            '《荷花》叶圣陶',
        )
        expect(footerRow[SHEET_COLUMNS - 1].char).toBe('陶')
    })

    it('署名超过一行时书名与作者各占一行，不把名字拆开', () => {
        const sheet = buildHandwritingSheet(
            { title: '《卖火柴的小女孩》', subtitle: '安徒生', lines: ['一'] },
            { punctuation: 'grid', indent: 2, titlePlacement: 'footer' },
        )
        const titleRow = sheet.rows[1]
        const authorRow = sheet.rows[2]
        // 书名 9 字符：前置 2 格；作者 3 字符：前置 8 格
        expect(titleRow[2].char).toBe('《')
        expect(titleRow[SHEET_COLUMNS - 1].char).toBe('》')
        expect(authorRow[8].char).toBe('安')
        expect(authorRow[SHEET_COLUMNS - 1].char).toBe('生')
    })
})

describe('颜色与字号比例校验', () => {
    it('接受标准六位色值并统一为小写', () => {
        expect(sanitizeHexColor('#7DCB9C', '#000000')).toBe('#7dcb9c')
    })

    it('拒绝缩写、颜色名与注入片段，回落默认色', () => {
        expect(sanitizeHexColor('#fff', '#44524a')).toBe('#44524a')
        expect(sanitizeHexColor('red', '#44524a')).toBe('#44524a')
        expect(sanitizeHexColor('#fff;fill:url(#x)', '#44524a')).toBe('#44524a')
    })

    it('字号比例越界或非法时夹到可调范围', () => {
        expect(clampGlyphScale(0.2)).toBe(minGlyphScale)
        expect(clampGlyphScale(1.5)).toBe(maxGlyphScale)
        expect(clampGlyphScale(Number.NaN)).toBe(GLYPH_SCALE)
        expect(clampGlyphScale(0.9)).toBe(0.9)
    })
})

describe('字体名过滤', () => {
    it('保留常见中英文字体名', () => {
        expect(sanitizeFontFamily('Microsoft YaHei')).toBe('Microsoft YaHei')
        expect(sanitizeFontFamily('楷体')).toBe('楷体')
        expect(sanitizeFontFamily('FZKai-Z03')).toBe('FZKai-Z03')
    })

    it('由字体文件名推导的族名能通过字体名过滤', () => {
        expect(normalizeFontFamilyFromFile('FZZJ-DHTYBKSJW')).toBe(
            'FZZJ-DHTYBKSJW',
        )
        expect(normalizeFontFamilyFromFile('方正字迹·董海涛硬笔楷书 简')).toBe(
            '方正字迹-董海涛硬笔楷书-简',
        )
        expect(normalizeFontFamilyFromFile('！！')).toBe('')
    })

    it('拒绝含引号、分号等可注入字符的字体名', () => {
        expect(sanitizeFontFamily('"><script>')).toBe('')
        expect(sanitizeFontFamily('a;color:red')).toBe('')
        expect(sanitizeFontFamily('')).toBe('')
    })
})
