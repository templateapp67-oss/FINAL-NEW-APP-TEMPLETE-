/**
 * PHASE 10.8 — social / latest-work copy (EN / हिन्दी).
 * Existing videosTitle / videosEyebrow from siteI18n stay authoritative
 * when a theme already has them.
 */
import type { AppLocale } from './locale';
import type { SiteHeaderThemeId } from './siteNavigation';
import type { SocialPlatform } from './siteSocialFeed';

type SocialCopy = {
  feedEyebrow: string;
  feedTitle: string;
  feedBody: string;
  view: string;
  open: string;
  play: string;
  follow: string;
  emptyTitle: string;
  emptyBody: string;
  platforms: Record<SocialPlatform, string>;
};

const COMMON_EN = {
  view: 'View',
  open: 'Open',
  play: 'Play',
  follow: 'Follow',
  platforms: {
    instagram: 'Instagram',
    youtube: 'YouTube',
    facebook: 'Facebook',
    tiktok: 'TikTok',
  } as Record<SocialPlatform, string>,
};

const COMMON_HI = {
  view: 'देखें',
  open: 'खोलें',
  play: 'चलाएँ',
  follow: 'फ़ॉलो',
  platforms: {
    instagram: 'इंस्टाग्राम',
    youtube: 'यूट्यूब',
    facebook: 'फेसबुक',
    tiktok: 'टिकटॉक',
  } as Record<SocialPlatform, string>,
};

const THEME: Record<SiteHeaderThemeId, Record<AppLocale, Pick<SocialCopy, 'feedEyebrow' | 'feedTitle' | 'feedBody' | 'emptyTitle' | 'emptyBody'>>> = {
  barber_mens_grooming: {
    en: {
      feedEyebrow: 'Latest work',
      feedTitle: 'Latest Cuts',
      feedBody: 'Reels and shorts the shop has actually posted.',
      emptyTitle: 'No reels connected yet',
      emptyBody: 'Add Instagram or YouTube work in Socials and it will land here.',
    },
    hi: {
      feedEyebrow: 'ताज़ा काम',
      feedTitle: 'ताज़ा कट्स',
      feedBody: 'दुकान ने जो रील्स और शॉर्ट्स लगाए हैं।',
      emptyTitle: 'अभी कोई रील्स नहीं',
      emptyBody: 'सोशल्स में इंस्टा या यूट्यूब जोड़ते ही काम यहाँ दिखेगा।',
    },
  },
  hair_studio_color_bar: {
    en: {
      feedEyebrow: 'Latest work',
      feedTitle: 'Latest Looks',
      feedBody: 'Studio reels and color-bar moments, as configured.',
      emptyTitle: 'The reel tray is empty',
      emptyBody: 'Connect a reel or short and it will appear in this tray.',
    },
    hi: {
      feedEyebrow: 'ताज़ा काम',
      feedTitle: 'ताज़ा लुक्स',
      feedBody: 'स्टूडियो रील्स और कलर-बार पल, जैसे जोड़े गए हैं।',
      emptyTitle: 'रील्स ट्रे खाली है',
      emptyBody: 'रील या शॉर्ट जोड़ते ही यह ट्रे भर जाएगी।',
    },
  },
  beauty_skin_spa: {
    en: {
      feedEyebrow: 'Latest work',
      feedTitle: 'Latest Moments',
      feedBody: 'Soft studio clips from the connected social accounts.',
      emptyTitle: 'No studio moments yet',
      emptyBody: 'Linked Instagram or YouTube clips will appear here.',
    },
    hi: {
      feedEyebrow: 'ताज़ा काम',
      feedTitle: 'ताज़ा पल',
      feedBody: 'जुड़े सोशल अकाउंट्स के नरम स्टूडियो क्लिप।',
      emptyTitle: 'अभी स्टूडियो पल नहीं',
      emptyBody: 'लिंक किए इंस्टा या यूट्यूब क्लिप यहाँ दिखेंगे।',
    },
  },
  family_full_service: {
    en: {
      feedEyebrow: 'Latest work',
      feedTitle: 'Happy-visit reels',
      feedBody: 'Family-day clips the salon has actually shared.',
      emptyTitle: 'No visit reels yet',
      emptyBody: 'When the salon adds a reel, it will show up here.',
    },
    hi: {
      feedEyebrow: 'ताज़ा काम',
      feedTitle: 'खुशनुमा विज़िट रील्स',
      feedBody: 'सैलून ने जो पारिवारिक क्लिप शेयर किए हैं।',
      emptyTitle: 'अभी विज़िट रील्स नहीं',
      emptyBody: 'सैलून रील्स जोड़ते ही वे यहाँ दिखेंगे।',
    },
  },
  nail_lash_studio: {
    en: {
      feedEyebrow: 'Latest work',
      feedTitle: 'The edit, on film',
      feedBody: 'Sets and lash clips from the studio’s own feed.',
      emptyTitle: 'No set-and-lash reels yet',
      emptyBody: 'Configured Instagram or YouTube work will appear here.',
    },
    hi: {
      feedEyebrow: 'ताज़ा काम',
      feedTitle: 'एडिट, फिल्म पर',
      feedBody: 'स्टूडियो के अपने फ़ीड के सेट और लैश क्लिप।',
      emptyTitle: 'अभी सेट-लैश रील्स नहीं',
      emptyBody: 'जोड़े गए इंस्टा या यूट्यूब काम यहाँ दिखेंगे।',
    },
  },
};

export function socialText(themeId: SiteHeaderThemeId, locale: AppLocale): SocialCopy {
  const common = locale === 'hi' ? COMMON_HI : COMMON_EN;
  const themed = THEME[themeId][locale === 'hi' ? 'hi' : 'en'];
  return { ...common, ...themed };
}
