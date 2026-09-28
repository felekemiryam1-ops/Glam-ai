/**
 * Glam AI Analytics — V1
 *
 * Lightweight event tracking for funnel analysis.
 * Events are logged server-side and optionally sent to a third-party
 * analytics provider (swap out the implementation below as needed).
 *
 * Key funnel events:
 *   landing_page_view → cta_click → photo_upload_started →
 *   checkout_started → payment_success → analysis_completed
 */

type EventName =
  | "landing_page_view"
  | "cta_click"
  | "photo_upload_started"
  | "checkout_started"
  | "payment_success"
  | "analysis_started"
  | "analysis_completed"
  | "analysis_failed"
  | "analysis_retried"
  | "payment_cancelled"
  | "report_already_consumed";

interface EventProperties {
  [key: string]: string | number | boolean | undefined;
}

export function trackEvent(event: EventName, properties?: EventProperties) {
  // Server-safe console log for development visibility
  // In production, replace this with your analytics provider:
  //   - PostHog: posthog.capture(event, properties)
  //   - Segment: analytics.track(event, properties)
  //   - Plausible: window.plausible?.(event, { props: properties })
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Analytics] ${event}`, properties || "");
  }

  // TODO: Add your analytics provider here
  // Example with PostHog:
  // if (typeof window !== "undefined") {
  //   window.posthog?.capture(event, properties);
  // }
}

// Client-side tracking helper
export function trackClientEvent(event: EventName, properties?: EventProperties) {
  // Use sendBeacon for reliability (doesn't block page navigation).
  // Uncomment the lines below once you have an analytics endpoint:
  // if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
  //   const payload = JSON.stringify({ event, properties, timestamp: Date.now() });
  //   navigator.sendBeacon('/api/analytics', payload);
  // }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[Analytics Client] ${event}`, properties || "");
  }
}
