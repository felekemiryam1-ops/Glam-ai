import Anthropic from "@anthropic-ai/sdk";
import type { GlamReport } from "./types";
import { validateReport, extractAndParseJson } from "./reportValidator";

// ──────────────────────────────────────────────────────────────────────────────
// Beauty profile context — loaded from DB and injected into the AI prompt
// when the user is authenticated and has completed onboarding.
// ──────────────────────────────────────────────────────────────────────────────

export interface BeautyProfileContext {
  goals?: string[];
  aesthetic?: string;
  budget?: string;
}

const BUDGET_LABELS: Record<string, string> = {
  budget: "budget-friendly (drugstore / affordable finds)",
  mid_range: "mid-range (mix of drugstore and mid-tier brands)",
  premium: "premium / luxury (investment-level products)",
};

function buildProfilePreamble(profile: BeautyProfileContext): string {
  const lines: string[] = [];

  if (profile.goals && profile.goals.length > 0) {
    lines.push(`- Beauty goals: ${profile.goals.join(", ")}`);
  }
  if (profile.aesthetic) {
    lines.push(`- Preferred aesthetic: ${profile.aesthetic.replace(/_/g, " ")}`);
  }
  if (profile.budget) {
    lines.push(`- Budget preference: ${BUDGET_LABELS[profile.budget] ?? profile.budget}`);
  }

  if (lines.length === 0) return "";

  return (
    "\n\nIMPORTANT — Your client has shared these personal preferences. " +
    "Tailor ALL recommendations to align with their goals, preferred aesthetic, and budget:\n" +
    lines.join("\n")
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// AI client — server-side only. API key never reaches the browser.
// ──────────────────────────────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Model used for analysis.
 * Override via ANTHROPIC_MODEL environment variable.
 * Default: claude-opus-4-5 (supports vision, returns rich responses).
 * See https://docs.anthropic.com/en/docs/about-claude/models for current options.
 */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-5";

const SYSTEM_PROMPT = `You are a professional beauty consultant and personal stylist with expertise in makeup artistry, hair styling, color theory, and personal style coaching. You analyze photos to provide personalized, actionable beauty recommendations.

IMPORTANT GUIDELINES:
- Phrase all recommendations as suggestions, not diagnoses
- Never make claims about race, ethnicity, medical conditions, mental health, personality, or health status
- Do not estimate age
- Present observations as helpful suggestions, not objective facts
- Use empowering, positive language
- Be specific and actionable
- Focus on what could enhance and complement the person's features
- If the photo is unclear or doesn't show certain features well, acknowledge this gracefully and provide general suggestions

Return ONLY valid JSON matching the exact schema provided. No markdown, no explanation outside the JSON.`;

const USER_PROMPT = `Analyze this photo and provide a comprehensive Glam AI Glow-Up beauty report.

Return a JSON object with this exact structure:
{
  "profile": {
    "headline": "A personalized, empowering 1-line headline (e.g., 'Your natural radiance is your greatest asset')",
    "summary": "2-3 sentence personalized introduction that feels warm and specific to what you observe"
  },
  "makeup": {
    "base": {
      "title": "Foundation & Complexion",
      "recommendation": "Specific product types and shades to try",
      "why": "Why this approach could work for them",
      "products": ["Example product suggestion 1", "Example product suggestion 2"]
    },
    "blush": {
      "title": "Blush",
      "recommendation": "Blush colors, textures, and placement",
      "why": "Why these choices could complement their features",
      "products": ["Example product 1"]
    },
    "bronzer": {
      "title": "Bronzer & Contour",
      "recommendation": "Bronzer approach and placement",
      "why": "How this could enhance their features",
      "products": ["Example product 1"]
    },
    "highlighter": {
      "title": "Highlighter",
      "recommendation": "Highlight colors and placement",
      "why": "How highlighting could work for their features",
      "products": ["Example product 1"]
    },
    "eyes": {
      "title": "Eye Makeup",
      "recommendation": "Eye shadow palette directions, liner, mascara approach",
      "why": "How these choices could enhance their eyes",
      "products": ["Example product 1", "Example product 2"]
    },
    "lips": {
      "title": "Lip Color",
      "recommendation": "Lip colors and finishes that could work well",
      "why": "Why these lip choices could complement their overall look",
      "products": ["Example product 1"]
    }
  },
  "hair": {
    "styles": {
      "title": "Hair Styles",
      "recommendation": "2-3 specific hairstyle directions that could look great",
      "why": "How these styles could complement their features",
      "products": []
    },
    "cuts": {
      "title": "Hair Cuts",
      "recommendation": "Specific cut descriptions (length, layers, framing)",
      "why": "How these cuts could work with their face shape and features",
      "products": []
    },
    "styling": {
      "title": "Styling Tips",
      "recommendation": "Day-to-day styling approaches and techniques",
      "why": "Why these techniques could enhance their natural hair",
      "products": ["Example styling product"]
    },
    "color": {
      "title": "Hair Color",
      "recommendation": "Color directions to consider (or maintaining natural)",
      "why": "How these color choices could complement their overall coloring",
      "products": []
    }
  },
  "colors": {
    "clothing": {
      "title": "Clothing Colors",
      "recommendation": "Color families and specific shades to try in clothing",
      "why": "Why these colors could work well with their coloring",
      "products": []
    },
    "makeup": {
      "title": "Makeup Color Palette",
      "recommendation": "Overall color direction for makeup (neutrals vs bold, warm vs cool tones)",
      "why": "How these color choices could enhance their natural features",
      "products": []
    },
    "accessories": {
      "title": "Accessories & Metals",
      "recommendation": "Metal tones, gem colors, and accessory colors to consider",
      "why": "How these choices could complement their overall look",
      "products": []
    }
  },
  "style": [
    {
      "name": "Style Direction Name",
      "description": "2-sentence description of this aesthetic",
      "keyPieces": ["Key wardrobe piece 1", "Key wardrobe piece 2", "Key wardrobe piece 3"]
    }
  ],
  "aestheticIdentity": {
    "name": "A single, specific name for their overall aesthetic identity (e.g. 'Warm Editorial Minimalist')",
    "description": "2-3 sentences describing this identity as a cohesive whole — how their coloring, features, and best style directions come together",
    "keyPieces": ["Signature element 1", "Signature element 2", "Signature element 3"]
  },
  "featureEnhancements": [
    {
      "region": "eyes",
      "title": "A short 2-4 word phrase naming what stands out about this feature (e.g. 'Natural focal point', 'Defined bone structure') — not a product name",
      "recommendation": "One short sentence, under 12 words, naming the single enhancement to try — shown by default, so keep it brief",
      "why": "1-2 sentences of deeper reasoning — only shown when the user asks for more detail, so this can go further than the recommendation above",
      "products": ["Example product 1"]
    }
  ],
  "priorities": [
    {
      "rank": 1,
      "title": "Highest Impact Change",
      "description": "What to try and why it could have big impact",
      "impact": "high"
    },
    {
      "rank": 2,
      "title": "Second Priority",
      "description": "Description",
      "impact": "high"
    },
    {
      "rank": 3,
      "title": "Third Priority",
      "description": "Description",
      "impact": "medium"
    }
  ],
  "quickPlan": {
    "today": ["Actionable thing to try today 1", "Actionable thing to try today 2"],
    "thisWeek": ["Try this week 1", "Try this week 2"],
    "nextPurchase": ["Consider buying 1", "Consider buying 2"]
  }
}

Provide 5 style directions in the style array. Provide 3-5 featureEnhancements, each with a "region" that is exactly one of: "eyes", "brows", "lips", "cheeks", "jawline", "forehead" — no other values are valid for "region". Make the report feel genuinely personalized and specific to the photo. Be warm, encouraging, and practical.`;

/**
 * Analyze a base64-encoded image and return a validated GlamReport.
 *
 * Pass an optional `profile` to inject the user's beauty preferences into
 * the AI prompt. When provided, the AI tailors recommendations to their
 * goals, aesthetic, and budget.
 *
 * Throws if:
 * - The image is too large
 * - The AI returns a non-text response
 * - The AI response cannot be parsed as JSON
 * - The parsed JSON does not match the expected GlamReport structure
 */
export async function analyzePhoto(
  imageBase64: string,
  mimeType: string = "image/jpeg",
  profile?: BeautyProfileContext
): Promise<GlamReport> {
  // Guard: base64 string size check (14MB base64 ≈ 10MB binary)
  if (imageBase64.length > 14_000_000) {
    throw new Error("Image is too large for analysis");
  }

  const validMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  type ValidMime = (typeof validMimeTypes)[number];
  const safeMime: ValidMime = validMimeTypes.includes(mimeType as ValidMime)
    ? (mimeType as ValidMime)
    : "image/jpeg";

  // Inject profile context if available — personalizes recommendations
  const promptText = profile
    ? USER_PROMPT + buildProfilePreamble(profile)
    : USER_PROMPT;

  const response = await client.messages.create({
    model: MODEL,
    // Bumped from 4096 alongside the aestheticIdentity/featureEnhancements
    // additions below — the JSON payload grew and 4096 risked truncation.
    max_tokens: 6144,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: safeMime,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: promptText,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response format from AI — no text content returned");
  }

  // Extract and parse JSON (handles markdown fences, leading/trailing text)
  const raw = extractAndParseJson(content.text);

  // Structural validation — throws with a descriptive error if invalid
  const report = validateReport(raw);

  return report;
}
