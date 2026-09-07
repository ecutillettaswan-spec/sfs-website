import { headers } from 'next/headers';
import type { MissionUser } from '@/lib/database';
import { readCookie, SHARED_SESSION_COOKIE, verifySharedSessionToken } from '@/lib/shared-password-auth';

export async function getMissionUser() {
  if (process.env.NODE_ENV !== 'production') {
    return { id: 'shared-owner', email: '', name: 'Shared access', role: 'owner', status: 'active' } satisfies MissionUser;
  }
  const requestHeaders = await headers();
  const token = readCookie(requestHeaders.get('cookie'), SHARED_SESSION_COOKIE);
  if (!await verifySharedSessionToken(token)) return null;
  return { id: 'shared-owner', email: '', name: 'Shared access', role: 'owner', status: 'active' } satisfies MissionUser;
}
