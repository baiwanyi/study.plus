import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['pages']),
    {
        files: ['**/*.{ts,tsx}'],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        rules: {
            // 在此添加命名规范规则
            '@typescript-eslint/naming-convention': [
                'error',
                // 1. 默认规则：变量和函数使用 camelCase
                {
                    selector: 'default',
                    format: ['camelCase'],
                },
                // 2. 变量（包括 const）允许 camelCase 和 UPPER_CASE
                {
                    selector: 'variable',
                    format: ['camelCase', 'UPPER_CASE'],
                },
                // 3. 全局常量强制使用 UPPER_CASE
                {
                    selector: 'variable',
                    modifiers: ['const', 'global'],
                    format: ['UPPER_CASE'],
                },
                // 4. 类型（类、接口、类型别名、枚举）必须使用 PascalCase
                {
                    selector: 'typeLike',
                    format: ['PascalCase'],
                },
                // 5. 接口禁止使用 "I" 前缀
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                    custom: {
                        regex: '^I[A-Z]',
                        match: false,
                    },
                },
                // 6. 布尔变量必须包含 is/has/can 等前缀
                {
                    selector: 'variable',
                    types: ['boolean'],
                    format: ['PascalCase'],
                    prefix: ['is', 'should', 'has', 'can', 'did', 'will'],
                },
                // 7. 枚举成员使用 UPPER_CASE
                {
                    selector: 'enumMember',
                    format: ['UPPER_CASE'],
                },
                // 8. 函数（包括箭头函数）使用 camelCase
                {
                    selector: 'function',
                    format: ['camelCase'],
                },
                // 9. 类属性/方法使用 camelCase（私有属性也用 camelCase，依靠 TypeScript 的 private 修饰符）
                {
                    selector: 'memberLike',
                    format: ['camelCase'],
                },
                // 10. 对象字面量属性允许任意格式（因为可能引用外部 API）
                {
                    selector: 'objectLiteralProperty',
                    format: null, // 不限制
                },
            ],
        },
    },
]);
