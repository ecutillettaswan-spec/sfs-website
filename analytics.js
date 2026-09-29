// This loads GA4 only when a real Measurement ID is provided at build time.
const measurementId = document.querySelector('meta[name="sfs-ga4-id"]')?.content ?? '';
if (/^G-[A-Z0-9]{6,}$/.test(measurementId)) {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', measurementId, { anonymize_ip: true });
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(tag);
}
