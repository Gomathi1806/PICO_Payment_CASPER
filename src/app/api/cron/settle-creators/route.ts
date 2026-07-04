import { NextRequest, NextResponse } from 'next/server';
import { settleCreatorPromos } from '@/app/actions/settlement';

// Daily creator settlement. Vercel Cron calls this with the
// Authorization: Bearer <CRON_SECRET> header (configured in vercel.json
// + project env). We reject anything without the matching secret so the
// payout job can't be triggered by the public.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await settleCreatorPromos();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
