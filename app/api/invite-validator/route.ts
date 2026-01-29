import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase anon env');
  return createClient(url, key);
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, access_token, refresh_token } = body as {
      email?: string;
      access_token?: string;
      refresh_token?: string;
    };

    const trimmed = typeof email === 'string' ? email.trim() : '';
    if (!trimmed || !trimmed.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    if (!access_token || !refresh_token) {
      return NextResponse.json({ error: 'Session required (access_token, refresh_token)' }, { status: 401 });
    }

    const anon = getAnonClient();
    const { data: { session }, error: sessionError } = await anon.auth.setSession({
      access_token,
      refresh_token,
    });
    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { data: profile } = await anon
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    if ((profile?.role as string) !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const service = getServiceClient();
    const { error: insertError } = await service
      .from('pending_invites')
      .upsert(
        { email: trimmed.toLowerCase(), invited_by: session.user.id },
        { onConflict: 'email' }
      );
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    const referer = request.headers.get('referer');
    let redirectTo: string | undefined;
    try {
      if (referer) redirectTo = new URL(referer).origin;
    } catch {
      // ignore invalid referer
    }
    const { error: inviteError } = await service.auth.admin.inviteUserByEmail(trimmed, {
      redirectTo,
    });
    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: 'Invite sent' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invite failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
