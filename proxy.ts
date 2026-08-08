import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';

const intlMiddleware = createMiddleware({
  // en/it : traductions partielles (page de confidentialité App Store) — le reste
  // retombe sur le FR via i18n.ts. Doit rester aligné avec `locales` de i18n.ts.
  locales: ['fr', 'de', 'en', 'it'],
  defaultLocale: 'fr',
  localePrefix: 'always'
});

// 👈 LE CORRECTIF NEXT 16 EST ICI : export function proxy
export function proxy(request: NextRequest) {
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
};