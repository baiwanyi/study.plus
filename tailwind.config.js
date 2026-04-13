/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./apps/**/*.{ts,tsx}",
        "./pages/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // 自定义颜色名称和色值
                'primary': {
                    DEFAULT: '#2271b1',
                    'foreground': '#135e96',
                    'background': '#E8F1F7'
                },
                'sidebar': {
                    DEFAULT: '#1d2327',
                    'link': '#9aa0a5',
                    'hover': '#2c3338'
                },
                'gray': {
                    100: '#f8f9fa',
                    200: '#e9ecef',
                    300: '#dee2e6',
                    400: '#ced4da',
                    500: '#adb5bd',
                    600: '#6c757d',
                    700: '#495057',
                    800: '#343a40',
                    900: '#212529',
                },
                'muted': {
                    DEFAULT: '#9aa0a5',
                },
                'headline': {
                    DEFAULT: '#1d2327',
                },
                'background': {
                    DEFAULT: '#f0f0f1',
                },
                'foreground': {
                    DEFAULT: '#3c434a',
                    'light': '#c3c4c7',
                    'dark': '#1d2327',
                },
                'danger': {
                    DEFAULT: '#dc3545',
                    'background': '#FBEAEC',
                    'hover': '#E83838'
                },
                'success': {
                    DEFAULT: '#2ba246',
                    'background': '#E3F1E8',
                    'hover': '#225953'
                },
                'info': {
                    DEFAULT: '#007cba',
                    'background': '#E2ECF3',
                    'hover': '#0D9BA9'
                },
                'warning': {
                    DEFAULT: '#ea8011',
                    'background': '#FFFBEB',
                    'hover': '#EF4521'
                }
            },
        },
    },
    plugins: [],
}
