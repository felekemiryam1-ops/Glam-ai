import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#f5f0ec] flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-8xl font-light mb-4" style={{ fontFamily: "var(--font-serif)", color: "#c9a96e" }}>
          404
        </div>
        <h1 className="text-2xl font-light mb-3" style={{ fontFamily: "var(--font-serif)" }}>
          Page not found
        </h1>
        <p className="text-[#6b6570] mb-8">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="btn-primary inline-flex items-center gap-2 py-3 px-6 rounded-xl font-medium text-sm"
        >
          Back to Glam AI
          <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
