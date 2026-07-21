import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
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