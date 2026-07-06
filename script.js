// Students Feeding Students — interactions

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Always start at the top on reload: drop any #anchor from the URL and
// take over scroll restoration so the hero sequence plays from the top.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
window.scrollTo(0, 0);

// In-page nav: scroll smoothly without writing #anchors into the URL.
// Hand-rolled easing instead of native smooth scroll, which can stall
// when scroll-driven animations are active.
function smoothScrollTo(targetY, duration = 750) {
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (reducedMotion || Math.abs(delta) < 2) {
    window.scrollTo(0, targetY);
    return;
  }
  const t0 = performance.now();
  function step(now) {
    const p = Math.min((now - t0) / duration, 1);
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    window.scrollTo(0, startY + delta * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const target = document.querySelector(link.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  const navHeight = document.querySelector('.nav').offsetHeight;
  const y = Math.max(0, target.getBoundingClientRect().top + window.scrollY - navHeight);
  smoothScrollTo(y);
});

// Sticky nav: add border once scrolled
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 10);
}, { passive: true });

// Scroll progress bar
const progress = document.getElementById('scrollProgress');
let progressTick = false;

function updateProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
  progressTick = false;
}

window.addEventListener('scroll', () => {
  if (!progressTick) {
    progressTick = true;
    requestAnimationFrame(updateProgress);
  }
}, { passive: true });
updateProgress();

// Mobile menu toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});

// Close mobile menu when a link is chosen
navLinks.addEventListener('click', (e) => {
  if (e.target.tagName === 'A' && navLinks.classList.contains('open')) {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

// Give staggered containers per-child delay indexes
document.querySelectorAll('.reveal-stagger').forEach((container) => {
  Array.from(container.children).forEach((child, i) => {
    child.style.setProperty('--i', i);
  });
});

// Count-up animation for big stat numbers (e.g. "12,000+", "80%")
function countUp(el) {
  const match = el.textContent.trim().match(/^([\d,]+)(.*)$/);
  if (!match) return;
  const target = parseInt(match[1].replace(/,/g, ''), 10);
  if (!isFinite(target) || target < 10) return;
  const suffix = match[2];
  const duration = 1300;
  const start = performance.now();

  function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString('en-US') + suffix;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Scroll-triggered reveals + stat count-ups
const revealEls = document.querySelectorAll('.reveal, .reveal-stagger');
const statEls = document.querySelectorAll('.stat strong');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach((el) => observer.observe(el));

  if (!reducedMotion) {
    const statObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          countUp(entry.target);
          statObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });

    statEls.forEach((el) => statObserver.observe(el));
  }
} else {
  revealEls.forEach((el) => el.classList.add('visible'));
}

// Hero stats count up on load, timed to their entrance
if (!reducedMotion) {
  document.querySelectorAll('.hero-stats strong').forEach((el, i) => {
    setTimeout(() => countUp(el), 1550 + i * 130);
  });
}
