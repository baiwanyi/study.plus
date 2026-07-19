// 页面交互逻辑
document.addEventListener('DOMContentLoaded', function () {
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
