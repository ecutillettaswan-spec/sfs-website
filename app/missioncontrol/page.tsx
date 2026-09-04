import { getMissionUser } from '@/lib/auth';
import { getMissionControlData } from '@/lib/database';
import MissionControl from '../mission-control/mission-control';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MissionControlPage() {
  const nativeCloudflare = process.env.AUTH_PROVIDER?.trim().toLowerCase() === 'cloudflare-access';
  const accessReady = !nativeCloudflare
    || (Boolean(process.env.CF_ACCESS_TEAM_DOMAIN?.trim()) && Boolean(process.env.CF_ACCESS_AUD?.trim()));
  if (process.env.NODE_ENV === 'production' && (!process.env.OWNER_EMAIL?.trim() || !accessReady)) {
    return (
      <main className="access-denied">
        <div className="access-card">
          <p className="eyebrow">Secure setup required</p>
          <h1>Mission Control is locked.</h1>
          <p>The owner identity and Cloudflare Access settings must be configured before the first sign-in.</p>
          <Link className="primary-button" href="/">Return to Students Feeding Students</Link>
        </div>
      </main>
    );
  }
  const user = await getMissionUser();
  if (!user) {
    return (
      <main className="access-denied">
        <div className="access-card">
          <p className="eyebrow">Private operations</p>
          <h1>This email has not been approved yet.</h1>
          <p>Use the approved email for SFS Mission Control, or ask the owner to add your email and choose a role. No cabinet or volunteer data has been shown.</p>
          <Link className="primary-button" href="/">Return to Students Feeding Students</Link>
        </div>
      </main>
    );
  }
  const data = await getMissionControlData(user);
  return <MissionControl initialData={data} />;
}
