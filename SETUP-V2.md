# Glam AI V2 — Stage 1 Setup

Run these commands once in your `glam-ai` folder:

```bash
# 1. Install dependencies (also runs `prisma generate` automatically)
npm install

# 2. Create the database tables from the schema
npm run db:push

# 3. Add the new env vars to .env.local:
#    AUTH_SECRET — generate with:  openssl rand -base64 32
#    DATABASE_URL — already set to "file:./dev.db" for local SQLite
#    RESEND_API_KEY — leave blank; magic links print to terminal in dev
#    EMAIL_FROM — leave as default

# 4. Start the dev server
npm run dev
```

## Testing Stage 1

1. Visit http://localhost:3000/login
2. Enter your email and click "Send magic link"
3. Check your **terminal** — the magic link URL will be printed there (no email needed in dev)
4. Click or paste that URL — you're now signed in
5. You'll land on http://localhost:3000/dashboard
6. Visit http://localhost:3000/dashboard without being signed in — you should be redirected to /login

## What was added

- `prisma/schema.prisma` — database schema (User, BeautyProfile, Report, Subscription)
- `lib/db.ts` — PrismaClient singleton
- `lib/auth.ts` — Auth.js v5 config (magic-link email, no passwords)
- `app/api/auth/[...nextauth]/route.ts` — Auth.js catch-all handler
- `app/(auth)/login/page.tsx` — Login/signup page (matches V1 dark gold design)
- `app/dashboard/page.tsx` — Authenticated user dashboard (stub)
- `middleware.ts` — Protects /dashboard/* routes; V1 flow unchanged

## V1 is untouched

The existing $4.99 flow (/, /upload, Stripe, /results) works exactly as before.
No changes were made to any V1 page or API route.

## For production

1. Switch `DATABASE_URL` to a Postgres connection string (Neon, Vercel Postgres, Supabase)
2. Update `prisma/schema.prisma` datasource provider from `"sqlite"` to `"postgresql"`
3. Add a real `RESEND_API_KEY` + verify your `EMAIL_FROM` domain in Resend
4. Set `AUTH_SECRET` to a strong random value (`openssl rand -base64 32`)
