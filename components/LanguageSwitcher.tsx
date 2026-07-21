"use client";

import { usePathname, useRouter, useParams } from "next/navigation";

export default function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname(); // Ex: "/fr/dashboard"
  const params = useParams(); // Récupère dynamiquement les variables de l'URL
  
  // Next.js lit directement le dossier [locale] dans l'URL
  const currentLocale = params.locale as string;

  const switchLanguage = (newLocale: string) => {
    if (newLocale === currentLocale) return;
    
    // Technique infaillible : on découpe l'URL et on remplace exactement la langue
    const segments = pathname.split("/"); // ["", "fr", "dashboard"]
    segments[1] = newLocale;              // ["", "de", "dashboard"]
    
    router.push(segments.join("/"));
  };

  return (
    <div className="flex items-center gap-1.5 text-[13px] font-bold tracking-widest uppercase">
      <button
        onClick={() => switchLanguage('fr')}
        className={`transition-opacity duration-200 ${
          currentLocale === 'fr' ? 'opacity-100 cursor-default' : 'opacity-40 hover:opacity-80'
        }`}
        aria-label="Passer en français"
      >
        FR
      </button>
      
      <span className="opacity-20 mx-0.5">|</span>
      
      <button
        onClick={() => switchLanguage('de')}
        className={`transition-opacity duration-200 ${
          currentLocale === 'de' ? 'opacity-100 cursor-default' : 'opacity-40 hover:opacity-80'
        }`}
        aria-label="Auf Deutsch wechseln"
      >
        DE
      </button>
    </div>
  );
}