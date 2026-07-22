import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * TypeScript 命名规范规则（需类型信息，仅用于 tsconfig.includes 内的文件）
 * 包含 types: ['boolean'] 的 selector 需要 type-aware linting。
 */
const namingRulesTyped = {
    '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'variable', modifiers: ['const', 'global'], format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'interface', format: ['PascalCase'], custom: { regex: '^I[A-Z]', match: false } },
        { selector: 'variable', types: ['boolean'], format: ['PascalCase'], prefix: ['is', 'should', 'has', 'can', 'did', 'will'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'memberLike', format: ['camelCase'] },
        { selector: 'property', format: ['camelCase', 'snake_case'], leadingUnderscore: 'allow' },
        { selector: 'objectLiteralProperty', format: null },
    ],
}

/** 无类型信息的命名规范（不含 types 过滤器），用于未纳入 tsconfig 的文件 */
const namingRulesUntyped = {
    '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'variable', modifiers: ['const', 'global'], format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'interface', format: ['PascalCase'], custom: { regex: '^I[A-Z]', match: false } },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'memberLike', format: ['camelCase'] },
        { selector: 'property', format: ['camelCase', 'snake_case'], leadingUnderscore: 'allow' },
        { selector: 'objectLiteralProperty', format: null },
    ],
}

/** 共用的 import 顺序规则 */
const importRules = {
    'import-x/order': [
        'error',
        {
            groups: ['builtin', 'external', 'internal', 'sibling', 'index', 'type'],
            alphabetize: { order: 'asc', caseInsensitive: true },
            'newlines-between': 'never',
        },
    ],
}

export default defineConfig([
    globalIgnores(['**/node_modules/**', '**/dist/**', '**/.codebuddy/**']),

    // ==================== 云函数（Node.js 后端） ====================
    {
        files: ['cloudfunctions/**/*.ts'],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.node,
            parserOptions: {
                project: true,
            },
        },
        plugins: {
            'import-x': importX,
        },
        rules: {
            ...namingRulesTyped,
            ...importRules,
        },
    },

    // ==================== 微信小程序（miniprogram） ====================
    {
        files: ['miniprogram/**/*.ts'],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: {
                wx: 'readonly',
                App: 'readonly',
                Page: 'readonly',
                Component: 'readonly',
                getApp: 'readonly',
                getCurrentPages: 'readonly',
                Behavior: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                require: 'readonly',
            },
        },
        plugins: {
            'import-x': importX,
        },
        rules: {
            ...namingRulesUntyped,
            ...importRules,
        },
    },
])
