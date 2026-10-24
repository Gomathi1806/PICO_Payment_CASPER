'use client';

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';

/**
 * CSPR.click — wallet aggregation, social login and the fiat on-ramp.
 *
 * CSPR.click's own guidance for new projects is the CDN runtime plus a
 * context provider of your own, rather than the `csprclick-ui` package:
 * options go on `window` before the script loads, the runtime announces
 * itself with a `csprclick:loaded` event, and everything after that hangs
 * off `window.csprclick`.
 *   https://docs.cspr.click/cspr.click-sdk/integration/react-context-provider
 *
 * Why it matters here: today a creator needs the Casper Wallet extension
 * before Pico can pay them. CSPR.click lets them sign in with Google or
 * Apple and get a self-custodial Casper account, and buy CSPR with a card
 * without leaving the dashboard.
 *
 * The whole integration is inert unless NEXT_PUBLIC_CSPRCLICK_APP_ID is
 * set, so no app id means no script, no top bar and no behaviour change.
 */

const APP_ID = process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID || '';
const SDK_VERSION = process.env.NEXT_PUBLIC_CSPRCLICK_VERSION || '2.1.0';
const SCRIPT_ID = 'csprclick-client';
const UI_CONTAINER_ID = 'csprclick-ui';

/** Only the slice of the SDK surface Pico actually calls. */
export interface CsprClickAccount {
  public_key?: string;
  provider?: string;
  balance?: string;
}

export interface CsprClickRef {
  signIn: () => void;
  signOut: () => void;
  showBuyCsprUi: () => void;
  getActiveAccount: () => CsprClickAccount | null;
  getActiveAccountAsync: (options?: {
    withBalance?: boolean;
    withFiatCurrency?: string;
  }) => Promise<CsprClickAccount | null>;
  on: (event: string, handler: (account?: CsprClickAccount) => void) => void;
}

interface CsprClickContextValue {
  /** The SDK once it has loaded; null while loading or when disabled. */
  clickRef: CsprClickRef | null;
  account: CsprClickAccount | null;
  publicKey: string | null;
  /** False when no app id is configured — callers should hide their UI. */
  enabled: boolean;
  ready: boolean;
}

const CsprClickContext = createContext<CsprClickContextValue>({
  clickRef: null, account: null, publicKey: null, enabled: false, ready: false,
});

export function useCsprClick() {
  return useContext(CsprClickContext);
}

declare global {
  interface Window {
    csprclick?: CsprClickRef;
    clickSDKOptions?: Record<string, unknown>;
    clickUIOptions?: Record<string, unknown>;
  }
}

export function CsprClickProvider({ children }: { children: React.ReactNode }) {
  const enabled = Boolean(APP_ID);
  const [clickRef, setClickRef] = useState<CsprClickRef | null>(null);
  const [account, setAccount] = useState<CsprClickAccount | null>(null);
  const subscribed = useRef(false);

  const attach = useCallback((sdk: CsprClickRef) => {
    setClickRef(sdk);

    if (!subscribed.current) {
      subscribed.current = true;
      // The runtime restores a previous session on its own, so ask for the
      // account rather than waiting for a sign-in that may never come.
      sdk.getActiveAccountAsync({ withBalance: true, withFiatCurrency: 'USD' })
        .then((acc) => { if (acc?.public_key) setAccount(acc); })
        .catch(() => { /* no session yet — the sign-in button handles it */ });

      for (const event of ['csprclick:signed_in', 'csprclick:switched_account', 'csprclick:unsolicited_account_change']) {
        sdk.on(event, (acc) => setAccount(acc?.public_key ? acc : null));
      }
      for (const event of ['csprclick:signed_out', 'csprclick:disconnected']) {
        sdk.on(event, () => setAccount(null));
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // Already loaded (a client-side navigation back to a page using it).
    // Attach on a microtask rather than in the effect body: setting state
    // synchronously here would cascade a second render, and on the first
    // client render it would also diverge from the server's markup.
    if (window.csprclick) {
      const sdk = window.csprclick;
      queueMicrotask(() => attach(sdk));
      return;
    }

    const onLoaded = () => { if (window.csprclick) attach(window.csprclick); };
    window.addEventListener('csprclick:loaded', onLoaded);

    if (!document.getElementById(SCRIPT_ID)) {
      // Both option objects must exist before the script runs.
      window.clickSDKOptions = {
        appName: 'Pico',
        appId: APP_ID,
        contentMode: 'iframe',
        providers: ['casper-wallet', 'ledger', 'metamask-snap'],
      };
      window.clickUIOptions = {
        uiContainer: UI_CONTAINER_ID,
        rootAppElement: 'body',
        show1ClickModal: true,
        // Pico has its own header. The runtime renders its top bar when
        // asked for it OR when account menu items are configured, so both
        // have to stay empty to keep CSPR.click branding off the page.
        // The Buy CSPR flow is opened directly with showBuyCsprUi().
        showTopBar: false,
        accountMenuItems: [],
        defaultTheme: 'dark',
      };

      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = `https://cdn.cspr.click/ui/v${SDK_VERSION}/csprclick-client-${SDK_VERSION}.js`;
      script.async = true;
      document.body.appendChild(script);
    }

    return () => window.removeEventListener('csprclick:loaded', onLoaded);
  }, [enabled, attach]);

  const value = useMemo<CsprClickContextValue>(() => ({
    clickRef,
    account,
    publicKey: account?.public_key ?? null,
    enabled,
    ready: Boolean(clickRef),
  }), [clickRef, account, enabled]);

  return (
    <CsprClickContext.Provider value={value}>
      {enabled && (
        <div id="csprclick-ui-wrapper">
          <div id={UI_CONTAINER_ID} />
        </div>
      )}
      {children}
    </CsprClickContext.Provider>
  );
}
