import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page not found',
  description: "That page isn't here. Find the SFS homepage, cabinet information, or the contact form.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <main className="access-denied"><section className="access-card">
    <p className="eyebrow">404 · Page not found</p>
    <h1>We couldn&apos;t find that page.</h1>
    <p>The link may have changed. You can still find the cabinets, support the program, or contact the team.</p>
    <Link className="primary-button" href="/">Back to the homepage</Link>
  </section></main>;
}
