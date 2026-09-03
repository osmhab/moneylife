import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig = {
  // La clé `eslint` n'est plus reconnue depuis Next 16 (`next lint` a été
  // retiré) : elle ne faisait plus qu'émettre un avertissement à chaque build.
  // Le lint tourne de toute façon séparément via `pnpm lint`.
  output: "standalone" as const, // 👈 L'astuce magique est ici
  
  async rewrites() {
    return [
      {
        source: "/prevoyance", 
        destination: "/",      
      },
    ];
  },
};

export default withNextIntl(nextConfig);