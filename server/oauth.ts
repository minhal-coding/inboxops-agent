import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
export const scopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events.owned",
];
export class OAuth {
  client?: OAuth2Client;
  account?: string;
  private pending?: {
    state: string;
    verifier: string;
    expires: number;
    session: string;
  };
  constructor(
    private expected: string,
    private origin: string,
    private file = process.env.GOOGLE_OAUTH_CLIENT_FILE,
  ) {
    if (file) {
      const config = JSON.parse(readFileSync(file, "utf8")).web;
      if (!config?.client_id || !config.client_secret)
        throw Error("Use a Web application OAuth client JSON file.");
      this.client = new OAuth2Client(
        config.client_id,
        config.client_secret,
        `${origin}/oauth/callback`,
      );
    }
  }
  async start(session: string) {
    if (!this.client)
      throw Error(
        "Configure GOOGLE_OAUTH_CLIENT_FILE with a local Web OAuth client file, then restart.",
      );
    const { codeVerifier, codeChallenge } =
      await this.client.generateCodeVerifierAsync();
    const state = randomBytes(32).toString("hex");
    this.pending = {
      state,
      verifier: codeVerifier,
      expires: Date.now() + 300000,
      session,
    };
    return this.client.generateAuthUrl({
      scope: scopes,
      access_type: "online",
      prompt: "consent select_account",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      login_hint: this.expected,
    });
  }
  async callback(state: string, code: string, session: string) {
    const p = this.pending;
    this.pending = undefined;
    if (
      !p ||
      p.state !== state ||
      p.session !== session ||
      p.expires < Date.now() ||
      !this.client
    )
      throw Error(
        "OAuth state invalid or expired. Reconnect from this browser.",
      );
    try {
      const { tokens } = await this.client.getToken({
        code,
        codeVerifier: p.verifier,
      });
      if (!scopes.every((s) => (tokens.scope || "").split(" ").includes(s)))
        throw Error("Required scopes were not granted.");
      this.client.setCredentials({
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
      });
      const r = await this.client.request<{ emailAddress: string }>({
        url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        timeout: 15000,
        retry: false,
      });
      if (r.data.emailAddress.toLowerCase() !== this.expected)
        throw Error("Only the configured dedicated test account can connect.");
      this.account = this.expected;
    } catch {
      this.client.setCredentials({});
      this.account = undefined;
      throw Error(
        "OAuth connection failed. Check test user, granted scopes, and configured account; reconnect.",
      );
    }
  }
  async disconnect() {
    const token = this.client?.credentials.access_token;
    this.account = undefined;
    this.pending = undefined;
    this.client?.setCredentials({});
    if (token) {
      try {
        await this.client!.revokeToken(token);
      } catch {
        return {
          revoked: false,
          message:
            "Local token erased. Remote revocation failed; remove access in Google Account permissions.",
        };
      }
    }
    return { revoked: true };
  }
  async request<T = any>(
    url: string,
    method: "GET" | "POST" = "GET",
    data?: unknown,
  ): Promise<T> {
    if (
      !this.account ||
      !this.client?.credentials.access_token ||
      (this.client.credentials.expiry_date || 0) < Date.now() + 1000
    )
      throw Error("Test account disconnected or token expired. Reconnect.");
    try {
      return (
        await this.client.request<T>({
          url,
          method,
          data,
          timeout: 15000,
          retry: false,
        })
      ).data;
    } catch (e: any) {
      const err = new Error(
        `Google request failed (${e.response?.status || "network"}). Reconnect or reconcile before retrying.`,
      ) as Error & { status?: number };
      err.status = e.response?.status;
      throw err;
    }
  }
}
