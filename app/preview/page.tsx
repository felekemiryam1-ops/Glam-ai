// ─────────────────────────────────────────────────────────────────────────────
// /preview — server wrapper.
//
// Resolves whether this visitor should see the included-analysis CTA
// (Pro/Premium with remaining monthly allowance) instead of the $4.99
// one-time Glow-Up checkout. This is a server-derived decision only —
// getEntitlements() re-reads the DB-backed Subscription/Report rows, never
// anything the client could claim. Signed-out visitors always get the
// existing $4.99 flow, unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { PreviewContent } from "./PreviewContent";

export default async function PreviewPage() {
  const session = await auth();

  let canUseIncludedAnalysis = false;
  if (session?.user?.id) {
    const entitlements = await getEntitlements(session.user.id);
    canUseIncludedAnalysis = entitlements.canRunAnalysis;
  }

  return <PreviewContent canUseIncludedAnalysis={canUseIncludedAnalysis} />;
}
