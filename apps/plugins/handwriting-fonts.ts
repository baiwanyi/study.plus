/**
 * 内置字体清单插件：dev 与 build 时扫描 apps/public/fonts，生成 virtual:handwriting-fonts 模块。
 * 复用约定：显示名读字体自身 name 表的简体中文族名（读不到再退英文名、文件名），族名由
 * @shared/handwriting 的 normalizeFontFamilyFromFile 规范化，与渲染层字符白名单同源；
 * 字体文件本体仍由 public 目录原样分发到 dist/fonts，清单里只记路径与名称，不把字体打进 bundle。
 * 关键约束：字体目录变化必须让虚拟模块失效并整页刷新，否则前端仍用旧清单；
 * 只收录 ttf/otf/woff/woff2，子目录与非字体文件忽略；woff/woff2 的 name 表被压缩，显示名回落文件名。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { BuiltinFont } from '../../shared/src/handwriting'
import { normalizeFontFamilyFromFile } from '../../shared/src/handwriting'
import type { Plugin } from 'vite'

const virtualModuleId = 'virtual:handwriting-fonts'
const resolvedVirtualId = `\0${virtualModuleId}`
const fontPattern = /\.(ttf|otf|woff2?)$/i
/** 简体与繁体中文的 Windows 语言 ID，命中即优先采用 */
const chineseLanguageIds = [0x0804, 0x0404]

/**
 * 读 sfnt 字体 name 表里的族名：优先中文，其次英文；woff/woff2 与损坏文件一律回落空串。
 * 只取 Windows 平台（UTF-16BE）的 nameID 1（族名）与 4（完整名），避免读到 Mac Roman 乱码。
 */
function readFontFamilyName(filePath: string): string {
    try {
        const buffer = readFileSync(filePath)
        if (buffer.length < 12 || buffer.toString('ascii', 0, 4) === 'wOFF') {
            return ''
        }
        const numTables = buffer.readUInt16BE(4)
        let nameOffset = -1
        for (let i = 0; i < numTables; i += 1) {
            const record = 12 + i * 16
            if (buffer.toString('ascii', record, record + 4) === 'name') {
                nameOffset = buffer.readUInt32BE(record + 8)
                break
            }
        }
        if (nameOffset < 0) return ''

        const count = buffer.readUInt16BE(nameOffset + 2)
        const stringOffset = nameOffset + buffer.readUInt16BE(nameOffset + 4)
        let fallback = ''
        for (let i = 0; i < count; i += 1) {
            const record = nameOffset + 6 + i * 12
            const platformID = buffer.readUInt16BE(record)
            const languageID = buffer.readUInt16BE(record + 4)
            const nameID = buffer.readUInt16BE(record + 6)
            const length = buffer.readUInt16BE(record + 8)
            const offset = buffer.readUInt16BE(record + 10)
            if (platformID !== 3 || (nameID !== 1 && nameID !== 4)) continue

            const start = stringOffset + offset
            let text = ''
            for (let j = start; j + 1 < start + length; j += 2) {
                text += String.fromCharCode(buffer.readUInt16BE(j))
            }
            const trimmed = text.trim()
            if (!trimmed) continue
            if (chineseLanguageIds.includes(languageID)) return trimmed
            if (!fallback) fallback = trimmed
        }
        return fallback
    } catch {
        return ''
    }
}

/** 扫描字体目录生成清单；目录不存在时返回空数组，页面只用系统字体 */
function collectFonts(dir: string): BuiltinFont[] {
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && fontPattern.test(entry.name))
        .map((entry) => {
            const filePath = path.join(dir, entry.name)
            const baseName = entry.name.replace(/\.[^.]+$/u, '')
            return {
                family: normalizeFontFamilyFromFile(baseName),
                label: readFontFamilyName(filePath) || baseName,
                file: `fonts/${entry.name}`,
            }
        })
        .filter((font) => font.family.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
}

export function handwritingFontsPlugin(fontDir: string): Plugin {
    return {
        name: 'handwriting-fonts',
        resolveId(id) {
            return id === virtualModuleId ? resolvedVirtualId : null
        },
        load(id) {
            if (id !== resolvedVirtualId) return null
            const fonts = collectFonts(fontDir)
            return `export const builtinFonts = ${JSON.stringify(fonts, null, 4)}\n`
        },
        configureServer(server) {
            const invalidate = (file: string) => {
                if (!file.startsWith(fontDir)) return
                const mod = server.moduleGraph.getModuleById(resolvedVirtualId)
                if (mod) void server.moduleGraph.invalidateModule(mod)
                server.ws.send({ type: 'full-reload' })
            }
            server.watcher.add(fontDir)
            server.watcher.on('add', invalidate)
            server.watcher.on('unlink', invalidate)
        },
    }
}
