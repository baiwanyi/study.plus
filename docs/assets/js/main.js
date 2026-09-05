// 学迹Plus 官网交互：移动端菜单、滚动入场动效、锚点平滑滚动
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    // ---- 移动端汉堡菜单 ----
    var burger = document.getElementById('nav-burger');
    var links = document.getElementById('nav-links');

    if (burger && links) {
      var closeMenu = function () {
        links.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-label', '打开菜单');
      };

      burger.addEventListener('click', function () {
        var isOpen = links.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', String(isOpen));
        burger.setAttribute('aria-label', isOpen ? '关闭菜单' : '打开菜单');
      });

      // 点击菜单项后自动收起
      links.addEventListener('click', function (e) {
        if (e.target.closest('a')) closeMenu();
      });

      // 点击菜单外部区域收起
      document.addEventListener('click', function (e) {
        if (!burger.contains(e.target) && !links.contains(e.target)) closeMenu();
      });

      // Esc 收起
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
      });

      // 断点切回桌面时重置状态
      window.matchMedia('(min-width: 769px)').addEventListener('change', function (ev) {
        if (ev.matches) closeMenu();
      });
    }

    // ---- 锚点平滑滚动（CSS scroll-behavior 的兜底，含焦点管理）----
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var href = this.getAttribute('href');
        if (href === '#') return;
        var target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
          target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
      });
    });

    // ---- 滚动入场动效 ----
    var revealEls = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

    revealEls.forEach(function (el) { observer.observe(el); });
  });
})();
