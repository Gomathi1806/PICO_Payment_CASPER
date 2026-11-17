import { NextRequest, NextResponse } from 'next/server';
import { runCreatorSettlement } from '@/lib/settlement-core';

// Daily creator settlement. Vercel Cron calls this with the
// Authorization: Bearer <CRON_SECRET> header (configured in vercel.json
// + project env). We reject anything without the matching secret so the
// payout job can't be triggered by the public.
//
// This imports runCreatorSettlement from @/lib rather than the server
// action in @/app/actions/settlement: the action is admin-gated and has
// no session here, and a payout routine exported from a 'use server'
// file would be POST-able directly, which would make this header check
// pointless.
//
// Missing CRON_SECRET fails closed. Previously the check was skipped
// when the variable was unset, which left the payout job open in any
// environment that had not configured it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runCreatorSettlement();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
