import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { getMissionUser } from '@/lib/auth';
import { getPublicImpact } from '@/lib/database';
import { ArrowLeft, ClipboardCheck, HeartHandshake, PackageCheck, School } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const impact = await getPublicImpact();
  let canPreview = false;
  if (impact.mode === 'review' && preview === '1') {
    if (process.env.NODE_ENV === 'production') await requireChatGPTUser('/impact?preview=1');
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
        <p>These figures describe the program without tracking which students take food. Estimated figures are labeled and reviewed before publication.</p>
      </section>
      <section className="impact-grid" aria-label="Program impact">
        <article><PackageCheck aria-hidden="true" /><strong>{impact.snacks.toLocaleString()}+</strong><span>snacks shared in the verified launch period</span></article>
        <article><School aria-hidden="true" /><strong>{impact.students.toLocaleString()}+</strong><span>students reached in week one</span></article>
        <article><HeartHandshake aria-hidden="true" /><strong>{impact.cabinets}</strong><span>free-access cabinets operating at OPRF</span></article>
        <article><ClipboardCheck aria-hidden="true" /><strong>{impact.checks.toLocaleString()}</strong><span>cabinet care checks recorded</span></article>
      </section>
      <section className="method-panel">
        <div><p className="eyebrow">How we count</p><h2>No cameras. No student tracking.</h2></div>
        <p>Volunteers record cabinet condition and inventory. Public totals never include checker names, raw notes, schedules, live cabinet status, or individual student behavior. Donation equivalents use the current documented average cost and are not described as distributed until distribution evidence exists.</p>
      </section>
      <footer className="impact-footer"><span>Solidarity. Not charity.</span><a href="https://www.zeffy.com/en-US/donation-form/sustain-the-safety-net-students-feeding-students-sfs">Support the cabinets</a></footer>
    </main>
  );
}
