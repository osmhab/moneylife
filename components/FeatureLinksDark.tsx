// components/FeatureLinksLight.tsx
import Image from "next/image";

type Props = { className?: string };

export default function FeatureLinksLight({ className = "" }: Props) {
  return (
    <section
      aria-labelledby="features-links"
      className={`w-full ${className}`}
      style={{ backgroundColor: "#001D38" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
        {/* Titre */}
        <h1
          id="features-links"
          className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.03] tracking-tight text-white max-w-[16ch]"
        >
          De l’analyse
          <br />
          à la signature.
        </h1>

        {/* Desktop: 4 colonnes */}
        <div className="mt-14 hidden lg:grid lg:grid-cols-4 lg:gap-14">
          <Feature
            iconSrc="/MLScanIcone.svg"
            title="Scanez votre 2e pilier"
            desc="Prenez une photo de votre certificat LPP (2e pilier) ou glissez-déposez simplement votre fichier et laissez la magie opérer. Résultat en moins de 3 minutes."
          />
          <Feature
            iconSrc="/MLAnalyseIcone.svg"
            title="Analyse de prévoyance"
            desc="MoneyLife analyse votre situation de prévoyance et vous présente vos 3 axes : situation financière en cas d’incapacité de gain, en cas de décès et votre situation à la retraite."
          />
          <Feature
            iconSrc="/MLConfigIcone.svg"
            title="Configurez votre 3e pilier"
            desc="Configurez votre 3e pilier sur mesure grâce aux résultats de votre analyse de prévoyance, déterminez votre prime, vos couvertures et choisissez le produit qui vous convient."
          />
          <Feature
            iconSrc="/MLSign.svg"
            title="Conclusion et signature online"
            desc="Avec MoneyLife, vous accédez à toutes vos offres de prévoyance en ligne sur votre dashboard MoneyLife pendant plus de 30 jours. Choisissez votre offre et signez en ligne."
          />
        </div>

        {/* Mobile/Tablet: vertical, 1 feature “à la fois” (pleine largeur) */}
        <div className="mt-10 grid grid-cols-1 gap-10 lg:hidden">
          <FeatureMobile
            iconSrc="/MLScanIcone.svg"
            title="Scanez votre 2e pilier"
            desc="Prenez une photo de votre certificat LPP (2e pilier) ou glissez-déposez simplement votre fichier. Résultat en moins de 3 minutes."
          />
          <FeatureMobile
            iconSrc="/MLAnalyseIcone.svg"
            title="Analyse de prévoyance"
            desc="Une vue claire de votre prévoyance : incapacité de gain, décès, retraite."
          />
          <FeatureMobile
            iconSrc="/MLConfigIcone.svg"
            title="Configurez votre 3e pilier"
            desc="Créez un 3a sur mesure grâce à l’analyse : prime, couvertures, produit."
          />
          <FeatureMobile
            iconSrc="/MLSign.svg"
            title="Signature online"
            desc="Recevez vos offres, comparez, choisissez et signez en ligne."
          />
        </div>
      </div>
    </section>
  );
}

function Feature({
  iconSrc,
  title,
  desc,
}: {
  iconSrc: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative h-24 w-24">
        <Image
          src={iconSrc}
          alt=""
          fill
          className="object-contain"
          priority={false}
        />
      </div>

      <h3 className="mt-6 text-base font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300/90 max-w-[28ch]">
        {desc}
      </p>
    </div>
  );
}

function FeatureMobile({
  iconSrc,
  title,
  desc,
}: {
  iconSrc: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-start">
      <div className="flex items-center gap-4">
        <div className="relative h-12 w-12 shrink-0">
          <Image
            src={iconSrc}
            alt=""
            fill
            className="object-contain"
            priority={false}
          />
        </div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-300/90">
        {desc}
      </p>
    </div>
  );
}