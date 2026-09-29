import { getMissionUser } from '@/lib/auth';
import { getMissionControlData } from '@/lib/database';
import MissionControl from '../mission-control/mission-control';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'Private Students Feeding Students program operations.',
  robots: { index: false, follow: false },
};

export default async function MissionControlPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getMissionUser();
  if (!user) {
    const params = await searchParams;
    const returnParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (key === 'login' || typeof value !== 'string') continue;
      returnParams.set(key, value);
    }
    const returnTo = `/missioncontrol${returnParams.size ? `?${returnParams}` : ''}`;
    const failed = params?.login === 'failed';
    return (
      <main className="access-denied mission-login">
        <div className="access-card shared-login-card">
          <div className="login-mark" aria-hidden="true">SFS</div>
          <p className="eyebrow">Private operations</p>
          <h1>Open Mission Control</h1>
          <p>Enter the shared SFS password. Anyone with the password receives full Mission Control access.</p>
          <form className="shared-login-form" action="/api/mission-control/session" method="post">
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" autoFocus required /></label>
            <label className="shared-remember"><input name="remember" type="checkbox" defaultChecked /><span>Remember this device for 30 days</span></label>
            {failed && <p className="login-error" role="alert">That password didn’t work. Try again.</p>}
            <button className="primary-button wide" type="submit">Open Mission Control</button>
          </form>
          <Link className="login-home-link" href="/">Return to Students Feeding Students</Link>
        </div>
      </main>
    );
  }
  const data = await getMissionControlData(user);
  return <MissionControl initialData={data} />;
}
