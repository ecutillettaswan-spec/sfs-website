import type { Metadata } from 'next';
import marketingHtml from '../index.html?raw';
import marketingCss from '../styles.css?raw';
import MarketingInteractions from './marketing-interactions';

export const metadata: Metadata = {
  title: 'Students Feeding Students — Ending Student Hunger at OPRF',
  description: 'Students Feeding Students is a student-created, student-run program keeping free snack cabinets stocked at Oak Park River Forest High School—no forms, no questions, no stigma.',
  alternates: { canonical: 'https://studentsfeedingstudents.org/' },
  openGraph: {
    type: 'website',
    url: 'https://studentsfeedingstudents.org/',
    title: 'Students Feeding Students — Ending Student Hunger at OPRF',
    description: 'Student-run snack cabinets keeping every OPRF student fed—no forms, no questions, no stigma. Solidarity. Not charity.',
    images: ['/team-solidarity.jpg'],
  },
};

const body = (marketingHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '')
  .replace(/<script src="script\.js\?v=\d+"><\/script>/, '')
  .replaceAll('assets/', '/')
  .replace('</nav>', '<a href="/missioncontrol">Mission Control</a></nav>');

const styles = marketingCss
  .replace('--font-display: "Archivo Black", system-ui, sans-serif;', '--font-display: var(--font-display-face), system-ui, sans-serif;')
  .replace('--font-body: "Public Sans", system-ui, -apple-system, sans-serif;', '--font-body: var(--font-body-face), system-ui, -apple-system, sans-serif;')
  .replace('--font-script: "Caveat", cursive;', '--font-script: var(--font-script-face), cursive;');

const structuredData = [...marketingHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

export default function MarketingPage() {
  return <>
    <style dangerouslySetInnerHTML={{ __html: styles }} />
    {structuredData.map((value, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: value }} />)}
    <div className="marketing-page" dangerouslySetInnerHTML={{ __html: body }} />
    <MarketingInteractions />
  </>;
}
