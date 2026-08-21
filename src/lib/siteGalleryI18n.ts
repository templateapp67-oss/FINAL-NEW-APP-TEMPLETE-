/**
 * PHASE 14.1 — GALLERY UI CHROME COPY (all five themes, EN + HI).
 *
 * Only the gallery CONTROLS live here: filter chips, before/after labels,
 * lightbox navigation, empty/error copy. Section headings (eyebrow/title/
 * body) keep flowing from the existing per-theme `siteText` namespace, so a
 * theme's voice stays in one place.
 */
import type { SiteHeaderThemeId } from './siteNavigation';
import type { AppLocale } from './locale';

export interface GalleryChromeCopy {
  filterAll: string;
  beforeAfter: string;
  before: string;
  after: string;
  dragHint: string;
  swipeHint: string;
  viewLarger: string;
  close: string;
  previous: string;
  next: string;
  counterTemplate: string; // "{index} / {total}"
  captionFallback: string;
  emptyTitle: string;
  emptyBody: string;
  /** PHASE 14.5 — viewer service CTA copy. */
  viewService: string;
}

const GALLERY_CHROME: Record<SiteHeaderThemeId, Record<AppLocale, GalleryChromeCopy>> = {
  barber_mens_grooming: {
    en: {
      filterAll: 'All Work',
      beforeAfter: 'Before & After',
      before: 'Before',
      after: 'After',
      dragHint: 'Drag to compare',
      swipeHint: 'Swipe left or right to browse',
      viewLarger: 'View larger',
      close: 'Close gallery',
      previous: 'Previous image',
      next: 'Next image',
      counterTemplate: '{index} / {total}',
      captionFallback: 'From the shop',
      emptyTitle: 'No photos yet',
      emptyBody: 'Shop photos and cuts will show here.',
      viewService: 'View Service',
    },
    hi: {
      filterAll: 'सारा काम',
      beforeAfter: 'पहले और बाद',
      before: 'पहले',
      after: 'बाद',
      dragHint: 'तुलना करने के लिए खींचें',
      swipeHint: 'देखने के लिए बाएँ या दाएँ स्वाइप करें',
      viewLarger: 'बड़ा देखें',
      close: 'गैलरी बंद करें',
      previous: 'पिछली तस्वीर',
      next: 'अगली तस्वीर',
      counterTemplate: '{index} / {total}',
      captionFallback: 'दुकान से',
      emptyTitle: 'अभी कोई तस्वीर नहीं',
      emptyBody: 'दुकान और कट की तस्वीरें यहाँ दिखेंगी।',
      viewService: 'सेवा देखें',
    },
  },

  hair_studio_color_bar: {
    en: {
      filterAll: 'All Work',
      beforeAfter: 'Before & After',
      before: 'Before',
      after: 'After',
      dragHint: 'Drag to compare',
      swipeHint: 'Swipe left or right to browse',
      viewLarger: 'View larger',
      close: 'Close gallery',
      previous: 'Previous image',
      next: 'Next image',
      counterTemplate: '{index} / {total}',
      captionFallback: 'Studio work',
      emptyTitle: 'Portfolio coming soon',
      emptyBody: 'Transformations will show here.',
      viewService: 'View Service',
    },
    hi: {
      filterAll: 'सारा काम',
      beforeAfter: 'पहले और बाद',
      before: 'पहले',
      after: 'बाद',
      dragHint: 'तुलना करने के लिए खींचें',
      swipeHint: 'देखने के लिए बाएँ या दाएँ स्वाइप करें',
      viewLarger: 'बड़ा देखें',
      close: 'गैलरी बंद करें',
      previous: 'पिछली तस्वीर',
      next: 'अगली तस्वीर',
      counterTemplate: '{index} / {total}',
      captionFallback: 'स्टूडियो का काम',
      emptyTitle: 'पोर्टफोलियो जल्द आ रहा है',
      emptyBody: 'ट्रांसफ़ॉर्मेशन यहाँ दिखेंगे।',
      viewService: 'सेवा देखें',
    },
  },

  beauty_skin_spa: {
    en: {
      filterAll: 'All Moments',
      beforeAfter: 'Before & After',
      before: 'Before',
      after: 'After',
      dragHint: 'Drag to compare',
      swipeHint: 'Swipe left or right to browse',
      viewLarger: 'View larger',
      close: 'Close gallery',
      previous: 'Previous image',
      next: 'Next image',
      counterTemplate: '{index} / {total}',
      captionFallback: 'From the spa',
      emptyTitle: 'Photos on the way',
      emptyBody: 'Our space will appear here.',
      viewService: 'View Service',
    },
    hi: {
      filterAll: 'सारे पल',
      beforeAfter: 'पहले और बाद',
      before: 'पहले',
      after: 'बाद',
      dragHint: 'तुलना करने के लिए खींचें',
      swipeHint: 'देखने के लिए बाएँ या दाएँ स्वाइप करें',
      viewLarger: 'बड़ा देखें',
      close: 'गैलरी बंद करें',
      previous: 'पिछली तस्वीर',
      next: 'अगली तस्वीर',
      counterTemplate: '{index} / {total}',
      captionFallback: 'स्पा से',
      emptyTitle: 'तस्वीरें जल्द आ रही हैं',
      emptyBody: 'हमारी जगह यहाँ दिखेगी।',
      viewService: 'सेवा देखें',
    },
  },

  family_full_service: {
    en: {
      filterAll: 'Everything',
      beforeAfter: 'Before & After',
      before: 'Before',
      after: 'After',
      dragHint: 'Drag to compare',
      swipeHint: 'Swipe left or right to browse',
      viewLarger: 'View larger',
      close: 'Close gallery',
      previous: 'Previous photo',
      next: 'Next photo',
      counterTemplate: '{index} / {total}',
      captionFallback: 'Salon moments',
      emptyTitle: 'Nothing here yet',
      emptyBody: 'Salon moments will appear here.',
      viewService: 'View Service',
    },
    hi: {
      filterAll: 'सब कुछ',
      beforeAfter: 'पहले और बाद',
      before: 'पहले',
      after: 'बाद',
      dragHint: 'तुलना करने के लिए खींचें',
      swipeHint: 'देखने के लिए बाएँ या दाएँ स्वाइप करें',
      viewLarger: 'बड़ा देखें',
      close: 'गैलरी बंद करें',
      previous: 'पिछली तस्वीर',
      next: 'अगली तस्वीर',
      counterTemplate: '{index} / {total}',
      captionFallback: 'सैलून के पल',
      emptyTitle: 'अभी यहाँ कुछ नहीं है',
      emptyBody: 'सैलून के पल यहाँ दिखेंगे।',
      viewService: 'सेवा देखें',
    },
  },

  nail_lash_studio: {
    en: {
      filterAll: 'The Whole Edit',
      beforeAfter: 'Before & After',
      before: 'Before',
      after: 'After',
      dragHint: 'Drag to compare',
      swipeHint: 'Swipe left or right to browse',
      viewLarger: 'View larger',
      close: 'Close gallery',
      previous: 'Previous look',
      next: 'Next look',
      counterTemplate: '{index} / {total}',
      captionFallback: 'The visual diary',
      emptyTitle: 'Diary is loading',
      emptyBody: 'The visual diary will appear here.',
      viewService: 'View Service',
    },
    hi: {
      filterAll: 'पूरा एडिट',
      beforeAfter: 'पहले और बाद',
      before: 'पहले',
      after: 'बाद',
      dragHint: 'तुलना करने के लिए खींचें',
      swipeHint: 'देखने के लिए बाएँ या दाएँ स्वाइप करें',
      viewLarger: 'बड़ा देखें',
      close: 'गैलरी बंद करें',
      previous: 'पिछला लुक',
      next: 'अगला लुक',
      counterTemplate: '{index} / {total}',
      captionFallback: 'विज़ुअल डायरी',
      emptyTitle: 'डायरी लोड हो रही है',
      emptyBody: 'विज़ुअल डायरी यहाँ दिखेगी।',
      viewService: 'सेवा देखें',
    },
  },
};

export function galleryChrome(themeId: SiteHeaderThemeId, locale: AppLocale): GalleryChromeCopy {
  return GALLERY_CHROME[themeId]?.[locale] || GALLERY_CHROME.barber_mens_grooming[locale];
}

/** `"{index} / {total}"` → `"3 / 12"`. */
export function galleryCounter(chrome: GalleryChromeCopy, index: number, total: number): string {
  return chrome.counterTemplate.replace('{index}', String(index + 1)).replace('{total}', String(total));
}
