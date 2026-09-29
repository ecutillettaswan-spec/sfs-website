import { getMissionUser } from '@/lib/auth';
import { getPublicImpact } from '@/lib/database';
import { ArrowLeft, ClipboardCheck, HeartHandshake, PackageCheck, School } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Program impact',
  description: 'Reviewed figures from the Students Feeding Students snack cabinet program at OPRF High School.',
  openGraph: {
    title: 'Students Feeding Students · Program impact',
    description: 'How the OPRF student team is keeping free snack cabinets stocked.',
    images: [{ url: 'https://studentsfeedingstudents.org/assets/team-solidarity.jpg', width: 1800, height: 1011, alt: 'The SFS student team outside OPRF High School' }],
  },
};

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const impact = await getPublicImpact();
  let canPreview = false;
  if (impact.mode === 'review' && preview === '1') {
    canPreview = Boolean(await getMissionUser());
  }
  if (!impact.published && !canPreview) {
    return <main className="impact-hold"><section><p className="eyebrow">Public impact dashboard</p><h1>We’re preparing the numbers.</h1><p>SFS is reviewing its reporting methods before publishing this dashboard. The cabinets are still open and serving students.</p><Link href="/" className="primary-button">Return home</Link></section></main>;
  }
  return (
    <main className="impact-page">
      {canPreview && <div className="review-ribbon">Private preview · not published</div>}
      <header className="impact-nav"><Link href="/"><ArrowLeft aria-hidden="true" /> Students Feeding Students</Link><span>Impact dashboard</span></header>
      <section className="impact-hero">
        <p className="eyebrow">Since launch · May 13, 2026</p>
        <h1>Food shared freely.<br /><em>Impact counted carefully.</em></h1>
        <p>Estimated figures are labeled and reviewed before publication.</p>
      </section>
      <section className="impact-grid" aria-label="Program impact">
        <article><PackageCheck aria-hidden="true" /><strong>{impact.snacks.toLocaleString()}+</strong><span>snacks shared in the verified launch period</span></article>
        <article><School aria-hidden="true" /><strong>{impact.students.toLocaleString()}+</strong><span>students reached in week one</span></article>
        <article><HeartHandshake aria-hidden="true" /><strong>{impact.cabinets}</strong><span>free-access cabinets operating at OPRF</span></article>
        <article><ClipboardCheck aria-hidden="true" /><strong>{impact.checks.toLocaleString()}</strong><span>cabinet care checks recorded</span></article>
      </section>
      <footer className="impact-footer"><span>Solidarity. Not charity.</span><a href="/privacy.html">Privacy policy</a><a href="https://www.zeffy.com/en-US/donation-form/sustain-the-safety-net-students-feeding-students-sfs">Support the cabinets</a></footer>
    </main>
  );
}
