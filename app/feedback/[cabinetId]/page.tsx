import { getCabinetForFeedback } from '@/lib/database';
import FeedbackForm from './feedback-form';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ cabinetId: string }> }): Promise<Metadata> {
  const { cabinetId } = await params;
  const cabinet = await getCabinetForFeedback(cabinetId);
  return {
    title: cabinet ? `Feedback for ${cabinet.name}` : 'Cabinet feedback',
    description: cabinet ? `Tell the SFS team about ${cabinet.name} at OPRF High School.` : 'Send cabinet feedback to Students Feeding Students.',
    robots: { index: false, follow: false },
  };
}

export default async function FeedbackPage({ params }: { params: Promise<{ cabinetId: string }> }) {
  const { cabinetId } = await params;
  const cabinet = await getCabinetForFeedback(cabinetId);
  if (!cabinet) {
    return <main className="feedback-page"><section className="feedback-card"><p className="eyebrow">SFS feedback</p><h1>Cabinet not found</h1><p>This QR code may be outdated. You can still tell an SFS volunteer in person.</p></section></main>;
  }
  if (cabinet.feedback_mode === 'off') {
    return <main className="feedback-page"><section className="feedback-card"><p className="eyebrow">SFS feedback</p><h1>Feedback is paused.</h1><p>The SFS team has temporarily switched off the QR feedback inbox. You can still tell a volunteer in person.</p></section></main>;
  }
  return <FeedbackForm cabinet={cabinet as { id: string; name: string; floor: number; location: string }} />;
}
