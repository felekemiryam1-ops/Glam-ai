import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// Extend the built-in session types so session.user.id is typed throughout the app.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-email resend cooldown — in-memory, same pattern as the processingLocks
// Map already used in app/api/generate-makeup/route.ts. This is a backstop
// against accidental/abusive rapid-fire resends; the real UX guard is the
// client-side cooldown timer on the dev-only "Resend magic link" button in
// app/(auth)/login/page.tsx, which prevents most requests from ever reaching
// this. NOTE: in-memory state doesn't survive across serverless instances —
// fine for a single-process dev/small-prod deployment, NOT a durable
// production rate limiter. If this app ever runs on multi-instance/
// serverless infra, replace with a DB- or Redis-backed limiter.
// ─────────────────────────────────────────────────────────────────────────────
const lastMagicLinkSentAt = new Map<string, number>();
const RESEND_COOLDOWN_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Email magic-link provider
// Dev:  prints the link to the terminal (no email provider needed)
// Prod: set RESEND_API_KEY + EMAIL_FROM and real emails are sent via Resend
// ─────────────────────────────────────────────────────────────────────────────
const emailProvider = {
  id: "email" as const,
  name: "Email",
  type: "email" as const,
  from: process.env.EMAIL_FROM ?? "Glam AI <noreply@glamai.app>",
  maxAge: 24 * 60 * 60, // link valid for 24 hours
  async sendVerificationRequest({ identifier: email, url }: { identifier: string; url: string }) {
    // ── Diagnostic trace ──────────────────────────────────────────────────
    // Step-level tracing only — never the url/token (a live sign-in
    // credential) and never the recipient's email address (PII). A prior
    // version of this logged both the raw email on request-received and on
    // rate-limit; both were removed (Stage 6 Step 8 launch audit) rather
    // than trimmed, since neither is needed to debug delivery — the steps
    // below are enough to see where a send succeeded or failed.

    // Rate-limit backstop — see comment on lastMagicLinkSentAt above.
    const now = Date.now();
    const lastSent = lastMagicLinkSentAt.get(email);
    if (lastSent && now - lastSent < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
      console.warn(`[auth] EMAIL SEND RATE LIMITED — must wait ${waitSec}s`);
      throw new Error(`Please wait ${waitSec} seconds before requesting another link.`);
    }
    lastMagicLinkSentAt.set(email, now);

    const isProduction = process.env.NODE_ENV === "production";
    const resendApiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;
    console.log("[auth] EMAIL PROVIDER INITIALIZED", {
      mode: isProduction ? "resend" : "dev-console",
      hasResendKey: !!resendApiKey,
      hasEmailFrom: !!emailFrom,
      nodeEnv: process.env.NODE_ENV,
    });

    // Development: print the link to THIS server's terminal instead of
    // sending a real email — there is no inbox to deliver to locally, so
    // the printed link IS the delivery mechanism. This is intentional, not
    // a fallback-on-error path, and only applies outside production.
    if (!isProduction) {
      console.log("[auth] ATTEMPTING TO SEND MAGIC LINK (dev-console mode)");
      console.log(
        `\n✨ Glam AI magic link ✨\n` +
          `   Email : ${email}\n` +
          `   URL   : ${url}\n` +
          `\n[auth] EMAIL SEND SUCCESS (printed above — click that URL to sign in; no real email is sent in development)\n`
      );
      return;
    }

    // Production: Resend is required — never silently fall back to
    // console-logging the link (that would report a fake "check your
    // email" success while no email was actually sent). Fail loudly and
    // clearly instead, without ever printing the key itself.
    if (!resendApiKey || !emailFrom) {
      const missing = [!resendApiKey && "RESEND_API_KEY", !emailFrom && "EMAIL_FROM"].filter(Boolean).join(", ");
      console.error(`[auth] EMAIL SEND ERROR: Missing required production email configuration: ${missing}`);
      throw new Error("Email delivery is not configured. Please contact support.");
    }

    // Production: send via Resend (https://resend.com)
    console.log("[auth] ATTEMPTING TO SEND MAGIC LINK (resend)");
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(resendApiKey);

      const { error } = await resend.emails.send({
        from: emailFrom,
        to: email,
        subject: "Your Glam AI sign-in link",
        html: `
          <!DOCTYPE html>
          <html>
            <body style="background:#0a0a0f;color:#f5f0ec;font-family:Georgia,serif;padding:40px 20px;text-align:center;">
              <div style="max-width:460px;margin:0 auto;">
                <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#c9a96e,#f0d99a);margin:0 auto 24px;"></div>
                <h1 style="font-size:28px;font-weight:300;margin-bottom:8px;letter-spacing:0.5px;">Glam AI</h1>
                <p style="color:#9a8fa0;font-size:14px;margin-bottom:32px;">Click the button below to sign in. The link expires in 24 hours.</p>
                <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#f0d99a);color:#0a0a0f;font-family:system-ui,sans-serif;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
                  Sign in to Glam AI
                </a>
                <p style="color:#4a445a;font-size:12px;margin-top:32px;">
                  If you didn't request this, you can safely ignore this email.
                </p>
              </div>
            </body>
          </html>
        `,
      });

      if (error) {
        console.error("[auth] EMAIL SEND ERROR:", error.name, "-", error.message);
        throw new Error(`Failed to send magic link: ${error.message}`);
      }

      console.log("[auth] EMAIL SEND SUCCESS (resend)");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[auth] EMAIL SEND ERROR:", message);
      throw err;
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Auth.js v5 export — { handlers, auth, signIn, signOut }
//
// AUTH_SECRET is required in all environments.
// Generate one with:  openssl rand -base64 32
// Then add to .env.local:  AUTH_SECRET=<generated value>
// ─────────────────────────────────────────────────────────────────────────────
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Pass secret explicitly so the required env var is visible in source.
  // Auth.js v5 uses AUTH_SECRET; NEXTAUTH_SECRET is the v4 legacy name.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  providers: [emailProvider],
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=true",
    error: "/login?error=true",
  },
  session: {
    strategy: "database",
  },
  callbacks: {
    // Expose the User's database id on the session object so server
    // components can do prisma lookups without an extra DB query.
    session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
