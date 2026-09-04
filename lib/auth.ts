import { getChatGPTUser } from '@/app/chatgpt-auth';
import { authenticateMissionUser } from '@/lib/database';

export async function getMissionUser() {
  const identity = await getChatGPTUser();
  if (identity) return authenticateMissionUser(identity);
  if (process.env.NODE_ENV !== 'production') {
    return authenticateMissionUser({
      userId: 'local-owner',
      email: 'owner@studentsfeedingstudents.local',
      displayName: 'SFS Owner',
    });
  }
  return null;
}
