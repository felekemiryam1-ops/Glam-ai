// Auth.js v5 — catch-all route handler.
// Handles GET /api/auth/signin, /api/auth/signout, /api/auth/callback/*, etc.
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
