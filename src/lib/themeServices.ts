import type { SalonData } from '../types';

/**
 * Theme = the salon website template chosen in Step 2.
 *
 * `family-salon` is intentionally retained as a legacy storage id only. It is
 * never offered as a new choice; saved drafts are normalised to the new,
 * UI-only Full-Service Family Salon theme.
 */
export type ThemeId = Exclude<NonNullable<SalonData['templateId']>, 'family-salon'>;
export type LegacyThemeId = 'family-salon';
export type CatalogueThemeId = ThemeId | LegacyThemeId;

/** All currently selectable themes, in display order. */
export const THEME_IDS: ThemeId[] = [
  'hair',
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

/**
 * Normalises a saved `templateId` into a valid ThemeId.
 *
 * - `barber` is the legacy id for the Barber & Men's Grooming slot (now
 *   `barber_mens_grooming`).
 * - `hair-studio` is the legacy id for the Hair Studio & Color Bar slot (now
 *   `hair_studio_color_bar`).
 * - `wellness` is the legacy id for the Beauty, Skin & Spa slot (now
 *   `beauty_skin_spa`).
 * - `family-salon` is the old family slot and now resolves to
 *   `family_full_service`.
 *
 * Old drafts saved with legacy ids are mapped forward so nothing breaks,
 * while new data is always written with a canonical id.
 */
export function normalizeThemeId(id: string | undefined | null): ThemeId {
  if (id === 'barber') return 'barber_mens_grooming';
  if (id === 'hair-studio') return 'hair_studio_color_bar';
  if (id === 'wellness') return 'beauty_skin_spa';
  if (id === 'family-salon') return 'family_full_service';
  if (id && (THEME_IDS as string[]).includes(id)) return id as ThemeId;
  return 'hair';
}

export const THEME_LABELS: Record<ThemeId, string> = {
  hair: 'Hair & Unisex Salon',
  barber_mens_grooming: "Barber & Men's Grooming",
  hair_studio_color_bar: 'Hair Studio & Color Bar',
  beauty_skin_spa: 'Beauty, Skin & Spa',
  family_full_service: 'Full-Service Family Salon',
  nail_lash_studio: 'Nail & Lash Studio',
};

export interface PredefinedService {
  name: string;
  category: string;
  description: string;
  price: number;
  duration: number; // minutes
  /** Optional customer-facing label when a suggested name maps to a canonical service. */
  suggestedLabel?: string;
}

/**
 * Categories surfaced in the Add-Service dropdown, per theme.
 * Switching theme swaps the whole category set so the data stays relevant
 * to the type of salon the owner actually runs.
 */
export const THEME_CATEGORIES: Record<CatalogueThemeId, string[]> = {
  hair: ['Haircut', 'Styling', 'Color', 'Treatment', 'Makeup & Beauty'],
  barber_mens_grooming: ['Haircuts', 'Beard & Shave', 'Grooming & Treatments'],
  hair_studio_color_bar: ['Styling & Cuts', 'Hair Color', 'Treatments'],
  beauty_skin_spa: ['Facial & Skincare', 'Spa & Body', 'Waxing & Threading', 'Makeup'],
  family_full_service: ["Men's Services", "Women's Services", 'Kids Special', 'Combos'],
  nail_lash_studio: ['Nail Art & Gel', 'Pedicure & Manicure', 'Lash & Brow'],
  'family-salon': ['Hair', 'Beauty', 'Skin', 'Grooming', 'Spa', 'Kids'],
};

/**
 * Shared design tokens for the Barber & Men's Grooming theme.
 * Used by both TemplateRenderer (BarberTemplateRenderer) and PreviewPane so the
 * Dark Charcoal + Gold identity stays consistent everywhere it is rendered.
 */
export const BARBER_THEME = {
  id: 'barber_mens_grooming' as const,
  charcoal: '#141414',
  charcoalSoft: '#1d1d1d',
  charcoalCard: '#1a1a1a',
  gold: '#c9a227',
  goldBright: '#e8c95c',
  goldSoft: '#3a3016',
  cream: '#f5efe0',
  muted: '#a6a49b',
} as const;

/**
 * Shared design tokens for the Hair Studio & Color Bar theme.
 * Modern studio, minimalist monochrome + rose-gold, premium editorial.
 * Used by both TemplateRenderer (HairStudioTemplateRenderer) and PreviewPane.
 */
export const HAIR_STUDIO_THEME = {
  id: 'hair_studio_color_bar' as const,
  ink: '#191817',
  inkSoft: '#2a2826',
  paper: '#faf8f5',
  paperDeep: '#f1ede7',
  rose: '#b76e79',
  roseBright: '#d8a0a8',
  roseSoft: '#f4e5e7',
  roseDeep: '#9d5a63',
  line: '#e7e0d8',
  muted: '#8c8782',
} as const;

/**
 * Shared design tokens for the Beauty, Skin & Spa theme.
 * Soft pastel, emerald + beige accents, calm and serene premium wellness.
 * Used by both TemplateRenderer (BeautySpaTemplateRenderer) and PreviewPane.
 */
export const BEAUTY_SPA_THEME = {
  id: 'beauty_skin_spa' as const,
  emerald: '#1e7a63',
  emeraldDeep: '#15594a',
  emeraldMid: '#4aa88f',
  emeraldSoft: '#e2f0ea',
  beige: '#ece4d6',
  beigeSoft: '#f7f1e8',
  cream: '#fbf9f5',
  blush: '#f6ece9',
  sage: '#eef2e9',
  text: '#27403a',
  muted: '#72837c',
  line: '#ece6dc',
} as const;

/**
 * Shared visual tokens for the Full-Service Family Salon UI.
 *
 * This theme is deliberately a bright, high-density system: cobalt navigation,
 * sky surfaces, teal actions, and a small sunny-yellow highlight for kid-first
 * moments. The family service catalogue is maintained separately below.
 */
export const FAMILY_FULL_SERVICE_THEME = {
  id: 'family_full_service' as const,
  navy: '#12385b',
  blue: '#1769d2',
  blueBright: '#2f8cff',
  sky: '#eaf6ff',
  skyDeep: '#cdeaff',
  teal: '#079f9a',
  tealDeep: '#087a78',
  tealSoft: '#d9f5f1',
  sun: '#ffd166',
  sunSoft: '#fff4cf',
  coral: '#ff7b67',
  ink: '#15324b',
  muted: '#5d7387',
  line: '#dcebf4',
  white: '#ffffff',
} as const;

/** Shared visual tokens for the Nail & Lash Studio UI. */
export const NAIL_LASH_STUDIO_THEME = {
  id: 'nail_lash_studio' as const,
  ink: '#211b24',
  inkSoft: '#3a2a37',
  pink: '#ff2d8d',
  pinkDeep: '#d70f68',
  pinkGlow: '#ff79b7',
  pinkSoft: '#ffe5f1',
  sand: '#f7eee8',
  sandDeep: '#e5cfc4',
  nude: '#c89f91',
  nudeSoft: '#f1dfd7',
  cream: '#fffaf7',
  muted: '#806c74',
  line: '#eadbd5',
  white: '#ffffff',
} as const;

/**
 * The full, professionally-curated service catalogue for each theme.
 * Existing theme entries remain unchanged; family_full_service and
 * nail_lash_studio blocks are maintained as their own theme datasets.
 */
export const SERVICES_BY_THEME: Record<CatalogueThemeId, PredefinedService[]> = {
  hair: [
    // Haircut
    { name: "Women's Haircut & Blow-Dry", category: 'Haircut', description: 'Precision cut tailored to your face shape, finished with a professional wash and blow-dry.', price: 450, duration: 45 },
    { name: "Men's Haircut", category: 'Haircut', description: 'Classic or contemporary men’s cut with expert scissor and clipper work.', price: 350, duration: 30 },
    { name: 'Kids Haircut (12 & under)', category: 'Haircut', description: 'Gentle, friendly haircut for children in a comfortable setting.', price: 250, duration: 30 },
    { name: 'Layer Cut & Texturising', category: 'Haircut', description: 'Customised layers and texturising for movement, volume and shape.', price: 550, duration: 50 },
    { name: 'Haircut with Wash & Style', category: 'Haircut', description: 'Relaxing shampoo, precision cut and styled blow-dry finish.', price: 500, duration: 50 },

    // Styling
    { name: 'Blow-Dry & Styling', category: 'Styling', description: 'Salon-perfect blow-dry with volume, smooth or curly finish.', price: 350, duration: 30 },
    { name: 'Hair Straightening (Rebonding)', category: 'Styling', description: 'Long-lasting permanent straightening for sleek, frizz-free hair.', price: 2500, duration: 120 },
    { name: 'Party & Event Hairstyling', category: 'Styling', description: 'Updos, curls and glam styles for parties, functions and shoots.', price: 1200, duration: 60 },
    { name: 'Curling & Waves', category: 'Styling', description: 'Soft beach waves or defined curls styled to suit the occasion.', price: 600, duration: 45 },
    { name: 'Hair Crimping & Styling', category: 'Styling', description: 'Trendy crimped texture and finishing for a bold statement look.', price: 500, duration: 40 },

    // Color
    { name: 'Root Touch-Up', category: 'Color', description: 'Seamless grey coverage and root refresh with ammonia-free colour.', price: 900, duration: 60 },
    { name: 'Global Hair Colour', category: 'Color', description: 'Full-head colour transformation in rich, even, long-lasting tones.', price: 2200, duration: 120 },
    { name: 'Balayage Highlights', category: 'Color', description: 'Hand-painted freeform highlights for natural, sun-kissed dimension.', price: 3500, duration: 150 },
    { name: 'Ombre Colour', category: 'Color', description: 'Soft shadow-root to tip gradient for a modern, low-maintenance look.', price: 3000, duration: 150 },
    { name: 'Hair Gloss & Toner', category: 'Color', description: 'Demi-permanent gloss to boost shine, tone and colour vibrancy.', price: 800, duration: 45 },

    // Treatment
    { name: 'Hair Spa (Deep Conditioning)', category: 'Treatment', description: 'Deep-nourishing spa with scalp massage to restore moisture and shine.', price: 1000, duration: 60 },
    { name: 'Keratin Smoothing Treatment', category: 'Treatment', description: 'Frizz-eliminating keratin therapy for silky, manageable hair.', price: 4500, duration: 150 },
    { name: 'Botox Hair Treatment', category: 'Treatment', description: 'Reconstructive filler treatment that revives damaged, brittle hair.', price: 3800, duration: 120 },
    { name: 'Scalp Detox Treatment', category: 'Treatment', description: 'Exfoliating botanical scalp detox for a healthy, balanced root.', price: 1200, duration: 45 },
    { name: 'Protein Hair Treatment', category: 'Treatment', description: 'Strengthening protein boost to reduce breakage and add body.', price: 1500, duration: 60 },

    // Makeup & Beauty
    { name: 'Party Makeup', category: 'Makeup & Beauty', description: 'Camera-ready makeup for parties, dinners and celebrations.', price: 2500, duration: 90 },
    { name: 'Bridal Makeup (HD)', category: 'Makeup & Beauty', description: 'Flawless HD bridal look with skin prep, lashes and draping.', price: 8000, duration: 180 },
    { name: 'Engagement Makeup', category: 'Makeup & Beauty', description: 'Elegant makeup for pre-wedding functions and engagements.', price: 4500, duration: 120 },
    { name: 'Eyebrow Threading & Shaping', category: 'Makeup & Beauty', description: 'Precise threading to define and shape your brows.', price: 150, duration: 15 },
    { name: 'Arms & Underarms Waxing', category: 'Makeup & Beauty', description: 'Smooth, hygienic waxing for arms and underarms with soothing aftercare.', price: 500, duration: 40 },
  ],

  barber_mens_grooming: [
    // Haircuts
    { name: 'Skin Fade', category: 'Haircuts', description: 'Precision skin fade blended seamlessly from skin to your preferred length on top.', price: 450, duration: 45 },
    { name: 'Scissors Cut', category: 'Haircuts', description: 'Classic scissor-over-comb cut tailored to your hair type and face shape.', price: 400, duration: 40 },
    { name: 'Buzz Cut', category: 'Haircuts', description: 'Clean, uniform clipper cut for a low-maintenance, sharp look.', price: 250, duration: 20 },
    { name: 'Taper Fade', category: 'Haircuts', description: 'Gradual taper fade with a crisp neckline and clean, sharp finish.', price: 400, duration: 40 },
    { name: 'Kids Barbering', category: 'Haircuts', description: 'Patient, friendly haircut for boys with a fun, fuss-free finish.', price: 250, duration: 25 },
    { name: 'Head Shave', category: 'Haircuts', description: 'Smooth head shave with hot-towel prep and soothing aftercare.', price: 300, duration: 25 },

    // Beard & Shave
    { name: 'Beard Sculpting & Lineup', category: 'Beard & Shave', description: 'Detailed beard sculpting with a sharp line-up, hot towel and beard oil finish.', price: 350, duration: 30 },
    { name: 'Hot Towel Classic Shave', category: 'Beard & Shave', description: 'Traditional straight-razor shave with hot towels and a cooling balm.', price: 400, duration: 35 },
    { name: 'Beard Trim & Lineup', category: 'Beard & Shave', description: 'Precision beard trim with crisp cheek and neck line-up.', price: 250, duration: 20 },
    { name: 'Moustache Styling', category: 'Beard & Shave', description: 'Moustache trim, shape and styling with premium wax.', price: 150, duration: 15 },
    { name: 'Beard Color/Coverup', category: 'Beard & Shave', description: 'Natural-looking beard colour to cover greys and deepen tone.', price: 450, duration: 30 },

    // Grooming & Treatments
    { name: 'Charcoal Face Detox', category: 'Grooming & Treatments', description: 'Deep-cleansing charcoal facial to unclog pores and refresh tired skin.', price: 800, duration: 40 },
    { name: 'Scalp & Head Massage', category: 'Grooming & Treatments', description: 'Therapeutic scalp massage to relieve tension and boost circulation.', price: 600, duration: 30 },
    { name: 'Executive Beard & Hair Combo', category: 'Grooming & Treatments', description: 'Signature haircut plus sculpted beard and styling finish in one sitting.', price: 700, duration: 60 },
    { name: 'Hair Loss Scalp Therapy', category: 'Grooming & Treatments', description: 'Targeted scalp therapy to strengthen roots and reduce hair fall.', price: 1200, duration: 45 },
  ],

  beauty_skin_spa: [
    // Facial & Skincare
    { name: 'HydraFacial', category: 'Facial & Skincare', description: 'Multi-step hydradermabrasion facial that deeply cleanses, hydrates and plumps for instant glow.', price: 2800, duration: 60 },
    { name: 'Anti-Aging Gold Facial', category: 'Facial & Skincare', description: 'Luxurious 24K gold facial that firms, brightens and reduces the appearance of fine lines.', price: 2400, duration: 60 },
    { name: 'Deep Cleansing Cleanup', category: 'Facial & Skincare', description: 'Thorough cleanse with steam, gentle extraction and a soothing mask for clear, fresh skin.', price: 1200, duration: 45 },
    { name: 'De-Tan Brightening', category: 'Facial & Skincare', description: 'Brightening de-tan treatment to reverse sun damage and restore an even, radiant complexion.', price: 1600, duration: 45 },
    { name: 'Organic Glow Treatment', category: 'Facial & Skincare', description: 'Plant-based glow facial with botanical actives for a natural, healthy luminosity.', price: 1800, duration: 60 },

    // Spa & Body
    { name: 'Swedish Body Massage', category: 'Spa & Body', description: 'Gentle, flowing full-body massage that eases tension and promotes deep relaxation.', price: 2200, duration: 60 },
    { name: 'Deep Tissue Massage', category: 'Spa & Body', description: 'Firm, targeted pressure to release knots and chronic muscle tightness.', price: 2800, duration: 60 },
    { name: 'Aromatherapy', category: 'Spa & Body', description: 'Soothing essential-oil massage chosen to balance mood, body and skin.', price: 2400, duration: 60 },
    { name: 'Foot Reflexology', category: 'Spa & Body', description: 'Pressure-point therapy on the feet to relieve stress and restore overall wellbeing.', price: 1200, duration: 45 },
    { name: 'Back Spa', category: 'Spa & Body', description: 'Deep-cleansing back treatment with exfoliation, extraction and a relaxing massage.', price: 1800, duration: 45 },

    // Waxing & Threading
    { name: 'Eyebrow & Upper Lip Threading', category: 'Waxing & Threading', description: 'Precise threading to shape your brows and smooth the upper lip with clean definition.', price: 150, duration: 15 },
    { name: 'Full Body Waxing', category: 'Waxing & Threading', description: 'Complete body waxing — arms, legs, underarms and bikini line with soothing aftercare.', price: 2200, duration: 90 },
    { name: 'Rica Waxing', category: 'Waxing & Threading', description: 'Premium Rica wax treatment, gentle on sensitive skin with long-lasting smoothness.', price: 1800, duration: 60 },
    { name: 'Bikini Wax', category: 'Waxing & Threading', description: 'Hygienic, comfortable bikini-line waxing in a private, relaxing setting.', price: 900, duration: 30 },

    // Makeup
    { name: 'Bridal Makeup', category: 'Makeup', description: 'Flawless, long-lasting bridal look with skin prep, lashes and finishing touches for your big day.', price: 9000, duration: 150 },
    { name: 'Party Makeup', category: 'Makeup', description: 'Camera-ready makeup for parties, dinners and celebrations with a polished finish.', price: 3000, duration: 75 },
    { name: 'Airbrush Makeup', category: 'Makeup', description: 'Featherlight, high-definition airbrush makeup for a flawless, weightless finish.', price: 4500, duration: 90 },
    { name: 'Pre-Bridal Skin Care', category: 'Makeup', description: 'A pre-wedding skincare ritual of facials and treatments for radiant, camera-ready skin.', price: 6000, duration: 120 },
  ],

  hair_studio_color_bar: [
    // Styling & Cuts
    { name: 'Signature Cut & Blowdry', category: 'Styling & Cuts', description: 'A precision signature cut shaped to your face and finished with a glossy editorial blowdry.', price: 1800, duration: 60 },
    { name: 'Layered Cut', category: 'Styling & Cuts', description: 'Face-framing layers cut dry for movement, volume and a soft, lived-in finish.', price: 2000, duration: 60 },
    { name: 'Bob/Pixie Precision Cut', category: 'Styling & Cuts', description: 'Architectural bob or pixie with razor-sharp lines and weight distribution tailored to you.', price: 2200, duration: 65 },
    { name: 'Luxury Blowout', category: 'Styling & Cuts', description: 'Round-brush blowout with salon-grade finishing for bounce, shine and lasting hold.', price: 1200, duration: 40 },
    { name: 'Hollywood Waves', category: 'Styling & Cuts', description: 'Old-Hollywood sculpted waves with glossy, red-carpet finish.', price: 1600, duration: 45 },
    { name: 'Hair Setting', category: 'Styling & Cuts', description: 'Classic roller or pin-curl setting for soft, structured volume and defined texture.', price: 900, duration: 40 },

    // Hair Color
    { name: 'Balayage / Ombre', category: 'Hair Color', description: 'Hand-painted, sun-kissed balayage or a soft shadow-root ombre — both low-maintenance and dimensional.', price: 5500, duration: 180 },
    { name: 'Global Hair Color', category: 'Hair Color', description: 'Rich, all-over colour transformation in an even, glossy, long-lasting tone.', price: 3500, duration: 120 },
    { name: 'Root Touch-Up', category: 'Hair Color', description: 'Seamless root refresh and grey coverage blended into your existing shade.', price: 1500, duration: 60 },
    { name: 'Highlights & Lowlights', category: 'Hair Color', description: 'Multi-tonal foiling that adds depth, dimension and brightness through the lengths.', price: 4200, duration: 150 },
    { name: 'Gloss & Tone Treatment', category: 'Hair Color', description: 'Demi-permanent gloss to neutralise brass, refine tone and add glass-like shine.', price: 1800, duration: 45 },
    { name: 'Fashion Color', category: 'Hair Color', description: 'Bold pastels, vivids and creative colour placements — a true statement look.', price: 6000, duration: 200 },

    // Treatments
    { name: 'Keratin Restoration', category: 'Treatments', description: 'Intensive keratin infusion that rebuilds strength, smooths frizz and restores elasticity.', price: 4500, duration: 120 },
    { name: 'Hair Botox Treatment', category: 'Treatments', description: 'Deep-filler treatment that plumps each strand for silky, youthful, glass-finish hair.', price: 4000, duration: 90 },
    { name: 'Smoothening / Rebonding', category: 'Treatments', description: 'Permanent straightening with thermal reconditioning for sleek, frizz-free lengths.', price: 5000, duration: 180 },
    { name: 'Scalp Detox Spa', category: 'Treatments', description: 'Exfoliating scalp ritual with steam, massage and a balancing botanical mask.', price: 2200, duration: 60 },
    { name: 'Olaplex Bond Repair', category: 'Treatments', description: 'Patented bond-building therapy that relinks broken bonds for stronger, healthier hair.', price: 3500, duration: 60 },
  ],

  family_full_service: [
    // Men's Services
    { name: 'Classic Haircut', category: "Men's Services", description: 'A polished classic cut with scissor and clipper detailing, wash and finish.', price: 350, duration: 35 },
    { name: 'Beard Trim', category: "Men's Services", description: 'Precision beard shaping with a clean line-up, warm towel and conditioning finish.', price: 250, duration: 25 },
    { name: 'Hair Color', category: "Men's Services", description: 'A rich, even colour refresh with consultation and scalp-safe application.', price: 1200, duration: 75 },
    { name: 'Head Massage', category: "Men's Services", description: 'A relaxing scalp and head massage to release tension and leave you refreshed.', price: 500, duration: 30 },

    // Women's Services
    { name: 'Haircut & Blowdry', category: "Women's Services", description: 'A tailored haircut finished with a smooth, bouncy salon blowdry.', price: 650, duration: 55 },
    { name: 'Hair Spa', category: "Women's Services", description: 'Deep conditioning, warm steam and a restorative scalp massage for softer, shinier hair.', price: 1000, duration: 60 },
    { name: 'Threading', category: "Women's Services", description: 'Gentle, precise facial threading for clean brows and a polished finish.', price: 150, duration: 20 },
    { name: 'Root Touch-Up', category: "Women's Services", description: 'Seamless grey coverage and root refresh blended into your existing colour.', price: 900, duration: 60 },
    { name: 'Facial', category: "Women's Services", description: 'A deep-cleansing facial with steam, gentle extraction and a soothing mask for fresh, glowing skin.', price: 850, duration: 50 },

    // Kids Special
    { name: 'Kids Haircut', category: 'Kids Special', description: 'A gentle, friendly haircut designed for a comfortable and fuss-free kids visit.', price: 250, duration: 25 },
    { name: 'Creative Styling', category: 'Kids Special', description: 'Fun braids, clips and creative styling for parties, photos and special days.', price: 450, duration: 35 },
    { name: 'Baby Hair Cut (Mundan/Trim)', category: 'Kids Special', description: 'A patient, hygienic first haircut or trim with extra care for little guests.', price: 300, duration: 30 },

    // Combos
    { name: 'Family Haircare Package', category: 'Combos', description: 'A convenient family visit combining haircare moments for everyone under one roof.', price: 1800, duration: 120 },
    { name: 'Couple Pamper Combo', category: 'Combos', description: 'A shared salon break with coordinated grooming and relaxation for two.', price: 1500, duration: 90 },
    { name: 'Express Grooming', category: 'Combos', description: 'A quick, polished grooming refresh for busy days and last-minute plans.', price: 700, duration: 45 },
  ],

  nail_lash_studio: [
    // Nail Art & Gel
    { name: 'Gel Polish Overlay', category: 'Nail Art & Gel', description: 'A sheer or statement gel colour layered over your natural nails for a smooth, chip-resistant glass finish.', price: 900, duration: 60 },
    { name: 'Acrylic Nail Extensions', category: 'Nail Art & Gel', description: 'Custom sculpted acrylic extensions shaped to your preferred length, profile and finish.', price: 1800, duration: 120 },
    { name: 'Chrome Nail Art', category: 'Nail Art & Gel', description: 'Reflective chrome pigment and precision detailing for a high-shine, camera-ready nail look.', price: 1400, duration: 90 },
    { name: 'French Manicure', category: 'Nail Art & Gel', description: 'A timeless sheer base and clean French tip, finished with a glossy salon seal.', price: 750, duration: 60 },
    { name: 'Nail Removal & Repair', category: 'Nail Art & Gel', description: 'Safe product removal, gentle repair and restorative prep before your next set.', price: 500, duration: 45 },

    // Pedicure & Manicure
    { name: 'Luxury Spa Pedicure', category: 'Pedicure & Manicure', description: 'Soak, exfoliation, cuticle care, massage and polish for completely refreshed feet.', price: 1200, duration: 75 },
    { name: 'Ice Cream Manicure', category: 'Pedicure & Manicure', description: 'A playful, creamy manicure ritual with softening care, massage and a sweet glossy finish.', price: 850, duration: 60 },
    { name: 'Cuticle Care & Polish', category: 'Pedicure & Manicure', description: 'Neat cuticle care, natural nail shaping and your choice of polished colour.', price: 550, duration: 40 },
    { name: 'Paraffin Wax Care', category: 'Pedicure & Manicure', description: 'Warm paraffin treatment to deeply soften dry hands or feet after your care ritual.', price: 650, duration: 35 },

    // Lash & Brow
    { name: 'Eyelash Extensions (Classic/Volume)', category: 'Lash & Brow', description: 'Lightweight, customised lash extensions ranging from clean classic definition to soft volume.', price: 2200, duration: 120 },
    { name: 'Lash Lift & Tint', category: 'Lash & Brow', description: 'A lifted, curled and tinted lash look that opens the eyes without extensions.', price: 1500, duration: 75 },
    { name: 'Microblading', category: 'Lash & Brow', description: 'Fine, hair-like brow strokes mapped to your features for a naturally fuller arch.', price: 4500, duration: 150 },
    { name: 'Brow Lamination', category: 'Lash & Brow', description: 'Smooth, set and softly lifted brows with a clean brushed-up finish.', price: 1000, duration: 60 },
  ],

  'family-salon': [
    // Hair
    { name: "Women's Cut & Style", category: 'Hair', description: 'Flattering cut shaped to your face, finished with a relaxing wash and blow-dry.', price: 400, duration: 45 },
    { name: "Men's Classic Cut", category: 'Hair', description: 'Sharp scissor-and-clipper cut with neck clean-up and styling product finish.', price: 300, duration: 30 },
    { name: 'Kids Fun Cut (under 12)', category: 'Hair', description: 'Gentle, friendly haircut in a kid-approved chair with a little surprise at the end.', price: 200, duration: 25 },
    { name: 'Root Touch-Up Colour', category: 'Hair', description: 'Quick grey coverage or root refresh in under an hour with gentle formula.', price: 800, duration: 50 },
    { name: 'Global Hair Colour', category: 'Hair', description: 'All-over rich colour transformation with pre-colour scalp protection.', price: 2000, duration: 100 },
    { name: 'Blow-Dry & Style', category: 'Hair', description: 'Bouncy blow-dry with volume for a polished everyday look.', price: 300, duration: 30 },

    // Beauty
    { name: 'Party Makeup', category: 'Beauty', description: 'Camera-ready makeup for birthdays, dinners and celebrations.', price: 1800, duration: 75 },
    { name: 'Bridal Makeup HD', category: 'Beauty', description: 'Flawless high-definition bridal look with airbrush finish and lashes.', price: 7000, duration: 150 },
    { name: 'Eyebrow Threading', category: 'Beauty', description: 'Precision brow shaping to frame your face perfectly.', price: 100, duration: 15 },
    { name: 'Upper Lip Threading', category: 'Beauty', description: 'Quick, hygienic upper lip threading.', price: 50, duration: 10 },
    { name: 'Saree Draping', category: 'Beauty', description: 'Expert saree draping for weddings, parties and festive occasions.', price: 500, duration: 30 },

    // Skin
    { name: 'Clean-Up Facial', category: 'Skin', description: 'Basic deep-cleansing facial with steam, extraction and soothing mask.', price: 600, duration: 45 },
    { name: 'Glow Facial', category: 'Skin', description: 'Vitamin C brightening facial for instant radiance and even skin tone.', price: 1200, duration: 60 },
    { name: 'Anti-Tan Pack', category: 'Skin', description: 'De-tan treatment to reverse sun damage and restore natural complexion.', price: 800, duration: 40 },
    { name: 'Full Body Waxing', category: 'Skin', description: 'Complete body waxing — arms, legs, underarms and bikini line with soothing gel.', price: 1800, duration: 90 },

    // Grooming
    { name: 'Beard Trim & Shape', category: 'Grooming', description: 'Precision beard styling with hot-towel prep and beard oil finish.', price: 200, duration: 20 },
    { name: 'Clean Shave Experience', category: 'Grooming', description: 'Luxurious straight-razor shave with pre-shave oil, hot towel and cooling balm.', price: 350, duration: 30 },
    { name: "Men's Facial", category: 'Grooming', description: 'Deep-cleansing facial designed for men’s thicker skin with charcoal detox.', price: 700, duration: 45 },
    { name: 'Haircut + Beard Combo', category: 'Grooming', description: 'Complete grooming: fresh haircut paired with a precision beard trim.', price: 450, duration: 50 },

    // Spa
    { name: 'Head & Shoulder Massage', category: 'Spa', description: 'Tension-melting massage for scalp, neck and shoulders with warm oil.', price: 600, duration: 30 },
    { name: 'Foot Reflexology', category: 'Spa', description: 'Pressure-point foot massage to relieve stress and boost circulation.', price: 700, duration: 40 },
    { name: 'Body Massage', category: 'Spa', description: 'Full-body relaxation massage with aromatic oils to ease tired muscles.', price: 1500, duration: 60 },
    { name: 'De-Stress Spa Combo', category: 'Spa', description: 'Head massage + foot reflexology + mini facial for total rejuvenation.', price: 1800, duration: 90 },

    // Kids
    { name: 'Kids Haircut (Girls)', category: 'Kids', description: 'Sweet, gentle haircut for little girls with a fun clip or bow.', price: 200, duration: 25 },
    { name: 'Kids Haircut (Boys)', category: 'Kids', description: 'Cool kids cut with clippers or scissors — quick and fuss-free.', price: 200, duration: 20 },
    { name: 'Mommy & Me Package', category: 'Kids', description: 'Matching blow-dry styles for mom and daughter — a fun bonding experience.', price: 900, duration: 60 },
    { name: 'Teen Glow Facial', category: 'Kids', description: 'Gentle teen-friendly facial for clear, fresh skin — ages 13 to 18.', price: 500, duration: 40 },
  ],
};

/**
 * Curated "Suggested Services" shown at the top of the step, per theme.
 * A hand-picked, theme-appropriate starter set so owners can one-click add
 * the most relevant services for their salon type.
 */
export const SUGGESTED_SERVICE_NAMES: Record<CatalogueThemeId, string[]> = {
  hair: [
    "Women's Haircut & Blow-Dry",
    'Global Hair Colour',
    'Balayage Highlights',
    'Keratin Smoothing Treatment',
    'Hair Spa (Deep Conditioning)',
    'Bridal Makeup (HD)',
    'Party & Event Hairstyling',
  ],
  barber_mens_grooming: [
    'Skin Fade',
    'Beard Sculpting',
    'Hot Towel Shave',
    'Hair & Beard Combo',
    'Head Shave',
    'Charcoal Face Mask',
  ],
  hair_studio_color_bar: [
    'Signature Haircut',
    'Luxury Blowout',
    'Balayage',
    'Global Hair Color',
    'Hair Botox Treatment',
    'Olaplex Bond Repair',
  ],
  beauty_skin_spa: [
    'HydraFacial',
    'Deep Cleansing Cleanup',
    'Full Body Waxing',
    'Swedish Body Massage',
    'De-Tan Pack',
    'Bridal Makeup',
  ],
  family_full_service: [
    'Classic Haircut',
    'Haircut & Blowdry',
    'Beard Trim',
    'Hair Spa',
    'Deep Cleansing Facial',
    'Kids Haircut',
  ],
  nail_lash_studio: [
    'Acrylic Extensions',
    'Gel Polish Overlay',
    'Luxury Spa Pedicure',
    'Classic Lash Extensions',
    'Nail Art Per Nail',
    'Brow Lamination',
  ],
  'family-salon': [
    "Women's Cut & Style",
    "Men's Classic Cut",
    'Kids Fun Cut (under 12)',
    'Party Makeup',
    'Glow Facial',
    'Haircut + Beard Combo',
    'De-Stress Spa Combo',
  ],
};

/**
 * Display-name → catalogue-name aliases for suggested services.
 * The Barber theme's suggested chips use short customer-facing labels
 * (e.g. "Beard Sculpting") while the catalogue stores the fuller name
 * (e.g. "Beard Sculpting & Lineup"). This maps them together so one-click
 * "Add Selected" always resolves to a real, fully-described service.
 */
export const SUGGESTED_SERVICE_ALIASES: Partial<Record<CatalogueThemeId, Record<string, string>>> = {
  barber_mens_grooming: {
    'Beard Sculpting': 'Beard Sculpting & Lineup',
    'Hot Towel Shave': 'Hot Towel Classic Shave',
    'Hair & Beard Combo': 'Executive Beard & Hair Combo',
    'Charcoal Face Mask': 'Charcoal Face Detox',
  },
  hair_studio_color_bar: {
    'Signature Haircut': 'Signature Cut & Blowdry',
    'Balayage': 'Balayage / Ombre',
  },
  beauty_skin_spa: {
    'De-Tan Pack': 'De-Tan Brightening',
  },
  family_full_service: {
    'Deep Cleansing Facial': 'Facial',
  },
  nail_lash_studio: {
    'Acrylic Extensions': 'Acrylic Nail Extensions',
    'Classic Lash Extensions': 'Eyelash Extensions (Classic/Volume)',
    'Nail Art Per Nail': 'Chrome Nail Art',
  },
};

/** Returns the categories available to the service editor for a theme. */
export function getThemeCategories(theme: ThemeId): string[] {
  return THEME_CATEGORIES[theme as CatalogueThemeId] || [];
}

/** Returns the curated suggested services for a theme (resolved from the catalogue). */
export function getSuggestedServices(theme: ThemeId): PredefinedService[] {
  const catalogueTheme = theme as CatalogueThemeId;
  const all = SERVICES_BY_THEME[catalogueTheme] || [];
  const aliases = SUGGESTED_SERVICE_ALIASES[catalogueTheme] || {};
  return (SUGGESTED_SERVICE_NAMES[catalogueTheme] || [])
    .map((suggestedName) => {
      const resolved = all.find((service) => service.name === suggestedName)
        || all.find((service) => service.name === aliases[suggestedName]);
      if (!resolved) return undefined;
      // Keep the requested customer-facing chip label while adding the
      // canonical predefined service behind it (e.g. Acrylic Extensions →
      // Acrylic Nail Extensions).
      return (theme === 'family_full_service' || theme === 'nail_lash_studio') && resolved.name !== suggestedName
        ? { ...resolved, suggestedLabel: suggestedName }
        : resolved;
    })
    .filter((s): s is PredefinedService => Boolean(s));
}

/** All predefined services that belong to a given theme + category. */
export function getServicesForThemeCategory(theme: ThemeId, category: string): PredefinedService[] {
  return (SERVICES_BY_THEME[theme as CatalogueThemeId] || []).filter((s) => s.category === category);
}

/** Case-insensitive lookup of a predefined service by name within a theme. */
export function findPredefinedService(theme: ThemeId, name: string): PredefinedService | undefined {
  const q = name.trim().toLowerCase();
  const all = SERVICES_BY_THEME[theme as CatalogueThemeId] || [];
  const directMatch = all.find((service) => service.name.toLowerCase() === q);
  if (directMatch || (theme !== 'family_full_service' && theme !== 'nail_lash_studio')) return directMatch;

  const suggestedName = Object.entries(SUGGESTED_SERVICE_ALIASES[theme] || {})
    .find(([displayName]) => displayName.toLowerCase() === q)?.[1];
  return suggestedName ? all.find((service) => service.name.toLowerCase() === suggestedName.toLowerCase()) : undefined;
}

/** Theme-aware "Suggest with AI" starter services. */
export const AI_SUGGESTION_NAMES: Record<Exclude<CatalogueThemeId, 'family_full_service' | 'nail_lash_studio'>, [string, string]> = {
  hair: ['Keratin Smoothing Treatment', 'Balayage Highlights'],
  barber_mens_grooming: ['Skin Fade', 'Hot Towel Classic Shave'],
  hair_studio_color_bar: ['Balayage / Ombre', 'Olaplex Bond Repair'],
  beauty_skin_spa: ['HydraFacial', 'Swedish Body Massage'],
  'family-salon': ['De-Stress Spa Combo', 'Mommy & Me Package'],
};

/** Theme-aware spoken-input example service. */
export const VOICE_SERVICE_BY_THEME: Record<Exclude<CatalogueThemeId, 'family_full_service' | 'nail_lash_studio'>, PredefinedService> = {
  hair: { name: 'Signature Blow-Out & Style', category: 'Styling', description: 'Salon blow-out with volume and long-lasting hold.', price: 500, duration: 45 },
  barber_mens_grooming: { name: 'The Executive Cut & Shave', category: 'Grooming & Treatments', description: 'Signature cut with hot-towel shave and scalp massage finish.', price: 750, duration: 60 },
  hair_studio_color_bar: { name: 'Glass Hair Gloss & Finish', category: 'Treatments', description: 'Mirror-shine gloss treatment with silk press finish.', price: 2000, duration: 55 },
  beauty_skin_spa: { name: 'Aromatherapy Body Ritual', category: 'Spa & Body', description: 'Soothing essential-oil full-body massage for deep relaxation.', price: 2400, duration: 60 },
  'family-salon': { name: 'Family Pamper Day Pass', category: 'Spa', description: 'A relaxing head massage and mini facial for the whole family.', price: 2500, duration: 120 },
};
