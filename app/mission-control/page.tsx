import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { getMissionUser } from '@/lib/auth';
import { getMissionControlData } from '@/lib/database';
import MissionControl from './mission-control';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MissionControlPage() {
  if (process.env.NODE_ENV === 'production' && !process.env.OWNER_EMAIL?.trim()) {
    return <main className="access-denied"><div className="access-card"><p className="eyebrow">Secure setup required</p><h1>Mission Control is locked.</h1><p>The deployment owner email must be configured before the first sign-in. This prevents an unapproved visitor from claiming the owner role.</p><Link className="primary-button" href="/">Return to Students Feeding Students</Link></div></main>;
  }
  if (process.env.NODE_ENV === 'production') await requireChatGPTUser('/mission-control');
  const user = await getMissionUser();
  if (!user) {
    return (
      <main className="access-denied">
        <div className="access-card">
          <p className="eyebrow">Private operations</p>
          <h1>This email has not been approved yet.</h1>
          <p>Ask the SFS owner to add your email and choose a role. No cabinet or volunteer data has been shown.</p>
          <Link className="primary-button" href="/">Return to Students Feeding Students</Link>
        </div>
      </main>
    );
  }
  const data = await getMissionControlData(user);
  return <MissionControl initialData={data} />;
}
