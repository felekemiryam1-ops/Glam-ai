"use client";

// SessionProvider enables useSession() in any client component below this in the tree.
// Kept in its own file so the root layout stays a server component.
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
