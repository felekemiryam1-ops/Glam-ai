/**
 * prisma/seedData/products.ts — the verified Stage 5A curated catalog.
 *
 * Every entry below was individually researched against a real source
 * (brand's official site or a major retailer) — see the Stage 5A final
 * report for the full verification notes and sourcing caveats. No price,
 * shade, URL, hex, or image was invented. `hex` is omitted everywhere
 * because no source published one for any of these 35 products — that is
 * expected for makeup, not a data gap.
 *
 * One candidate from the originally-proposed 36 was skipped entirely:
 * HUDA BEAUTY Nude Obsessions — Medium (the product is real, but its
 * current price could not be reliably verified — official pages returned
 * errors and secondary sources disagreed by a wide margin).
 *
 * A few corrections were made from the original candidate list where
 * research found the real current product differs slightly from the
 * shorthand name given — documented inline on each affected entry.
 */

export interface ProductSeedInput {
  brand: string;
  name: string;
  // "eyeshadow" = an individual shade; "eyeshadow-palette" = a multi-pan
  // palette. Split as of Stage 5A.1 so the matching engine can prioritize
  // individual shades — see lib/productMatching.ts.
  category: "blush" | "eyeshadow" | "eyeshadow-palette" | "lipstick" | "lip gloss";
  shadeName: string;
  hex?: string;
  undertone?: "warm" | "cool" | "neutral" | "universal";
  priceCents: number;
  currency: string;
  imageUrl?: string;
  retailer: string;
  productUrl: string;
  // Real, sourced descriptive words only (color/finish terms quoted from
  // official verification research) — never fabricated. For individual
  // shades: the verified shade description + finish (needed because many
  // real shade names are proper nouns with no color word in them at all,
  // e.g. "Embark" — the matcher can't work from shadeName alone). For
  // palettes: real documented pan-level color families, ONLY when a source
  // actually published per-pan descriptions; otherwise omitted rather than
  // guessed.
  tags?: string[];
  active?: boolean; // defaults to true in the seed script
}

export const PRODUCT_SEED_DATA: ProductSeedInput[] = [
  // ── Blush ──────────────────────────────────────────────────────────────
  {
    brand: "e.l.f. Cosmetics",
    name: "Camo Liquid Blush",
    shadeName: "Peach Perfect",
    category: "blush",
    undertone: "warm",
    priceCents: 800,
    currency: "usd",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0661/2251/4520/files/82415_OpenA_V4_R.png?v=1776967206&width=720&height=720&crop=center",
    retailer: "e.l.f. Cosmetics",
    productUrl: "https://www.elfcosmetics.com/camo-liquid-blush/82415.html",
  },
  {
    brand: "e.l.f. Cosmetics",
    name: "Camo Liquid Blush",
    shadeName: "Copper Etiquette",
    category: "blush",
    undertone: "warm",
    priceCents: 800,
    currency: "usd",
    retailer: "e.l.f. Cosmetics",
    productUrl: "https://www.elfcosmetics.com/camo-liquid-blush/84639.html",
  },
  {
    brand: "NYX Professional Makeup",
    name: "Buttermelt Blush",
    shadeName: "Getting Butta",
    category: "blush",
    undertone: "cool", // retailer copy: "a cool pink shade with glowy shimmer" — not warm despite the name
    priceCents: 999,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_4725a9f0-bc36-436a-b5b1-7a71c6ef4863?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl: "https://www.target.com/p/nyx-professional-makeup-buttermelt-blush-getting-butta-0-17oz/-/A-90591902",
  },
  {
    brand: "NYX Professional Makeup",
    name: "Buttermelt Blush",
    shadeName: "Butta Than Coral",
    category: "blush",
    undertone: "warm",
    priceCents: 999,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_af15186b-cb59-4be5-b69d-8ce08dacb406?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl:
      "https://www.target.com/p/nyx-professional-makeup-buttermelt-blush-butta-than-coral-0-17oz/-/A-95032988",
  },
  {
    brand: "Milani",
    name: "Cheek Kiss Cream Blush",
    shadeName: "Merlot Moment",
    category: "blush",
    undertone: "cool", // deep burgundy/wine tone
    priceCents: 1099,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_cdf3cf4d-f018-4509-b6e0-c95fb8ac5f7f?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl: "https://www.target.com/p/milani-cheek-kiss-cream-blush-merlot-moment-140-0-21oz/-/A-80021448",
  },
  {
    brand: "Milani",
    name: "Cheek Kiss Cream Blush",
    shadeName: "Coral Crush",
    category: "blush",
    undertone: "warm",
    priceCents: 1099,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_f811ef2c-c2df-4297-9bde-fb4ab81f7995?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl: "https://www.target.com/p/milani-cheek-kiss-cream-blush-coral-crush-120-0-21-fl-oz/-/A-80021437",
  },
  {
    // Current real product name includes "+ Glow" — corrected from the
    // shorthand "Cheek Kiss Liquid Blush" in the original candidate list.
    brand: "Milani",
    name: "Cheek Kiss Liquid Blush + Glow",
    shadeName: "Canela",
    category: "blush",
    undertone: "warm", // "Canela" = cinnamon, a warm brown tone
    priceCents: 869,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_bef6b83f-0012-4f95-b3ce-733d28b32b67?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl: "https://www.target.com/p/milani-cheek-kiss-liquid-blush-glow-canela-0-33-fl-oz/-/A-92173618",
  },
  {
    brand: "ColourPop",
    name: "Perfect Peach Liquid Blush",
    shadeName: "Perfect Peach",
    category: "blush",
    undertone: "warm",
    priceCents: 1000,
    currency: "usd",
    imageUrl:
      "https://colourpop.com/cdn/shop/files/LiquidBlush-PerfectPeach-PDP-Open_30c6f2dc-401c-4613-8854-3491e2402b1b.jpg",
    retailer: "ColourPop",
    productUrl: "https://colourpop.com/products/perfect-peach-liquid-blush",
  },
  {
    // Original candidate had no shade specified ("selected warm shade").
    // Researched Rare Beauty's real current Soft Pinch lineup — "Love" is
    // officially described as "Terracotta" (matte), unambiguously warm.
    brand: "Rare Beauty",
    name: "Soft Pinch Liquid Blush",
    shadeName: "Love",
    category: "blush",
    undertone: "warm",
    priceCents: 2500,
    currency: "usd",
    retailer: "Rare Beauty",
    productUrl: "https://www.rarebeauty.com/products/soft-pinch-liquid-blush",
  },
  {
    brand: "NARS",
    name: "Afterglow Liquid Blush",
    shadeName: "Brazen",
    category: "blush",
    undertone: "warm", // officially described as "coral peach"
    priceCents: 3200,
    currency: "usd",
    retailer: "Sephora",
    productUrl: "https://www.sephora.com/product/nars-afterglow-liquid-blush-03-fl-oz-P525155",
  },
  {
    // Original candidate had no shade specified ("selected warm shade").
    // Researched NARS's real current Blush lineup — "Taj Mahal" is
    // officially described as "Burnished orange with golden shimmer."
    brand: "NARS",
    name: "Blush",
    shadeName: "Taj Mahal",
    category: "blush",
    undertone: "warm",
    priceCents: 3240,
    currency: "usd",
    imageUrl:
      "https://www.narscosmetics.com/dw/image/v2/BBSK_PRD/on/demandware.static/-/Sites-itemmaster_NARS/default/dw7f8be5a6/blush_deep/tajMahalDeep.png",
    retailer: "NARS",
    productUrl: "https://www.narscosmetics.com/USA/powder-blush/999NAC0000192.html",
  },
  {
    // Original candidate had no shade specified. Researched Merit's real
    // current Flush Balm lineup — "Lusitano" is officially "Soft Peach."
    brand: "Merit",
    name: "Flush Balm",
    shadeName: "Lusitano",
    category: "blush",
    undertone: "warm",
    priceCents: 3000,
    currency: "usd",
    imageUrl:
      "https://www.meritbeauty.com/cdn/shop/files/MERIT24-FlushBalm-Lusitano_abf6fc4a-2d65-4381-8ae6-ffabf47990c0.jpg?v=1751399878&width=2048",
    retailer: "Merit",
    productUrl: "https://www.meritbeauty.com/products/flush-balm",
  },
  {
    // Original candidate had no shade specified. Researched Hourglass's
    // real current Ambient Lighting Blush lineup — "Dim Infusion" is
    // officially "A subdued coral blush fused with Dim Light to add warmth."
    brand: "Hourglass",
    name: "Ambient Lighting Blush",
    shadeName: "Dim Infusion",
    category: "blush",
    undertone: "warm",
    priceCents: 4800,
    currency: "usd",
    retailer: "Hourglass Cosmetics",
    productUrl: "https://www.hourglasscosmetics.com/products/ambient-lighting-blush",
  },
  {
    // Original candidate had no shade specified. Researched Huda Beauty's
    // real current Blush Filter lineup — "Peach Sorbet" is described as
    // "Peachy Tangerine."
    brand: "HUDA BEAUTY",
    name: "Blush Filter Soft Glow Liquid Blush",
    shadeName: "Peach Sorbet",
    category: "blush",
    undertone: "warm",
    priceCents: 2500,
    currency: "usd",
    retailer: "Sephora",
    productUrl: "https://www.sephora.com/product/blush-filter-soft-glow-liquid-blush-P510756",
  },

  // ── Eyeshadow: individual shades (Stage 5A.1) ───────────────────────────
  // Every shadeDescription-derived tag below is a direct paraphrase of the
  // verified quote from Stage 5A.1's research (see that report) — never
  // fabricated. These exist specifically because several real shade names
  // are proper nouns with no color word at all (e.g. "Embark", "DGAF"),
  // so shadeName alone isn't enough for the matcher to work with.
  {
    brand: "MAC Cosmetics",
    name: "Eye Shadow",
    shadeName: "Embark",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 2600,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2510807",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/matte-eyeshadow-xlsImpprod15921122?sku=2510807",
    tags: ["intense", "reddish", "brown", "matte"], // Ulta: "intense reddish brown"
  },
  {
    brand: "MAC Cosmetics",
    name: "Eye Shadow",
    shadeName: "Espresso",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 2600,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2510748",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/matte-eyeshadow-xlsImpprod15921122?sku=2510748",
    tags: ["golden", "brown", "muted", "matte"], // Ulta: "muted golden brown"
  },
  {
    brand: "Charlotte Tilbury",
    name: "Eyes to Mesmerise",
    shadeName: "Amber Gold",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 3600,
    currency: "usd",
    imageUrl:
      "https://images.ctfassets.net/wlke2cbybljx/68boqrSaG7qoz0RAjsRQj5/d343c924a28ef22c9f5e5a6341bd2755/Amber-Gold-Lid-Off-Packshot.png",
    retailer: "Charlotte Tilbury",
    productUrl: "https://www.charlottetilbury.com/us/product/eyes-to-mesmerise-amber-gold",
    tags: ["amber", "gold", "metallic", "cream"], // official: "amber-gold cream eyeshadow"
  },
  {
    brand: "MAC Cosmetics",
    name: "Eye Shadow",
    shadeName: "Soft Brown",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 2600,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2510784",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/matte-eyeshadow-xlsImpprod15921122?sku=2510784",
    tags: ["golden", "peachy", "brown", "soft", "matte"], // Ulta: "soft golden peachy-brown"
  },
  {
    brand: "ColourPop",
    name: "Super Shock Shadow",
    shadeName: "Glow Up",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 700,
    currency: "usd",
    retailer: "ColourPop",
    productUrl: "https://colourpop.com/products/glow-up-super-shock-shadow",
    tags: ["warm", "bronze", "gold", "glitter"], // official: "warm bronze... gold pin points"
  },
  {
    brand: "MAC Cosmetics",
    name: "Eye Shadow",
    shadeName: "Cork",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 2600,
    currency: "usd",
    retailer: "maccosmetics.com",
    productUrl: "https://www.maccosmetics.com/products/small-eye-shadow?shade=Cork",
    tags: ["golden", "brown", "muted", "satin"], // MAC: "muted golden brown"
  },
  {
    brand: "Urban Decay",
    name: "24/7 Eyeshadow",
    shadeName: "Ember",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 2300,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2576901",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/247-eyeshadow-pimprod2022729?sku=2576901",
    tags: ["deep", "copper", "metallic"], // Ulta: "deep copper metallic"
  },
  {
    brand: "MAC Cosmetics",
    name: "Eye Shadow",
    shadeName: "Shell Peach",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 2600,
    currency: "usd",
    retailer: "maccosmetics.com",
    productUrl: "https://www.maccosmetics.com/products/small-eye-shadow?shade=Shell%20Peach",
    tags: ["soft", "peach"], // MAC official: "soft peach"
  },
  {
    brand: "Stila",
    name: "Liqua-Play Eye Shadow",
    shadeName: "Taupaz",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 2500,
    currency: "usd",
    imageUrl:
      "https://www.stilacosmetics.com/cdn/shop/files/Fall26_LiquaPlay_Prod_Wand_Taupaz_40943ec3-7918-4bc8-9116-f57dbe72e4e8.jpg?v=1785499379&width=1200",
    retailer: "Stila",
    productUrl: "https://www.stilacosmetics.com/products/liqua-play-eye-shadow?variant=53633723761005",
    tags: ["deep", "warm", "taupe", "shimmer"], // official: "Shimmering Deep Warm Taupe"
  },
  {
    brand: "ColourPop",
    name: "Super Shock Shadow",
    shadeName: "DGAF",
    category: "eyeshadow",
    undertone: "warm",
    priceCents: 700,
    currency: "usd",
    imageUrl: "https://colourpop.com/cdn/shop/files/DGAF_a_283b9d9f-7d5d-450f-8774-5ce5c66eaec2.jpg",
    retailer: "ColourPop",
    productUrl: "https://colourpop.com/products/dgaf",
    tags: ["warm", "rusty", "brown", "gold", "glitter"], // official: "warm rusty brown... multi-dimensional gold"
  },

  // ── Eyeshadow: palettes — 5 kept active, 6 replaced (Stage 5A.1) ────────
  // The 6 replaced palettes are set inactive, NOT deleted — preserved in
  // the database, excluded from matching (see lib/productMatching.ts's
  // `active` filter, unchanged from Stage 5A).
  {
    brand: "Urban Decay",
    name: "Naked Shaped Multi-Tasking Eyeshadow Palette",
    shadeName: "Warm",
    category: "eyeshadow-palette",
    undertone: "warm",
    priceCents: 5600,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2642049",
    retailer: "Ulta Beauty",
    productUrl:
      "https://www.ulta.com/p/naked-shaped-multi-tasking-eyeshadow-palette-warm-pimprod2053513?sku=2642049",
    // Real per-pan descriptions pulled directly from the product page —
    // see Stage 5A.1 report for the full named-pan breakdown.
    tags: ["chocolate", "brown", "espresso", "caramel", "tan", "honey", "beige", "bronze", "copper", "peach", "cream", "matte", "shimmer"],
  },
  {
    brand: "Natasha Denona",
    name: "I Need a Warm Eyeshadow Palette",
    shadeName: "I Need a Warm",
    category: "eyeshadow-palette",
    undertone: "warm",
    priceCents: 7200,
    currency: "usd",
    imageUrl:
      "https://natashadenona.com/cdn/shop/files/Eyes_INAW_Website_PPG_Carrousel_01_Packshot.jpg?crop=center&height=1500&v=1762441935&width=1500",
    retailer: "Natasha Denona",
    productUrl: "https://natashadenona.com/products/i-need-a-warm-eyeshadow-palette",
    // Real per-pan descriptions pulled directly from the product page.
    tags: ["brown", "caramel", "golden", "bronze", "peach", "matte", "metallic"],
  },
  {
    brand: "Tarte",
    name: "Tartelette Toasted Amazonian Clay Palette",
    shadeName: "Toasted",
    category: "eyeshadow-palette",
    undertone: "warm",
    priceCents: 4900,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2640795",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/tartelette-toasted-amazonian-clay-palette-pimprod2052616?sku=2640795",
    // No per-pan data was exposed by the source — general warm descriptor
    // only, deliberately not claiming specific shade families we can't verify.
    tags: ["warm"],
  },
  {
    brand: "NYX Professional Makeup",
    name: "Ultimate Color Shadow Palette",
    shadeName: "Warm Neutrals",
    category: "eyeshadow-palette",
    undertone: "warm",
    priceCents: 2000,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2609541",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/ultimate-color-shadow-palette-warm-neutrals-pimprod2039711?sku=2609541",
    // No per-pan data exposed by the source — general only.
    tags: ["warm", "neutral"],
  },
  {
    brand: "ColourPop",
    name: "Golden Hour Eyeshadow Palette",
    shadeName: "Golden Hour",
    category: "eyeshadow-palette",
    undertone: "warm",
    priceCents: 2400,
    currency: "usd",
    imageUrl: "https://colourpop.com/cdn/shop/files/EyePalette-GoldenHour-Shot5.jpg?v=1703209911",
    retailer: "ColourPop",
    productUrl: "https://colourpop.com/products/golden-hour-shadow-palette",
    // Per-pan color descriptions weren't exposed, but the palette's own
    // official copy ("warm sunset golds & bronzes") is a real, sourced
    // palette-level quote — used as-is, not extended into unverified claims.
    tags: ["warm", "golden", "bronze"],
  },
  {
    brand: "ColourPop",
    name: "Nude Mood Eyeshadow Palette",
    shadeName: "Nude Mood",
    category: "eyeshadow-palette",
    undertone: "warm",
    priceCents: 1400,
    currency: "usd",
    imageUrl: "https://colourpop.com/cdn/shop/files/Nude-Mood_1.jpg?v=1750121231&width=600",
    retailer: "ColourPop",
    productUrl: "https://colourpop.com/products/nude-mood-neutral-eyeshadow-palette",
    active: false, // replaced — redundant with Golden Hour, kept for history only
  },
  {
    brand: "ColourPop",
    name: "Going Coconuts Eyeshadow Palette",
    shadeName: "Going Coconuts",
    category: "eyeshadow-palette",
    undertone: "warm",
    priceCents: 1400,
    currency: "usd",
    imageUrl:
      "https://colourpop.com/cdn/shop/files/EyePalette-GoingCoconuts-Closed-PDP.jpg?v=1739473333&width=620",
    retailer: "ColourPop",
    productUrl: "https://colourpop.com/products/going-coconuts-eyeshadow-palette",
    active: false, // replaced — redundant with Golden Hour, kept for history only
  },
  {
    brand: "ColourPop",
    name: "Peach Jelly Eyeshadow Palette",
    shadeName: "Peach Jelly",
    category: "eyeshadow-palette",
    undertone: "warm",
    priceCents: 1400,
    currency: "usd",
    imageUrl:
      "https://colourpop.com/cdn/shop/files/PeachJelly_EyeshadowPalette_ECOM.jpg?v=1778532750&width=600",
    retailer: "ColourPop",
    productUrl: "https://colourpop.com/products/peach-jelly-shadow-palette",
    active: false, // replaced — redundant with Golden Hour, kept for history only
  },
  {
    brand: "Rare Beauty",
    name: "Essential Neutrals Eyeshadow Palette",
    shadeName: "Essential Neutrals",
    category: "eyeshadow-palette",
    priceCents: 3000,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2647814",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/essential-neutrals-eyeshadow-palette-pimprod2057536?sku=2647814",
    active: false, // replaced — undertone never confirmed warm
  },
  {
    brand: "Anastasia Beverly Hills",
    name: "Soft Glam Eyeshadow Palette",
    shadeName: "Soft Glam",
    category: "eyeshadow-palette",
    priceCents: 4800,
    currency: "usd",
    imageUrl:
      "https://www.anastasiabeverlyhills.com/cdn/shop/files/SoftGlamEyeshadowPaletteEYES_PaletteRule_SoftGlam-open_OPTIMIZED.jpg?v=1762270155",
    retailer: "Anastasia Beverly Hills",
    productUrl: "https://www.anastasiabeverlyhills.com/products/soft-glam-palette",
    active: false, // replaced — undertone never confirmed warm
  },
  {
    brand: "Natasha Denona",
    name: "Tan Eyeshadow Palette",
    shadeName: "Tan",
    category: "eyeshadow-palette",
    undertone: "warm",
    priceCents: 7200,
    currency: "usd",
    imageUrl:
      "https://natashadenona.com/cdn/shop/files/7290113706774_1.png?crop=center&height=2000&v=1779175568&width=2000",
    retailer: "Natasha Denona",
    productUrl: "https://natashadenona.com/products/tan-eyeshadow-palette",
    active: false, // replaced — redundant with "I Need a Warm" at the same price point
  },

  // ── Lips ───────────────────────────────────────────────────────────────
  {
    brand: "Milani",
    name: "Color Fetish Matte Lipstick",
    shadeName: "Pleasure",
    category: "lipstick",
    priceCents: 999,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_023b7fad-7475-4d11-8174-331c33ed96fd?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl: "https://www.target.com/p/milani-color-fetish-matte-lip-makeup-pleasure-0-14oz/-/A-83345891",
  },
  {
    brand: "Milani",
    name: "Color Fetish Matte Lipstick",
    shadeName: "Tease",
    category: "lipstick",
    priceCents: 999,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_d212eecb-b3cf-400c-8558-2b5f74e3923b?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl: "https://www.target.com/p/milani-color-fetish-matte-lip-makeup-tease-0-14oz/-/A-83345896",
  },
  {
    brand: "Milani",
    name: "Color Fetish Matte Lipstick",
    shadeName: "Sensual",
    category: "lipstick",
    priceCents: 999,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_f28a7906-ee28-466d-80dd-b1c44c5f181d?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl: "https://www.target.com/p/milani-color-fetish-matte-lip-makeup-sensual-0-14oz/-/A-83345893",
  },
  {
    brand: "Milani",
    name: "Color Fetish Matte Lipstick",
    shadeName: "Desire",
    category: "lipstick",
    priceCents: 999,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_02ef3924-281a-4319-8092-68148b7a9ee0?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl: "https://www.target.com/p/milani-color-fetish-matte-lip-makeup-desire-0-14oz/-/A-83345918",
  },
  {
    brand: "NYX Professional Makeup",
    name: "Butter Gloss Non-Sticky Lip Gloss",
    shadeName: "Praline",
    category: "lip gloss",
    priceCents: 600,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2268533",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/butter-gloss-non-sticky-lip-gloss-xlsImpprod5050009?sku=2268533",
  },
  {
    brand: "Maybelline",
    name: "Lifter Gloss with Hyaluronic Acid",
    shadeName: "Moon",
    category: "lip gloss",
    priceCents: 999,
    currency: "usd",
    imageUrl:
      "https://target.scene7.com/is/image/Target/GUEST_2b4ccd35-853c-450a-b351-32b6a23ab82e?wid=300&hei=300&fmt=pjpeg",
    retailer: "Target",
    productUrl:
      "https://www.target.com/p/maybelline-lifter-gloss-plumping-lip-gloss-with-hyaluronic-acid-3-moon-0-18-fl-oz/-/A-79543462",
  },
  {
    brand: "Fenty Beauty",
    name: "Gloss Bomb Universal Lip Luminizer",
    shadeName: "Fenty Glow",
    category: "lip gloss",
    priceCents: 2300,
    currency: "usd",
    imageUrl:
      "https://fentybeauty.com/cdn/shop/files/FB3006_PROD_GLOSS_BOMB_FENTY_GLOW_CLOSED_72_1.jpg?format=webp&v=1762198594",
    retailer: "Fenty Beauty",
    productUrl: "https://fentybeauty.com/products/gloss-bomb-universal-lip-luminizer-fenty-glow",
  },
  {
    brand: "MAC Cosmetics",
    name: "M·A·Cximal Silky Matte Lipstick",
    shadeName: "Velvet Teddy",
    category: "lipstick",
    priceCents: 2500,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2621406",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/macximal-silky-matte-lipstick-pimprod2043558?sku=2621406",
  },
  {
    brand: "MAC Cosmetics",
    name: "M·A·Cximal Silky Matte Lipstick",
    shadeName: "Warm Teddy",
    category: "lipstick",
    undertone: "warm", // Ulta's own description: "dirty warm nude"
    priceCents: 2500,
    currency: "usd",
    imageUrl: "https://media.ulta.com/i/ulta/2621436",
    retailer: "Ulta Beauty",
    productUrl: "https://www.ulta.com/p/macximal-silky-matte-lipstick-pimprod2043558?sku=2621436",
  },
  {
    brand: "Armani Beauty",
    name: "Lip Power Satin Long-Lasting Lipstick",
    shadeName: "108 - In Love",
    category: "lipstick",
    priceCents: 4500,
    currency: "usd",
    imageUrl:
      "https://assets-cf.armani.com/image/upload/f_auto,q_auto:best,ar_4:5,w_1536,c_fill/LC847700_NLP_108_F_FW2024.jpg",
    retailer: "Armani Beauty",
    productUrl:
      "https://www.armani.com/en-us/giorgio-armani/108-in-love-lip-power-satin-long-lasting-lipstick-cod-LC847700-NLP-108/",
  },
];
