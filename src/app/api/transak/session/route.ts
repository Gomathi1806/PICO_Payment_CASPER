import { NextRequest, NextResponse } from 'next/server';

const IS_PRODUCTION = process.env.NEXT_PUBLIC_TRANSAK_ENV === 'PRODUCTION';

const API_GATEWAY = IS_PRODUCTION
  ? 'https://api-gateway.transak.com'
  : 'https://api-gateway-stg.transak.com';

const TOKEN_ENDPOINT = IS_PRODUCTION
  ? 'https://api.transak.com/partners/api/v2/refresh-token'
  : 'https://api-stg.transak.com/partners/api/v2/refresh-token';

const API_KEY = process.env.NEXT_PUBLIC_TRANSAK_API_KEY ?? '';
const API_SECRET = process.env.TRANSAK_API_SECRET ?? '';

// Cache the access token in memory (valid 7 days per Transak docs).
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() / 1000 + 60) {
    return cachedToken.value;
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'api-secret': API_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey: API_KEY }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Transak token refresh failed (${res.status}): ${text}`);
  }

  const json = await res.json() as { data: { accessToken: string; expiresAt: number } };
  cachedToken = { value: json.data.accessToken, expiresAt: json.data.expiresAt };
  return cachedToken.value;
}

export async function POST(req: NextRequest) {
  if (!API_KEY || !API_SECRET) {
    return NextResponse.json(
      { error: 'Transak API key or secret not configured on server.' },
      { status: 500 },
    );
  }

  const body = await req.json() as {
    mode: 'BUY' | 'SELL';
    walletAddress?: string;
    fiatCurrency?: string;
    defaultAmount?: string;
    referrerDomain?: string;
    defaultPaymentMethod?: string;
  };

  const { mode, walletAddress, fiatCurrency = 'GBP', defaultAmount, referrerDomain } = body;
  const network = IS_PRODUCTION ? 'base' : 'polygon';

  // Steer to the cheapest rail. Card on-ramp is ~10% on small amounts
  // (mostly fixed interchange); Open Banking / bank transfer is ~0–1%.
  // We use a *soft* default (defaultPaymentMethod) — the user can still
  // switch if Open Banking isn't available in their region.
  //   GBP  -> pm_open_banking (UK instant bank, near-zero fee)
  //   EUR  -> sepa_bank_transfer
  //   else -> leave to Transak's regional default
  const DEFAULT_RAIL_BY_FIAT: Record<string, string> = {
    GBP: 'pm_open_banking',
    EUR: 'sepa_bank_transfer',
  };
  const defaultPaymentMethod =
    body.defaultPaymentMethod ?? DEFAULT_RAIL_BY_FIAT[fiatCurrency.toUpperCase()];

  // Widget params — all sensitive params go here server-side, never in client URL
  const widgetParams: Record<string, string> = {
    apiKey: API_KEY,
    referrerDomain: referrerDomain ?? 'pico-payment.vercel.app',
    productsAvailed: mode,
    cryptoCurrencyCode: 'USDC',
    network,
    fiatCurrency,
    hideMenu: 'true',
    themeColor: '3b82f6',
  };

  // On-ramp only: nudge to the low-fee rail.
  if (mode === 'BUY' && defaultPaymentMethod) {
    widgetParams.defaultPaymentMethod = defaultPaymentMethod;
  }

  if (walletAddress) {
    widgetParams.walletAddress = walletAddress;
    widgetParams.disableWalletAddressEdit = 'true';
  }

  if (defaultAmount) {
    widgetParams[mode === 'SELL' ? 'cryptoAmount' : 'defaultFiatAmount'] = defaultAmount;
  }

  try {
    const accessToken = await getAccessToken();

    const userIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      '127.0.0.1';

    const sessionRes = await fetch(`${API_GATEWAY}/api/v2/auth/session`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'x-user-ip': userIp,
        'access-token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ widgetParams }),
    });

    if (!sessionRes.ok) {
      const text = await sessionRes.text();
      throw new Error(`Transak session creation failed (${sessionRes.status}): ${text}`);
    }

    const sessionJson = await sessionRes.json() as { data: { widgetUrl: string } };
    return NextResponse.json({ widgetUrl: sessionJson.data.widgetUrl });
  } catch (err) {
    console.error('[transak/session]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
