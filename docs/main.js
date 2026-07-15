// Tailwind CSS 配置
tailwind.config = {
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
            },
            colors: {
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                },
                accent: {
                    400: '#e879f9',
                    500: '#d946ef',
                    600: '#c026d3',
                },
                warm: {
                    400: '#fbbf24',
                    500: '#f59e0b',
                    600: '#d97706',
                },
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'fade-in-up': 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'fade-in': 'fadeIn 0.6s ease forwards',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-12px)' },
                },
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(24px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
        },
    },
}

// 页面交互逻辑
document.addEventListener('DOMContentLoaded', function () {
    // 初始化 Lucide 图标
    if (typeof lucide !== 'undefined') {
        lucide.createIcons()
    }

    // 为所有锚点链接添加平滑滚动
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            var href = this.getAttribute('href')
            if (href === '#') return
            var target = document.querySelector(href)
            if (target) {
                e.preventDefault()
                target.scrollIntoView({ behavior: 'smooth' })
            }
        })
    })

    // 滚动动画 (Intersection Observer)
    var observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
    }
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-fade-in-up')
                observer.unobserve(entry.target)
            }
        })
    }, observerOptions)

    document.querySelectorAll('.card-hover, .tech-item').forEach(function (el) {
        observer.observe(el)
    })
})
