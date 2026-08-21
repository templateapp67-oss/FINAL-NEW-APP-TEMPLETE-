import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Request } from 'express';

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

function serverSupabaseConfig(): { url: string; serviceRoleKey: string } {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) {
    throw new Error('The server Supabase connection is not configured.');
  }
  return { url, serviceRoleKey };
}

/** Trusted server client. This module is imported only by server API code. */
export function getSupabaseAdmin(): SupabaseClient {
  const config = serverSupabaseConfig();
  const cacheKey = `${config.url}::${config.serviceRoleKey}`;
  if (cachedClient && cachedKey === cacheKey) return cachedClient;
  cachedClient = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-nexora-server': 'phase1a-payment/1' } },
  });
  cachedKey = cacheKey;
  return cachedClient;
}

function bearerToken(req: Request): string | null {
  const authorization = req.header('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Validate a bearer token with Supabase Auth; never decode-and-trust locally. */
export async function requireAuthenticatedUser(req: Request): Promise<User> {
  const token = bearerToken(req);
  if (!token) throw new Error('Authentication is required.');
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new Error('The authentication session is invalid or expired.');
  return data.user;
}
