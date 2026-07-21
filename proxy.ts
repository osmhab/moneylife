import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';

const intlMiddleware = createMiddleware({
  locales: ['fr', 'de'],
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