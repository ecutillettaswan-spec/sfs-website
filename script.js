const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});

navLinks.addEventListener('click', (event) => {
  if (event.target.closest('a')) {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Open menu');
  }
});

const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = contactForm.querySelector('button[type="submit"]');
    const error = document.getElementById('contactError');
    button.disabled = true;
    button.textContent = 'Sending…';
    error.hidden = true;
    try {
      const response = await fetch(contactForm.action, { method: 'POST', body: new FormData(contactForm) });
      if (!response.ok) throw new Error(await response.text());
      window.location.assign(response.url);
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : 'Your message could not be sent. Please try again.';
      error.hidden = false;
      button.disabled = false;
      button.textContent = 'Send inquiry';
    }
  });
}
