"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const MESSAGES = [
  "Reviewing your uploaded photo...",
  "Analyzing your unique features...",
  "Building your makeup recommendations...",
  "Curating your hair suggestions...",
  "Identifying your color palette...",
  "Finding your best style directions...",
  "Creating your glow-up priorities...",
  "Finalizing your personalized report...",
];

export default function LoadingAnalysis() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Rotate through messages every ~3.5 seconds
    const messageInterval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
        setFadeIn(true);
      }, 300);
    }, 3500);

    // Smooth progress bar (doesn't reach 100 — fills to ~90% while waiting)
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const remaining = 90 - prev;
        return prev + remaining * 0.04;
      });
    }, 200);

    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        {/* Animated icon */}
        <div className="relative inline-flex items-center justify-center mb-10">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: "#FCE7EF", border: "1px solid #F1E6EA" }}
          >
            <Sparkles size={34} style={{ color: "#E88BA8" }} />
          </div>
          {/* Pulse rings */}
          <div
            className="absolute inset-0 rounded-full pulse-ring"
            style={{ border: "1px solid rgba(232,139,168,0.35)" }}
          />
          <div
            className="absolute inset-0 rounded-full pulse-ring"
            style={{ border: "1px solid rgba(232,139,168,0.18)", animationDelay: "0.7s" }}
          />
        </div>

        <h2
          className="text-2xl sm:text-3xl font-light mb-2 text-[#242024]"
          style={{ fontFamily: "var(--font-cormorant)", letterSpacing: "-0.01em" }}
        >
          Glam AI is crafting your report
        </h2>
        <p className="text-sm text-[#777177] mb-9">This takes about 30–60 seconds</p>

        {/* Progress bar */}
        <div
          className="h-1 rounded-full mb-6 overflow-hidden"
          style={{ background: "#F1E6EA" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(to right, #E88BA8, #F5B8CB)",
            }}
          />
        </div>

        {/* Rotating status message */}
        <div className="h-8 flex items-center justify-center">
          <p
            className="text-sm transition-opacity duration-300"
            style={{ color: "#777177", opacity: fadeIn ? 1 : 0 }}
          >
            {MESSAGES[messageIndex]}
          </p>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-2 mt-6">
          <div className="w-2 h-2 rounded-full loading-dot" style={{ background: "#E88BA8" }} />
          <div className="w-2 h-2 rounded-full loading-dot" style={{ background: "#E88BA8" }} />
          <div className="w-2 h-2 rounded-full loading-dot" style={{ background: "#E88BA8" }} />
        </div>
      </div>
    </div>
  );
}
