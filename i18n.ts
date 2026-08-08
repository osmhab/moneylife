import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// fr/de = traductions complètes du site. en/it = partiels (ex. page de
// confidentialité pour l'App Store) : tout ce qui manque retombe sur le FR.
const locales = ['fr', 'de', 'en', 'it'];
const BASE_LOCALE = 'fr';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Si Next.js fait une requête interne sans langue définie,
  // on lui donne silencieusement 'fr' par défaut.
  if (!locale || !locales.includes(locale)) {
    locale = 'fr';
  }

  try {
    const base = (await import(`./messages/${BASE_LOCALE}.json`)).default;
    if (locale === BASE_LOCALE) {
      return { locale, messages: base };
    }
    // Merge par namespace : les namespaces présents dans la locale écrasent le FR,
    // les autres (absents de en/it) restent en français → aucun texte manquant.
    const override = (await import(`./messages/${locale}.json`)).default;
    return { locale, messages: { ...base, ...override } };
  } catch (error) {
    notFound();
  }
});