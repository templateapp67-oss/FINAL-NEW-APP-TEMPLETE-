/**
 * PHASE 11.1 / 11.2 — HERO COPY (English / हिन्दी) for all five themes.
 *
 * Phase 11.1 established the per-theme hero LAYOUTS. Phase 11.2 owns the
 * hero CONTENT: the mandated headline, a unique short description, theme
 * specific CTA text, and supporting labels/badges naming each theme's real
 * service focus and target audience.
 *
 * Every theme owns a COMPLETELY separate hero namespace. Nothing is shared
 * between themes except the tiny `hero.*` common labels (rating / review
 * suffixes) whose meaning is identical everywhere.
 *
 * Owner-entered content always wins at render time (`siteHero.ts` resolves
 * `data.tagline` → headline and `data.about` → description), so this table is
 * the editable-content FALLBACK, not a hardcoded override.
 *
 * This file adds hero copy only. Phase 10.2 `siteI18n.ts` and Phase 10.3
 * `siteStructureI18n.ts` are untouched, so Language + Dark Mode behaviour is
 * unchanged. No database, service or theme-data architecture is affected.
 */
import type { AppLocale } from './locale';
import type { SiteHeaderThemeId } from './siteNavigation';

const COMMON_EN = {
  'hero.ratingSuffix': 'rating',
  'hero.reviewsSuffix': 'reviews',
  'hero.newStudio': 'Newly launched',
  'hero.locationPrefix': 'Visit us at',
  'hero.scrollHint': 'Scroll to explore',
};

const COMMON_HI: Record<keyof typeof COMMON_EN, string> = {
  'hero.ratingSuffix': 'रेटिंग',
  'hero.reviewsSuffix': 'समीक्षाएँ',
  'hero.newStudio': 'नया शुरू हुआ',
  'hero.locationPrefix': 'हमसे यहाँ मिलें',
  'hero.scrollHint': 'नीचे स्क्रॉल करें',
};

export interface HeroCopy {
  /** Small kicker above the headline — names the theme's audience. */
  eyebrow: string;
  /** Theme-specific headline (line 1) — never reused by another theme. */
  headline: string;
  /** Headline accent (line 2) rendered in the theme accent colour. */
  headlineAccent: string;
  /** Short hero description — unique per theme. */
  description: string;
  /** Primary CTA — always the Book Appointment entry point. */
  primaryCta: string;
  /** Secondary CTA — always the Explore Services entry point. */
  secondaryCta: string;
  /** Two theme-specific reassurance chips. */
  chip1: string;
  chip2: string;
  /**
   * PHASE 11.2 — the theme's service-focus badges. These name what the salon
   * actually does (Barber: Haircuts/Beard/Shave/Grooming, Hair Studio:
   * Haircuts/Color/Balayage/Treatments, etc.) and are rendered as badges in
   * each theme's own visual language.
   */
  focus: readonly string[];
  /** Label introducing the focus badge row. */
  focusLabel: string;
  /** Who the theme is for — one short audience line. */
  audience: string;
  /**
   * PHASE 11.3 — optional hero CTA labels. Each theme words its own Call /
   * WhatsApp / Gallery actions; they route through the existing contact and
   * navigation systems and are never shared between themes.
   */
  callCta: string;
  whatsAppCta: string;
  galleryCta: string;
  /** Label for the hero video control (play / watch the reel). */
  videoCta: string;
  /** Caption printed over / beside the hero media. */
  mediaEyebrow: string;
  mediaTitle: string;
  mediaBody: string;
  /** Alt text for the primary hero visual. */
  mediaAlt: string;
  /** Alt text for the supporting hero visuals. */
  mediaAltB: string;
  mediaAltC: string;
  /**
   * PHASE 11.5 — labels for the hero micro-stat. The VALUE is always derived
   * from real salon data (`heroStat()`); these are only the theme's wording.
   * No fabricated business metrics.
   */
  statServicesLabel: string;
  statTeamLabel: string;
}

type Table = Record<SiteHeaderThemeId, Record<AppLocale, HeroCopy>>;

const HERO_TEXT: Table = {
  /* ---------------------------------------------------------------- */
  /* 1. BARBER & MEN'S GROOMING                                       */
  /*    Focus: Haircuts · Beard · Shave · Men's Grooming              */
  /* ---------------------------------------------------------------- */
  barber_mens_grooming: {
    en: {
      eyebrow: "Est. 2016 · Men's Grooming Room",
      headline: 'Sharp Cuts. Classic Grooming.',
      headlineAccent: 'Modern Confidence.',
      description:
        'Skin fades, beard sculpting and hot-towel straight-razor shaves by barbers who trained on the clippers, not on a chair rental.',
      primaryCta: 'Book Your Cut',
      secondaryCta: 'See Grooming Menu',
      chip1: 'Walk-ins after 6 PM',
      chip2: 'Straight-razor certified',
      focus: ["Men's Haircuts", 'Beard Trim', 'Shave', 'Grooming Rituals'],
      focusLabel: 'What we do',
      audience: 'For men who want it done properly',
      callCta: 'Call the Shop',
      whatsAppCta: 'WhatsApp the Barber',
      galleryCta: 'See Cut Gallery',
      videoCta: 'Watch the Chair',
      mediaEyebrow: 'The chair',
      mediaTitle: 'Fade · Beard · Shave',
      mediaBody: 'Sixty focused minutes, finished with hot towel and tonic.',
      mediaAlt: 'Barber finishing a sharp skin fade',
      mediaAltB: 'Straight-razor hot towel shave',
      mediaAltC: 'Beard sculpting with vintage barber tools',
      statServicesLabel: 'Services on the board',
      statTeamLabel: 'Barbers on the floor',
    },
    hi: {
      eyebrow: 'स्थापित 2016 · मेन्स ग्रूमिंग रूम',
      headline: 'शार्प कट। क्लासिक ग्रूमिंग।',
      headlineAccent: 'मॉडर्न कॉन्फ़िडेंस।',
      description:
        'स्किन फेड, बियर्ड शेपिंग और हॉट-टॉवल स्ट्रेट-रेज़र शेव — ऐसे बार्बर से जिन्होंने क्लिपर पर असली ट्रेनिंग ली है।',
      primaryCta: 'अपना कट बुक करें',
      secondaryCta: 'ग्रूमिंग मेनू देखें',
      chip1: 'शाम 6 बजे के बाद वॉक-इन',
      chip2: 'स्ट्रेट-रेज़र सर्टिफ़ाइड',
      focus: ['मेन्स हेयरकट', 'बियर्ड ट्रिम', 'शेव', 'ग्रूमिंग रिचुअल'],
      focusLabel: 'हम क्या करते हैं',
      audience: 'उन पुरुषों के लिए जिन्हें परफ़ेक्ट काम चाहिए',
      callCta: 'शॉप पर कॉल करें',
      whatsAppCta: 'बार्बर को व्हाट्सऐप',
      galleryCta: 'कट गैलरी देखें',
      videoCta: 'चेयर का वीडियो देखें',
      mediaEyebrow: 'द चेयर',
      mediaTitle: 'फेड · बियर्ड · शेव',
      mediaBody: 'साठ मिनट का पूरा ध्यान, अंत में हॉट टॉवल और टॉनिक।',
      mediaAlt: 'बार्बर परफ़ेक्ट स्किन फेड पूरा करते हुए',
      mediaAltB: 'स्ट्रेट-रेज़र हॉट टॉवल शेव',
      mediaAltC: 'विंटेज टूल्स से बियर्ड शेपिंग',
      statServicesLabel: 'बोर्ड पर सेवाएँ',
      statTeamLabel: 'फ़्लोर पर बार्बर',
    },
  },

  /* ---------------------------------------------------------------- */
  /* 2. HAIR STUDIO & COLOR BAR                                       */
  /*    Focus: Haircuts · Color · Balayage · Treatments               */
  /* ---------------------------------------------------------------- */
  hair_studio_color_bar: {
    en: {
      eyebrow: 'Colour Bar · Precision Studio',
      headline: 'Luxury Hair. Signature Style.',
      headlineAccent: 'Beautifully You.',
      description:
        'Hand-painted balayage, custom colour formulas and bond-repair treatments — every service begins with a consultation at the colour bar.',
      primaryCta: 'Book a Colour Consultation',
      secondaryCta: 'View Colour Menu',
      chip1: 'Certified colour specialists',
      chip2: 'Consultation before every colour',
      focus: ['Cut & Styling', 'Colour', 'Balayage', 'Hair Treatments'],
      focusLabel: 'On the menu',
      audience: 'For clients who want colour done with intent',
      callCta: 'Call the Studio',
      whatsAppCta: 'WhatsApp the Colourist',
      galleryCta: 'View Colour Portfolio',
      videoCta: 'Play Studio Film',
      mediaEyebrow: 'Studio portfolio',
      mediaTitle: 'Balayage No. 04',
      mediaBody: 'Hand-painted dimension, toned and glossed to a glass finish.',
      mediaAlt: 'Editorial portrait of a fresh balayage finish',
      mediaAltB: 'Colour bar toning session in progress',
      mediaAltC: 'Precision cutting detail in the studio',
      statServicesLabel: 'Services on the menu',
      statTeamLabel: 'Stylists in the studio',
    },
    hi: {
      eyebrow: 'कलर बार · प्रिसिज़न स्टूडियो',
      headline: 'लक्ज़री हेयर। सिग्नेचर स्टाइल।',
      headlineAccent: 'ख़ूबसूरत आप।',
      description:
        'हाथ से पेंट किया बलायाज, कस्टम कलर फ़ॉर्मूले और बॉन्ड-रिपेयर ट्रीटमेंट — हर सर्विस कलर बार पर कंसल्टेशन से शुरू होती है।',
      primaryCta: 'कलर कंसल्टेशन बुक करें',
      secondaryCta: 'कलर मेनू देखें',
      chip1: 'सर्टिफ़ाइड कलर विशेषज्ञ',
      chip2: 'हर कलर से पहले कंसल्टेशन',
      focus: ['कट और स्टाइलिंग', 'कलर', 'बलायाज', 'हेयर ट्रीटमेंट'],
      focusLabel: 'मेनू में',
      audience: 'उनके लिए जो सोच-समझकर कलर कराना चाहते हैं',
      callCta: 'स्टूडियो को कॉल करें',
      whatsAppCta: 'कलरिस्ट को व्हाट्सऐप',
      galleryCta: 'कलर पोर्टफ़ोलियो देखें',
      videoCta: 'स्टूडियो फ़िल्म चलाएँ',
      mediaEyebrow: 'स्टूडियो पोर्टफ़ोलियो',
      mediaTitle: 'बलायाज नं. 04',
      mediaBody: 'हाथ से पेंट किया डाइमेंशन, टोन और ग्लॉस के साथ ग्लास जैसी फ़िनिश।',
      mediaAlt: 'ताज़ा बलायाज फ़िनिश का एडिटोरियल पोर्ट्रेट',
      mediaAltB: 'कलर बार पर टोनिंग सेशन',
      mediaAltC: 'स्टूडियो में प्रिसिज़न कटिंग डिटेल',
      statServicesLabel: 'मेनू में सेवाएँ',
      statTeamLabel: 'स्टूडियो में स्टाइलिस्ट',
    },
  },

  /* ---------------------------------------------------------------- */
  /* 3. BEAUTY, SKIN & SPA                                            */
  /*    Focus: Facial · Skin · Spa · Wellness · Makeup                */
  /* ---------------------------------------------------------------- */
  beauty_skin_spa: {
    en: {
      eyebrow: 'Skin · Spa · Wellness Sanctuary',
      headline: 'Relax. Refresh.',
      headlineAccent: 'Reveal Your Natural Glow.',
      description:
        'Slow facials, therapeutic massage and soft-glam makeup in a quiet, warmly lit sanctuary — every ritual paced to your skin, never to a clock.',
      primaryCta: 'Book a Spa Ritual',
      secondaryCta: 'Explore Treatments',
      chip1: 'Dermat-safe product lines',
      chip2: 'Single-use kits, every guest',
      focus: ['Facial', 'Skin Care', 'Spa', 'Wellness', 'Makeup'],
      focusLabel: 'Our rituals',
      audience: 'For anyone who needs an unhurried hour',
      callCta: 'Call the Spa',
      whatsAppCta: 'WhatsApp for Availability',
      galleryCta: 'Tour the Spa',
      videoCta: 'Watch a Ritual',
      mediaEyebrow: 'Signature ritual',
      mediaTitle: 'Hydra Glow Facial',
      mediaBody: '75 minutes of cleanse, steam, serum and slow lymphatic massage.',
      mediaAlt: 'Calm facial treatment in a softly lit spa room',
      mediaAltB: 'Warm oil massage therapy detail',
      mediaAltC: 'Spa botanicals and folded towels',
      statServicesLabel: 'Treatments available',
      statTeamLabel: 'Therapists on call',
    },
    hi: {
      eyebrow: 'स्किन · स्पा · वेलनेस सैंक्चुअरी',
      headline: 'आराम। ताज़गी।',
      headlineAccent: 'आपका प्राकृतिक निखार।',
      description:
        'धीमे फेशियल, थेरेपी मसाज और सॉफ़्ट-ग्लैम मेकअप — शांत, हल्की रोशनी वाले आश्रय में, घड़ी नहीं, आपकी त्वचा की रफ़्तार पर।',
      primaryCta: 'स्पा रिचुअल बुक करें',
      secondaryCta: 'ट्रीटमेंट देखें',
      chip1: 'डर्मेट-सेफ़ प्रोडक्ट',
      chip2: 'हर मेहमान के लिए सिंगल-यूज़ किट',
      focus: ['फेशियल', 'स्किन केयर', 'स्पा', 'वेलनेस', 'मेकअप'],
      focusLabel: 'हमारे रिचुअल',
      audience: 'उनके लिए जिन्हें एक इत्मीनान भरा घंटा चाहिए',
      callCta: 'स्पा को कॉल करें',
      whatsAppCta: 'उपलब्धता के लिए व्हाट्सऐप',
      galleryCta: 'स्पा देखें',
      videoCta: 'रिचुअल देखें',
      mediaEyebrow: 'सिग्नेचर रिचुअल',
      mediaTitle: 'हाइड्रा ग्लो फेशियल',
      mediaBody: '75 मिनट — क्लेंज़, स्टीम, सीरम और धीमी लिम्फ़ैटिक मसाज।',
      mediaAlt: 'हल्की रोशनी वाले स्पा रूम में शांत फेशियल',
      mediaAltB: 'गर्म तेल मसाज थेरेपी',
      mediaAltC: 'स्पा की जड़ी-बूटियाँ और तौलिए',
      statServicesLabel: 'उपलब्ध ट्रीटमेंट',
      statTeamLabel: 'उपलब्ध थेरेपिस्ट',
    },
  },

  /* ---------------------------------------------------------------- */
  /* 4. FULL-SERVICE FAMILY SALON                                     */
  /*    Focus: Men · Women · Kids · Haircare · Combos                 */
  /* ---------------------------------------------------------------- */
  family_full_service: {
    en: {
      eyebrow: 'Men · Women · Kids',
      headline: 'Beauty & Grooming for',
      headlineAccent: 'the Whole Family.',
      description:
        'Book three chairs in one slot, park the kids at the fun corner and walk out together — family combo packages keep the whole visit under one bill.',
      primaryCta: 'Book a Family Slot',
      secondaryCta: 'See Family Combos',
      chip1: 'Kids-friendly corner',
      chip2: 'Multi-person combo booking',
      focus: ['Men', 'Women', 'Kids', 'Haircare', 'Combos'],
      focusLabel: 'Everyone is welcome',
      audience: 'For families booking together, every weekend',
      callCta: 'Call the Salon',
      whatsAppCta: 'WhatsApp the Front Desk',
      galleryCta: 'See Family Photos',
      videoCta: 'Watch a Saturday',
      mediaEyebrow: 'Saturday at ours',
      mediaTitle: 'Three chairs, one slot',
      mediaBody: 'Parents and kids seated together — in and out in 90 minutes.',
      mediaAlt: 'Family enjoying a bright, friendly salon visit',
      mediaAltB: 'Child getting a gentle first haircut',
      mediaAltC: 'Stylist finishing a haircare blow-dry',
      statServicesLabel: 'Family services',
      statTeamLabel: 'Team members ready',
    },
    hi: {
      eyebrow: 'पुरुष · महिलाएँ · बच्चे',
      headline: 'पूरे परिवार के लिए',
      headlineAccent: 'ब्यूटी और ग्रूमिंग।',
      description:
        'एक ही स्लॉट में तीन चेयर बुक करें, बच्चों को फ़न कॉर्नर में बैठाएँ और साथ बाहर निकलें — फ़ैमिली कॉम्बो पैकेज से पूरी विज़िट एक ही बिल में।',
      primaryCta: 'फ़ैमिली स्लॉट बुक करें',
      secondaryCta: 'फ़ैमिली कॉम्बो देखें',
      chip1: 'बच्चों के लिए फ़न कॉर्नर',
      chip2: 'एक साथ कई लोगों की कॉम्बो बुकिंग',
      focus: ['पुरुष', 'महिलाएँ', 'बच्चे', 'हेयरकेयर', 'कॉम्बो'],
      focusLabel: 'सबका स्वागत है',
      audience: 'हर वीकेंड साथ बुकिंग करने वाले परिवारों के लिए',
      callCta: 'सैलून को कॉल करें',
      whatsAppCta: 'फ्रंट डेस्क को व्हाट्सऐप',
      galleryCta: 'फ़ैमिली फ़ोटो देखें',
      videoCta: 'शनिवार का वीडियो देखें',
      mediaEyebrow: 'हमारे यहाँ शनिवार',
      mediaTitle: 'तीन चेयर, एक स्लॉट',
      mediaBody: 'माता-पिता और बच्चे साथ — 90 मिनट में सब पूरा।',
      mediaAlt: 'परिवार रोशन और दोस्ताना सैलून विज़िट का आनंद लेते हुए',
      mediaAltB: 'बच्चे का पहला सौम्य हेयरकट',
      mediaAltC: 'स्टाइलिस्ट हेयरकेयर ब्लो-ड्राई पूरी करते हुए',
      statServicesLabel: 'फ़ैमिली सेवाएँ',
      statTeamLabel: 'तैयार टीम सदस्य',
    },
  },

  /* ---------------------------------------------------------------- */
  /* 5. NAIL & LASH STUDIO                                            */
  /*    Focus: Nail Art · Gel · Lash · Brow · Manicure/Pedicure       */
  /* ---------------------------------------------------------------- */
  nail_lash_studio: {
    en: {
      eyebrow: 'Nail Art · Lash · Brow Studio',
      headline: 'Nails, Lashes & Beauty',
      headlineAccent: 'Made to Stand Out.',
      description:
        'Chrome nail art, gel overlays, russian volume lashes and brows mapped to your face — a studio built for close-ups and camera flash.',
      primaryCta: 'Book Your Nail & Lash Set',
      secondaryCta: 'Browse the Art Wall',
      chip1: 'Gel sets last 3+ weeks',
      chip2: 'Sterilised, single-use tools',
      focus: ['Nail Art', 'Gel', 'Lash', 'Brow', 'Mani/Pedi'],
      focusLabel: 'Studio specialities',
      audience: 'For anyone whose hands and eyes get photographed',
      callCta: 'Call the Studio Desk',
      whatsAppCta: 'WhatsApp Your Inspo',
      galleryCta: 'Open the Art Wall',
      videoCta: 'Play the Set Reel',
      mediaEyebrow: 'This week',
      mediaTitle: 'Chrome Aura Set',
      mediaBody: 'Mirror chrome over a soft aura base, sealed with a gel gloss.',
      mediaAlt: 'Glossy chrome gel nail art set close up',
      mediaAltB: 'Russian volume lash detail',
      mediaAltC: 'Brow lamination finish',
      statServicesLabel: 'Studio services',
      statTeamLabel: 'Nail & lash artists',
    },
    hi: {
      eyebrow: 'नेल आर्ट · लैश · ब्रो स्टूडियो',
      headline: 'नेल्स, लैशेज़ और ब्यूटी',
      headlineAccent: 'जो अलग दिखे।',
      description:
        'क्रोम नेल आर्ट, जेल ओवरले, रशियन वॉल्यूम लैशेज़ और चेहरे के हिसाब से मैप की गई ब्रो — क्लोज़-अप और कैमरा फ़्लैश के लिए बना स्टूडियो।',
      primaryCta: 'नेल और लैश सेट बुक करें',
      secondaryCta: 'आर्ट वॉल देखें',
      chip1: 'जेल सेट 3+ हफ़्ते चलते हैं',
      chip2: 'स्टरलाइज़्ड, सिंगल-यूज़ टूल्स',
      focus: ['नेल आर्ट', 'जेल', 'लैश', 'ब्रो', 'मैनी/पेडी'],
      focusLabel: 'स्टूडियो की ख़ासियत',
      audience: 'उनके लिए जिनके हाथ और आँखें कैमरे में आती हैं',
      callCta: 'स्टूडियो डेस्क पर कॉल करें',
      whatsAppCta: 'अपना इंस्पो व्हाट्सऐप करें',
      galleryCta: 'आर्ट वॉल खोलें',
      videoCta: 'सेट रील चलाएँ',
      mediaEyebrow: 'इस हफ़्ते',
      mediaTitle: 'क्रोम ऑरा सेट',
      mediaBody: 'सॉफ़्ट ऑरा बेस पर मिरर क्रोम, जेल ग्लॉस से सील।',
      mediaAlt: 'चमकदार क्रोम जेल नेल आर्ट सेट का क्लोज़-अप',
      mediaAltB: 'रशियन वॉल्यूम लैश डिटेल',
      mediaAltC: 'ब्रो लैमिनेशन फ़िनिश',
      statServicesLabel: 'स्टूडियो सेवाएँ',
      statTeamLabel: 'नेल और लैश आर्टिस्ट',
    },
  },
};

/** Hero copy for one theme in the active locale (+ shared hero labels). */
export function heroText(
  themeId: SiteHeaderThemeId,
  locale: AppLocale,
): HeroCopy & Record<keyof typeof COMMON_EN, string> {
  const table = HERO_TEXT[themeId] || HERO_TEXT.barber_mens_grooming;
  const common = locale === 'hi' ? COMMON_HI : COMMON_EN;
  return { ...common, ...table[locale === 'hi' ? 'hi' : 'en'] };
}

export const HERO_TEXT_TABLE = HERO_TEXT;
