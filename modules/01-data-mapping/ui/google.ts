/**
 * google.ts
 *
 * What it does: Google sign-in for the page, using Google's own sign-in library. It asks for
 * one read-only permission (view Google Sheets) and returns a short-lived access token.
 * Who calls it: main.ts.
 * Depends on: Google's sign-in script, loaded from accounts.google.com when first needed.
 *
 * Rule: the token is kept in memory only. It is never written to storage or logs, and it
 * expires in about an hour, after which the person signs in again. The permission is
 * spreadsheets.readonly, so this tool can never change a sheet.
 */

const GIS_URL = "https://accounts.google.com/gsi/client";
export const READ_ONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

// The small part of Google's library that we use.
interface TokenResponse { access_token?: string; expires_in?: string | number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(): void }
interface GoogleOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback: (e: { type?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}
declare global {
  interface Window { google?: { accounts: { oauth2: GoogleOauth2 } } }
}

export interface AccessToken { value: string; expiresAt: number } // expiresAt in milliseconds

function loadGoogleScript(): Promise<GoogleOauth2> {
  return new Promise((resolve, reject) => {
    const ready = () => (window.google?.accounts.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error("Google sign-in did not load.")));
    if (window.google?.accounts.oauth2) return ready();
    const script = document.createElement("script");
    script.src = GIS_URL;
    script.async = true;
    script.onload = ready;
    script.onerror = () => reject(new Error("Could not reach Google. Check your connection."));
    document.head.appendChild(script);
  });
}

/** Opens Google's sign-in window (must be called from a click) and returns a read-only token. */
export async function requestAccessToken(clientId: string): Promise<AccessToken> {
  const oauth2 = await loadGoogleScript();
  return new Promise((resolve, reject) => {
    oauth2
      .initTokenClient({
        client_id: clientId,
        scope: READ_ONLY_SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) return reject(new Error(r.error_description ?? "Google sign-in was not completed."));
          resolve({ value: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 });
        },
        error_callback: (e) => reject(new Error(e.type === "popup_closed" ? "The Google sign-in window was closed." : "Google sign-in failed.")),
      })
      .requestAccessToken();
  });
}

/** Signs out: tells Google to cancel the token. */
export function revokeToken(token: AccessToken): void {
  window.google?.accounts.oauth2.revoke(token.value);
}
