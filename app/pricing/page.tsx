// /pricing — server component wrapper.
// Resolves the viewer's current plan server-side via getEntitlements()
// (unmodified) — never trusted from the client — so PricingContent can
// show "Current Plan" / "Manage Subscription" instead of a Checkout button
// for someone who's already subscribed. An unauthenticated visitor simply
// resolves to "free", same as any signed-out user.
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { PricingContent } from "./PricingContent";

export default async function PricingPage() {
  const session = await auth();
  const currentPlan = session?.user?.id ? (await getEntitlements(session.user.id)).plan : "free";

  return <PricingContent currentPlan={currentPlan} />;
}
