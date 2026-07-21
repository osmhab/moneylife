import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

const locales = ['fr', 'de'];

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  
  // Si Next.js fait une requête interne sans langue définie, 
  // on lui donne silencieusement 'fr' par défaut.
  if (!locale || !locales.includes(locale)) {
    locale = 'fr';
  }

  try {
    const messages = (await import(`./messages/${locale}.json`)).default;
    return { locale, messages };
  } catch (error) {
    notFound();
  }
});