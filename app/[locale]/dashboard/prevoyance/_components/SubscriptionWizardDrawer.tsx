//app/[locale]/dashboard/prevoyance/_components/SubscriptionWizardDrawer.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { db, auth } from "@/lib/firebase/index"; // Alias mis à jour si besoin
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from "firebase/firestore";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter, usePathname } from "next/navigation"; 

// 👈 NOUVEAU : Imports de next-intl
import { useTranslations, useLocale } from "next-intl";

const optionsPaysBase = [
  { id: "Suisse", labelFR: "🇨🇭 Suisse", labelDE: "🇨🇭 Schweiz" },
  { id: "France", labelFR: "🇫🇷 France", labelDE: "🇫🇷 Frankreich" },
  { id: "Italie", labelFR: "🇮🇹 Italie", labelDE: "🇮🇹 Italien" },
  { id: "Allemagne", labelFR: "🇩🇪 Allemagne", labelDE: "🇩🇪 Deutschland" },
  { id: "Portugal", labelFR: "🇵🇹 Portugal", labelDE: "🇵🇹 Portugal" },
  { id: "Espagne", labelFR: "🇪🇸 Espagne", labelDE: "🇪🇸 Spanien" },
  { id: "Royaume-Uni", labelFR: "🇬🇧 Royaume-Uni", labelDE: "🇬🇧 Vereinigtes Königreich" },
  { id: "Belgique", labelFR: "🇧🇪 Belgique", labelDE: "🇧🇪 Belgien" },
  { id: "Kosovo", labelFR: "🇽🇰 Kosovo", labelDE: "🇽🇰 Kosovo" },
  { id: "Serbie", labelFR: "🇷🇸 Serbie", labelDE: "🇷🇸 Serbien" },
  { id: "Afghanistan", labelFR: "Afghanistan", labelDE: "Afghanistan" },
  { id: "Afrique du Sud", labelFR: "Afrique du Sud", labelDE: "Südafrika" },
  { id: "Albanie", labelFR: "Albanie", labelDE: "Albanien" },
  { id: "Algérie", labelFR: "Algérie", labelDE: "Algerien" },
  { id: "Andorre", labelFR: "Andorre", labelDE: "Andorra" },
  { id: "Angola", labelFR: "Angola", labelDE: "Angola" },
  { id: "Antigua-et-Barbuda", labelFR: "Antigua-et-Barbuda", labelDE: "Antigua und Barbuda" },
  { id: "Arabie Saoudite", labelFR: "Arabie Saoudite", labelDE: "Saudi-Arabien" },
  { id: "Argentine", labelFR: "Argentine", labelDE: "Argentinien" },
  { id: "Arménie", labelFR: "Arménie", labelDE: "Armenien" },
  { id: "Australie", labelFR: "Australie", labelDE: "Australien" },
  { id: "Autriche", labelFR: "Autriche", labelDE: "Österreich" },
  { id: "Azerbaïdjan", labelFR: "Azerbaïdjan", labelDE: "Aserbaidschan" },
  { id: "Bahamas", labelFR: "Bahamas", labelDE: "Bahamas" },
  { id: "Bahreïn", labelFR: "Bahreïn", labelDE: "Bahrain" },
  { id: "Bangladesh", labelFR: "Bangladesh", labelDE: "Bangladesch" },
  { id: "Barbade", labelFR: "Barbade", labelDE: "Barbados" },
  { id: "Belize", labelFR: "Belize", labelDE: "Belize" },
  { id: "Bénin", labelFR: "Bénin", labelDE: "Benin" },
  { id: "Bhoutan", labelFR: "Bhoutan", labelDE: "Bhutan" },
  { id: "Biélorussie", labelFR: "Biélorussie", labelDE: "Belarus" },
  { id: "Birmanie", labelFR: "Birmanie", labelDE: "Myanmar" },
  { id: "Bolivie", labelFR: "Bolivie", labelDE: "Bolivien" },
  { id: "Bosnie-Herzégovine", labelFR: "Bosnie-Herzégovine", labelDE: "Bosnien und Herzegowina" },
  { id: "Botswana", labelFR: "Botswana", labelDE: "Botswana" },
  { id: "Brésil", labelFR: "Brésil", labelDE: "Brasilien" },
  { id: "Brunei", labelFR: "Brunei", labelDE: "Brunei" },
  { id: "Bulgarie", labelFR: "Bulgarie", labelDE: "Bulgarien" },
  { id: "Burkina Faso", labelFR: "Burkina Faso", labelDE: "Burkina Faso" },
  { id: "Burundi", labelFR: "Burundi", labelDE: "Burundi" },
  { id: "Cambodge", labelFR: "Cambodge", labelDE: "Kambodscha" },
  { id: "Cameroun", labelFR: "Cameroun", labelDE: "Kamerun" },
  { id: "Canada", labelFR: "Canada", labelDE: "Kanada" },
  { id: "Cap-Vert", labelFR: "Cap-Vert", labelDE: "Kap Verde" },
  { id: "Chili", labelFR: "Chili", labelDE: "Chile" },
  { id: "Chine", labelFR: "Chine", labelDE: "China" },
  { id: "Chypre", labelFR: "Chypre", labelDE: "Zypern" },
  { id: "Colombie", labelFR: "Colombie", labelDE: "Kolumbien" },
  { id: "Comores", labelFR: "Comores", labelDE: "Komoren" },
  { id: "Congo", labelFR: "Congo", labelDE: "Kongo" },
  { id: "Corée du Nord", labelFR: "Corée du Nord", labelDE: "Nordkorea" },
  { id: "Corée du Sud", labelFR: "Corée du Sud", labelDE: "Südkorea" },
  { id: "Costa Rica", labelFR: "Costa Rica", labelDE: "Costa Rica" },
  { id: "Côte d'Ivoire", labelFR: "Côte d'Ivoire", labelDE: "Elfenbeinküste" },
  { id: "Croatie", labelFR: "Croatie", labelDE: "Kroatien" },
  { id: "Cuba", labelFR: "Cuba", labelDE: "Kuba" },
  { id: "Danemark", labelFR: "Danemark", labelDE: "Dänemark" },
  { id: "Djibouti", labelFR: "Djibouti", labelDE: "Dschibuti" },
  { id: "Dominique", labelFR: "Dominique", labelDE: "Dominica" },
  { id: "Égypte", labelFR: "Égypte", labelDE: "Ägypten" },
  { id: "Émirats arabes unis", labelFR: "Émirats arabes unis", labelDE: "Vereinigte Arabische Emirate" },
  { id: "Équateur", labelFR: "Équateur", labelDE: "Ecuador" },
  { id: "Érythrée", labelFR: "Érythrée", labelDE: "Eritrea" },
  { id: "Estonie", labelFR: "Estonie", labelDE: "Estland" },
  { id: "Eswatini", labelFR: "Eswatini", labelDE: "Eswatini" },
  { id: "États-Unis", labelFR: "États-Unis", labelDE: "Vereinigte Staaten" },
  { id: "Éthiopie", labelFR: "Éthiopie", labelDE: "Äthiopien" },
  { id: "Fidji", labelFR: "Fidji", labelDE: "Fidschi" },
  { id: "Finlande", labelFR: "Finlande", labelDE: "Finnland" },
  { id: "Gabon", labelFR: "Gabon", labelDE: "Gabun" },
  { id: "Gambie", labelFR: "Gambie", labelDE: "Gambia" },
  { id: "Géorgie", labelFR: "Géorgie", labelDE: "Georgien" },
  { id: "Ghana", labelFR: "Ghana", labelDE: "Ghana" },
  { id: "Grèce", labelFR: "Grèce", labelDE: "Griechenland" },
  { id: "Grenade", labelFR: "Grenade", labelDE: "Grenada" },
  { id: "Guatemala", labelFR: "Guatemala", labelDE: "Guatemala" },
  { id: "Guinée", labelFR: "Guinée", labelDE: "Guinea" },
  { id: "Guinée-Bissau", labelFR: "Guinée-Bissau", labelDE: "Guinea-Bissau" },
  { id: "Guinée équatoriale", labelFR: "Guinée équatoriale", labelDE: "Äquatorialguinea" },
  { id: "Guyana", labelFR: "Guyana", labelDE: "Guyana" },
  { id: "Haïti", labelFR: "Haïti", labelDE: "Haiti" },
  { id: "Honduras", labelFR: "Honduras", labelDE: "Honduras" },
  { id: "Hongrie", labelFR: "Hongrie", labelDE: "Ungarn" },
  { id: "Inde", labelFR: "Inde", labelDE: "Indien" },
  { id: "Indonésie", labelFR: "Indonésie", labelDE: "Indonesien" },
  { id: "Irak", labelFR: "Irak", labelDE: "Irak" },
  { id: "Iran", labelFR: "Iran", labelDE: "Iran" },
  { id: "Irlande", labelFR: "Irlande", labelDE: "Irland" },
  { id: "Islande", labelFR: "Islande", labelDE: "Island" },
  { id: "Israël", labelFR: "Israël", labelDE: "Israel" },
  { id: "Jamaïque", labelFR: "Jamaïque", labelDE: "Jamaika" },
  { id: "Japon", labelFR: "Japon", labelDE: "Japan" },
  { id: "Jordanie", labelFR: "Jordanie", labelDE: "Jordanien" },
  { id: "Kazakhstan", labelFR: "Kazakhstan", labelDE: "Kasachstan" },
  { id: "Kenya", labelFR: "Kenya", labelDE: "Kenia" },
  { id: "Kirghizistan", labelFR: "Kirghizistan", labelDE: "Kirgisistan" },
  { id: "Kiribati", labelFR: "Kiribati", labelDE: "Kiribati" },
  { id: "Koweït", labelFR: "Koweït", labelDE: "Kuwait" },
  { id: "Laos", labelFR: "Laos", labelDE: "Laos" },
  { id: "Lesotho", labelFR: "Lesotho", labelDE: "Lesotho" },
  { id: "Lettonie", labelFR: "Lettonie", labelDE: "Lettland" },
  { id: "Liban", labelFR: "Liban", labelDE: "Libanon" },
  { id: "Liberia", labelFR: "Liberia", labelDE: "Liberia" },
  { id: "Libye", labelFR: "Libye", labelDE: "Libyen" },
  { id: "Liechtenstein", labelFR: "Liechtenstein", labelDE: "Liechtenstein" },
  { id: "Lituanie", labelFR: "Lituanie", labelDE: "Litauen" },
  { id: "Luxembourg", labelFR: "Luxembourg", labelDE: "Luxemburg" },
  { id: "Macédoine du Nord", labelFR: "Macédoine du Nord", labelDE: "Nordmazedonien" },
  { id: "Madagascar", labelFR: "Madagascar", labelDE: "Madagaskar" },
  { id: "Malaisie", labelFR: "Malaisie", labelDE: "Malaysia" },
  { id: "Malawi", labelFR: "Malawi", labelDE: "Malawi" },
  { id: "Maldives", labelFR: "Maldives", labelDE: "Malediven" },
  { id: "Mali", labelFR: "Mali", labelDE: "Mali" },
  { id: "Malte", labelFR: "Malte", labelDE: "Malta" },
  { id: "Maroc", labelFR: "Maroc", labelDE: "Marokko" },
  { id: "Marshall", labelFR: "Marshall", labelDE: "Marshallinseln" },
  { id: "Maurice", labelFR: "Maurice", labelDE: "Mauritius" },
  { id: "Mauritanie", labelFR: "Mauritanie", labelDE: "Mauretanien" },
  { id: "Mexique", labelFR: "Mexique", labelDE: "Mexiko" },
  { id: "Micronésie", labelFR: "Micronésie", labelDE: "Mikronesien" },
  { id: "Moldavie", labelFR: "Moldavie", labelDE: "Moldau" },
  { id: "Monaco", labelFR: "Monaco", labelDE: "Monaco" },
  { id: "Mongolie", labelFR: "Mongolie", labelDE: "Mongolei" },
  { id: "Monténégro", labelFR: "Monténégro", labelDE: "Montenegro" },
  { id: "Mozambique", labelFR: "Mozambique", labelDE: "Mosambik" },
  { id: "Namibie", labelFR: "Namibie", labelDE: "Namibia" },
  { id: "Nauru", labelFR: "Nauru", labelDE: "Nauru" },
  { id: "Népal", labelFR: "Népal", labelDE: "Nepal" },
  { id: "Nicaragua", labelFR: "Nicaragua", labelDE: "Nicaragua" },
  { id: "Niger", labelFR: "Niger", labelDE: "Niger" },
  { id: "Nigeria", labelFR: "Nigeria", labelDE: "Nigeria" },
  { id: "Norvège", labelFR: "Norvège", labelDE: "Norwegen" },
  { id: "Nouvelle-Zélande", labelFR: "Nouvelle-Zélande", labelDE: "Neuseeland" },
  { id: "Oman", labelFR: "Oman", labelDE: "Oman" },
  { id: "Ouganda", labelFR: "Ouganda", labelDE: "Uganda" },
  { id: "Ouzbékistan", labelFR: "Ouzbékistan", labelDE: "Usbekistan" },
  { id: "Pakistan", labelFR: "Pakistan", labelDE: "Pakistan" },
  { id: "Palaos", labelFR: "Palaos", labelDE: "Palau" },
  { id: "Panama", labelFR: "Panama", labelDE: "Panama" },
  { id: "Papouasie-Nouvelle-Guinée", labelFR: "Papouasie-Nouvelle-Guinée", labelDE: "Papua-Neuguinea" },
  { id: "Paraguay", labelFR: "Paraguay", labelDE: "Paraguay" },
  { id: "Pays-Bas", labelFR: "Pays-Bas", labelDE: "Niederlande" },
  { id: "Pérou", labelFR: "Pérou", labelDE: "Peru" },
  { id: "Philippines", labelFR: "Philippines", labelDE: "Philippinen" },
  { id: "Pologne", labelFR: "Pologne", labelDE: "Polen" },
  { id: "Qatar", labelFR: "Qatar", labelDE: "Katar" },
  { id: "République centrafricaine", labelFR: "République centrafricaine", labelDE: "Zentralafrikanische Republik" },
  { id: "République démocratique du Congo", labelFR: "Rép. démocratique du Congo", labelDE: "Demokratische Republik Kongo" },
  { id: "République dominicaine", labelFR: "République dominicaine", labelDE: "Dominikanische Republik" },
  { id: "Roumanie", labelFR: "Roumanie", labelDE: "Rumänien" },
  { id: "Russie", labelFR: "Russie", labelDE: "Russland" },
  { id: "Rwanda", labelFR: "Rwanda", labelDE: "Ruanda" },
  { id: "Saint-Kitts-et-Nevis", labelFR: "Saint-Kitts-et-Nevis", labelDE: "St. Kitts und Nevis" },
  { id: "Saint-Marin", labelFR: "Saint-Marin", labelDE: "San Marino" },
  { id: "Saint-Vincent-et-les-Grenadines", labelFR: "Saint-Vincent-et-les-Grenadines", labelDE: "St. Vincent und die Grenadinen" },
  { id: "Sainte-Lucie", labelFR: "Sainte-Lucie", labelDE: "St. Lucia" },
  { id: "Salomon", labelFR: "Salomon", labelDE: "Salomonen" },
  { id: "Salvador", labelFR: "Salvador", labelDE: "El Salvador" },
  { id: "Samoa", labelFR: "Samoa", labelDE: "Samoa" },
  { id: "Sao Tomé-et-Principe", labelFR: "Sao Tomé-et-Principe", labelDE: "São Tomé und Príncipe" },
  { id: "Sénégal", labelFR: "Sénégal", labelDE: "Senegal" },
  { id: "Seychelles", labelFR: "Seychelles", labelDE: "Seychellen" },
  { id: "Sierra Leone", labelFR: "Sierra Leone", labelDE: "Sierra Leone" },
  { id: "Singapour", labelFR: "Singapour", labelDE: "Singapur" },
  { id: "Slovaquie", labelFR: "Slovaquie", labelDE: "Slowakei" },
  { id: "Slovénie", labelFR: "Slovénie", labelDE: "Slowenien" },
  { id: "Somalie", labelFR: "Somalie", labelDE: "Somalia" },
  { id: "Soudan", labelFR: "Soudan", labelDE: "Sudan" },
  { id: "Soudan du Sud", labelFR: "Soudan du Sud", labelDE: "Südsudan" },
  { id: "Sri Lanka", labelFR: "Sri Lanka", labelDE: "Sri Lanka" },
  { id: "Suède", labelFR: "Suède", labelDE: "Schweden" },
  { id: "Suriname", labelFR: "Suriname", labelDE: "Suriname" },
  { id: "Syrie", labelFR: "Syrie", labelDE: "Syrien" },
  { id: "Tadjikistan", labelFR: "Tadjikistan", labelDE: "Tadschikistan" },
  { id: "Tanzanie", labelFR: "Tanzanie", labelDE: "Tansania" },
  { id: "Tchad", labelFR: "Tchad", labelDE: "Tschad" },
  { id: "Tchéquie", labelFR: "Tchéquie", labelDE: "Tschechien" },
  { id: "Thaïlande", labelFR: "Thaïlande", labelDE: "Thailand" },
  { id: "Timor oriental", labelFR: "Timor oriental", labelDE: "Osttimor" },
  { id: "Togo", labelFR: "Togo", labelDE: "Togo" },
  { id: "Tonga", labelFR: "Tonga", labelDE: "Tonga" },
  { id: "Trinité-et-Tobago", labelFR: "Trinité-et-Tobago", labelDE: "Trinidad und Tobago" },
  { id: "Tunisie", labelFR: "Tunisie", labelDE: "Tunesien" },
  { id: "Turkménistan", labelFR: "Turkménistan", labelDE: "Turkmenistan" },
  { id: "Turquie", labelFR: "Turquie", labelDE: "Türkei" },
  { id: "Tuvalu", labelFR: "Tuvalu", labelDE: "Tuvalu" },
  { id: "Ukraine", labelFR: "Ukraine", labelDE: "Ukraine" },
  { id: "Uruguay", labelFR: "Uruguay", labelDE: "Uruguay" },
  { id: "Vanuatu", labelFR: "Vanuatu", labelDE: "Vanuatu" },
  { id: "Vatican", labelFR: "Vatican", labelDE: "Vatikanstadt" },
  { id: "Venezuela", labelFR: "Venezuela", labelDE: "Venezuela" },
  { id: "Viêt Nam", labelFR: "Viêt Nam", labelDE: "Vietnam" },
  { id: "Yémen", labelFR: "Yémen", labelDE: "Jemen" },
  { id: "Zambie", labelFR: "Zambie", labelDE: "Sambia" },
  { id: "Zimbabwe", labelFR: "Zimbabwe", labelDE: "Simbabwe" }
];

interface SubscriptionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  analysisData: any; 
  adminUid?: string; // 👈 Ajout du paramètre Admin
}

export default function SubscriptionWizardDrawer({ isOpen, onClose, analysisData, adminUid }: SubscriptionWizardProps) {
  // 👈 SÉCURITÉ : Définir la cible
  const targetUid = adminUid || auth.currentUser?.uid;
  const router = useRouter(); 
  const pathname = usePathname();
  
  // Calcule dynamiquement le chemin de retour
  const basePath = pathname.includes('/admin/client') 
    ? pathname.substring(0, pathname.indexOf('/prevoyance') + 11) // +11 pour garder "/prevoyance"
    : '/dashboard/prevoyance'; 
  
  // 👈 NOUVEAU : Initialisation des traductions
  const t = useTranslations("SubscriptionWizardDrawer");
  const locale = useLocale();
  
  // --- 1. LOGIQUE DYNAMIQUE DES ÉTAPES ---
  const monthlySavings = analysisData?.sol?.priceRet || 0;
  const hasSavings = monthlySavings > 0;

  const riskPrice = (analysisData?.sol?.priceInc || 0) + (analysisData?.sol?.priceDec || 0) + (analysisData?.sol?.pricePay || 0);
  const hasRisk = riskPrice > 0;

  const ageClient = analysisData?.Enter_age || analysisData?.age || 35;
  const horizon = 65 - ageClient;

  // --- ÉTATS DU FORMULAIRE (DE BASE) ---
  const [riskProfile, setRiskProfile] = useState<"safe" | "conservative" | "balanced" | "growth" | null>(null);
  const [isSmoker, setIsSmoker] = useState<boolean | null>(null);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [profession, setProfession] = useState("");
  const [address, setAddress] = useState("");
  
  // Nationalité et Permis
  const [nationality, setNationality] = useState("");
  const [permit, setPermit] = useState("");
  
  // LES 17 ÉTATS POUR LE QUESTIONNAIRE UNIFIÉ AXA & SWISSLIFE
  const [expAssurance, setExpAssurance] = useState<boolean | null>(null);
  const [expFonds, setExpFonds] = useState<boolean | null>(null);
  const [revenuMensuel, setRevenuMensuel] = useState<string | null>(null);
  const [engagements, setEngagements] = useState<string | null>(null);
  const [fortuneGlobale, setFortuneGlobale] = useState<string | null>(null); 
  const [fortuneLiquide, setFortuneLiquide] = useState<string | null>(null); 
  const [evolutionRevenus, setEvolutionRevenus] = useState<string | null>(null);
  const [epargnePourcent, setEpargnePourcent] = useState<string | null>(null);
  const [depensesPrevues, setDepensesPrevues] = useState<string | null>(null);
  const [reserveMois, setReserveMois] = useState<string | null>(null);
  const [personnesCharge, setPersonnesCharge] = useState<string | null>(null);
  const [horizonLong, setHorizonLong] = useState<boolean | null>(null);
  const [perteAcceptable, setPerteAcceptable] = useState<string | null>(null);
  const [objectifRendement, setObjectifRendement] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string | null>(null);
  const [reactionBaisse, setReactionBaisse] = useState<string | null>(null);
  const [critereESG, setCritereESG] = useState<string | null>(null);

  const [lsfinStep, setLsfinStep] = useState(0);

  // Politique produit : on ne propose plus QUE de l'assurance — plus de branche bancaire.
  // L'étape 1 est désormais un disclaimer « long terme » (valeur de rachat, horizon 10 ans).
  const isBanqueFromStep1 = false;

  const recommendation = !hasSavings ? "PROTECTION PURE" : "ASSURANCE";

  const optionsPays = useMemo(() => {
    return optionsPaysBase.map(pays => ({
      id: pays.id,
      label: locale === 'de' ? pays.labelDE : pays.labelFR
    }));
  }, [locale]);

  const stepsSequence = useMemo(() => {
    const seq = [];
    if (hasSavings) {
      seq.push(1); 
      if (!isBanqueFromStep1) {
          seq.push(2);
          if (riskProfile !== "safe" && riskProfile !== null) {
              seq.push("risk_profile");
          }
      }
    }
    if (hasRisk) {
      seq.push(3); 
    }
    seq.push(4); 
    seq.push(5); 
    return seq;
  }, [hasSavings, hasRisk, isBanqueFromStep1, riskProfile]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const step = stepsSequence[currentStepIndex];

  // --- 2. SYNCHRONISATION DES DONNÉES EXISTANTES ---
  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0); 
      setLsfinStep(0); 

      const loadData = async () => {
        if (analysisData) {
          if (analysisData.Enter_prenom) setFirstName(analysisData.Enter_prenom);
          if (analysisData.Enter_nom) setLastName(analysisData.Enter_nom);
          if (analysisData.Enter_telephone) setPhone(analysisData.Enter_telephone);
          if (analysisData.Enter_profession) setProfession(analysisData.Enter_profession);

          const street = analysisData.Enter_adresse || "";
          const npa = analysisData.Enter_npa || "";
          const city = analysisData.Enter_localite || "";
          if (street || npa || city) {
            setAddress(`${street}${npa ? ', ' + npa : ''}${city ? ' ' + city : ''}`.trim());
          }
        }

        if (targetUid) {
          try {
            const profileRef = doc(db, "clients", targetUid, "DonneePersonnelles", "current");
            const snap = await getDoc(profileRef);
            
            if (snap.exists()) {
              const profile = snap.data();
              if (profile.Enter_prenom) setFirstName(profile.Enter_prenom);
              if (profile.Enter_nom) setLastName(profile.Enter_nom);
              if (profile.Enter_telephone) setPhone(profile.Enter_telephone);
              if (profile.Enter_profession) setProfession(profile.Enter_profession);
              
              if (profile.Enter_nationalite) setNationality(profile.Enter_nationalite);
              if (profile.Enter_permisSejour) setPermit(profile.Enter_permisSejour);

              const street = profile.Enter_adresse || "";
              const npa = profile.Enter_npa || "";
              const city = profile.Enter_localite || "";
              if (street || npa || city) {
                setAddress(`${street}${npa ? ', ' + npa : ''}${city ? ' ' + city : ''}`.trim());
              }
            }
          } catch (error) {
            console.error("Erreur de récupération du profil en direct:", error);
          }
        }

        const wizardDataStr = sessionStorage.getItem("new3aWizardData");
        if (wizardDataStr) {
          try {
            const wData = JSON.parse(wizardDataStr);
            if (typeof wData.isSmoker === "boolean") setIsSmoker(wData.isSmoker);

            if (wData.riskProfile) {
              const riskMap: Record<string, any> = {
                "guaranteed": "safe", "prudent": "conservative", "balanced": "balanced", "dynamic": "growth"
              };
              setRiskProfile(riskMap[wData.riskProfile] || "balanced");
            }
          } catch (e) {
            console.error("Erreur lecture wizard data:", e);
          }
        }
      };

      loadData();
    }
  }, [analysisData, isOpen]); 

  const isSwiss = nationality.toLowerCase() === "suisse" || nationality.toLowerCase() === "ch";
  const isStep4Valid = firstName && lastName && phone && profession && address && nationality && (isSwiss || permit);

  const handleFinalSubmit = async () => {
    try {
      const user = auth.currentUser;
      if (!targetUid || !user) return; // 👈 TypeScript sait maintenant que 'user' ne sera jamais null pour la suite !

      try {
        await setDoc(doc(db, "clients", targetUid, "DonneePersonnelles", "current"), {
          Enter_prenom: firstName,
          Enter_nom: lastName,
          Enter_telephone: phone,
          Enter_profession: profession,
          Enter_adresse: address,
          Enter_nationalite: nationality,
          Enter_permisSejour: isSwiss ? "N/A" : permit
        }, { merge: true });
      } catch (err) {
        console.error("Erreur lors de la synchronisation silencieuse du profil :", err);
      }

      const maxLacuneMaladie = Math.max(...(analysisData?.inc?.maladie?.periodes?.map((p: any) => p.lacune) || [0])) * 12;
      const maxLacuneAccident = Math.max(...(analysisData?.inc?.accident?.periodes?.map((p: any) => p.lacune) || [0])) * 12;

      const epargneCompagnie = monthlySavings > 0
        ? (analysisData?.sol?.benchmarks?.retraite || "Non spécifié")
        : "Non désiré";

      const decesCompagnie = analysisData?.dec?.lacune > 0 && (analysisData?.sol?.priceDec === 0)
        ? "Non désiré"
        : (analysisData?.sol?.benchmarks?.deces || "N/A");

      const invaliditeCompagnie = (maxLacuneMaladie > 0 || maxLacuneAccident > 0) && (analysisData?.sol?.priceInc === 0)
        ? "Non désiré"
        : (analysisData?.sol?.benchmarks?.incapacite || "N/A");

      const liberationCompagnie = analysisData?.sol?.pricePay === 0 && hasSavings
        ? "Non désiré"
        : (analysisData?.sol?.benchmarks?.retraite || "N/A");

      const technicalDetails = {
        epargne: {
          montant: monthlySavings,
          split3a: analysisData?.sol?.split3a || 0,
          split3b: analysisData?.sol?.split3b || 0,
          isSpillover: analysisData?.sol?.isSpillover || false,
          compagnie: epargneCompagnie
        },
        deces: {
          lacune: analysisData?.dec?.lacune || 0,
          prix: analysisData?.sol?.priceDec || 0,
          compagnie: decesCompagnie
        },
        invalidite: {
          lacuneMaladie: maxLacuneMaladie,
          lacuneAccident: maxLacuneAccident,
          prix: analysisData?.sol?.priceInc || 0,
          compagnie: invaliditeCompagnie
        },
        liberation: {
          prix: analysisData?.sol?.pricePay || 0,
          compagnie: liberationCompagnie
        }
      };

      const wizardDataStr = sessionStorage.getItem("new3aWizardData");
      let initialWizardData = { objective: [], philosophy: null };
      if (wizardDataStr) {
        try { initialWizardData = JSON.parse(wizardDataStr); } catch (e) {}
      }

      const offerData = {
        clientUid: targetUid, // 👈 Cible le client
        createdBy: adminUid ? "ADMIN" : "CLIENT", // 👈 Marqueur de création (optionnel mais utile)
        status: "PENDING",
        provider: recommendation === "PROTECTION PURE" ? "Compagnies d'assurance" : (analysisData?.sol?.benchmarks?.retraite || "Non spécifié"),
        createdAt: serverTimestamp(),
        client: { 
          firstName: firstName || analysisData?.Enter_prenom || "", 
          lastName: lastName || analysisData?.Enter_nom || "", 
          phone: phone || analysisData?.Enter_telephone || "", 
          profession: profession || analysisData?.Enter_profession || "", 
          address: address || "", 
          nationality: nationality || "",
          permit: isSwiss ? "N/A" : (permit || ""),
          email: user?.email || "" // L'email reste celui de la session active
        },
        selection: {
          mensualite: analysisData?.sol?.total || 0,
          details: technicalDetails,
          lacuneRetraite: analysisData?.ret?.lacune || 0,
        },
        strategie: { 
          recommandation: recommendation,
          horizon: horizon,
          useBefore15Years: null,
          riskProfile: hasSavings ? riskProfile : "N/A",
          objectives: initialWizardData.objective || [],
          philosophy: initialWizardData.philosophy || null
        },
        questionnaireInvestisseur: recommendation === "ASSURANCE" ? {
            expAssurance, expFonds, revenuMensuel, engagements, fortuneGlobale, fortuneLiquide,
            evolutionRevenus, epargnePourcent, depensesPrevues, reserveMois,
            personnesCharge, horizonLong, perteAcceptable, objectifRendement,
            scenario, reactionBaisse, critereESG
        } : null,
        sante: hasRisk ? { isSmoker, height, weight, healthOk } : { isSmoker: null, height: "", weight: "", healthOk: null }
      };

      const docRef = await addDoc(collection(db, "offers_requests_3e"), offerData);

      const fmt = new Intl.NumberFormat('fr-CH');
      let detailsHtml = `
      <table style="width:100%; font-size:14px; border-collapse: collapse; margin-top: 10px;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:12px 0; color:#4A4A4A;">${t("notif.save_ret")}</td>
          <td style="padding:12px 0; text-align:right; color:#1A1A1A;"><strong>${fmt.format(technicalDetails.epargne.montant)} CHF</strong></td>
        </tr>
      `;
      if (technicalDetails.deces.prix > 0) detailsHtml += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px 0; color:#4A4A4A;">${t("notif.cover_death")}</td><td style="padding:12px 0; text-align:right; color:#1A1A1A;">${fmt.format(technicalDetails.deces.prix)} CHF</td></tr>`;
      if (technicalDetails.invalidite.prix > 0) detailsHtml += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px 0; color:#4A4A4A;">${t("notif.rent_inv")}</td><td style="padding:12px 0; text-align:right; color:#1A1A1A;">${fmt.format(technicalDetails.invalidite.prix)} CHF</td></tr>`;
      if (technicalDetails.liberation.prix > 0) detailsHtml += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px 0; color:#4A4A4A;">${t("notif.lib_prime")}</td><td style="padding:12px 0; text-align:right; color:#1A1A1A;">${fmt.format(technicalDetails.liberation.prix)} CHF</td></tr>`;
      
      detailsHtml += `
        <tr style="background:#f8fafc;">
          <td style="padding:16px 10px; font-weight:900; text-transform:uppercase; font-size:15px; border-radius: 8px 0 0 8px;">${t("notif.total_monthly")}</td>
          <td style="padding:16px 10px; text-align:right; font-weight:900; font-size:18px; color:#1A1A1A; border-radius: 0 8px 8px 0;">${fmt.format(analysisData?.sol?.total || 0)} CHF</td>
        </tr>
      </table>`;

      const notificationHtml = `
        <p>${t("notif.greeting", { name: firstName || "Client" })}</p>
        <p>${t("notif.p1")}</p>
        <p>${t("notif.p2")}</p>
        <div style="background:#ffffff; padding:24px; border-radius:12px; margin:32px 0; border:1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <h3 style="margin:0 0 16px 0; font-size:12px; text-transform:uppercase; color:#64748b; letter-spacing:0.05em;">${t("notif.recap_title")}</h3>
          ${detailsHtml}
        </div>
      `;

      // La notification n'est plus écrite ici : la route la crée avec l'e-mail.
      // Seul le TEXTE est traduit ici (next-intl n'existe que côté client).
      fetch('/api/send-offer-confirmation', {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
        },
        body: JSON.stringify({
          requestId: docRef.id,
          clientUid: targetUid,
          notification: {
            title: t("notif.title"),
            content: t("notif.content", { recommendation }),
            html: notificationHtml,
          },
          email: user.email,
          firstName: offerData.client.firstName,
          lastName: offerData.client.lastName,
          phone: offerData.client.phone,
          profession: offerData.client.profession,
          address: offerData.client.address,
          recommendation: recommendation,
          riskProfile: offerData.strategie.riskProfile,
          monthlyTotal: analysisData?.sol?.total || 0,
          sante: offerData.sante,
          details: technicalDetails,
          benchmarks: {
            deces: technicalDetails.deces.compagnie,
            ia: technicalDetails.invalidite.compagnie,
            lf: technicalDetails.liberation.compagnie,
            company: technicalDetails.epargne.compagnie
          }
        })
      }).catch(err => console.error("Erreur API Email:", err));

      setCurrentStepIndex(stepsSequence.indexOf(5));

    } catch (error) {
      console.error("Erreur globale:", error);
      alert(t("error_global"));
    }
  };

  const getProjectedCapital = (rate: number) => {
    const annualContribution = monthlySavings * 12;
    const initialCapital = analysisData?.transfertAmount || 0;
    const r = rate / 100;
    const n = horizon;
    
    if (r === 0) return initialCapital + (annualContribution * n);
    return initialCapital * Math.pow(1 + r, n) + annualContribution * ((Math.pow(1 + r, n) - 1) / r);
  };

  const formatCHF = (val: number) => {
    return new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(val);
  };

  const nextStep = () => setCurrentStepIndex((prev) => Math.min(prev + 1, stepsSequence.length - 1));
  const prevStep = () => setCurrentStepIndex((prev) => Math.max(prev - 1, 0));

  const handleBackNavigation = () => {
    if (isFirstStep || step === 5) {
      onClose();
    } else if (step === "risk_profile" && lsfinStep > 0) {
      setLsfinStep((prev) => prev - 1);
    } else {
      prevStep();
    }
  };

  const isCurrentStepDisabled = () => {
    // Étape 1 = disclaimer informatif : on peut toujours continuer.
    if (step === "risk_profile" && (
        expAssurance === null || expFonds === null || revenuMensuel === null || 
        engagements === null || fortuneGlobale === null || fortuneLiquide === null || evolutionRevenus === null || 
        epargnePourcent === null || depensesPrevues === null || reserveMois === null || 
        personnesCharge === null || horizonLong === null || perteAcceptable === null || 
        objectifRendement === null || scenario === null || reactionBaisse === null || 
        critereESG === null
    )) return true;
    if (step === 2 && riskProfile === null) return true;
    if (step === 3 && (isSmoker === null || !height || !weight || !healthOk)) return true;
    if (step === 4 && !isStep4Valid) return true;
    return false;
  };

  const isFirstStep = currentStepIndex === 0;

  const handleLsfinAnswer = (setter: any, value: any) => {
    setter(value);
    setTimeout(() => {
      if (lsfinStep < 16) { 
        setLsfinStep((prev) => prev + 1);
      }
    }, 350); 
  };

  const renderLsfinQuestion = () => {
    switch (lsfinStep) {
      case 0: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q1_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q1_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q1_opt1")} selected={expAssurance === true} onClick={() => handleLsfinAnswer(setExpAssurance, true)} />
                  <SelectionCard label={t("lsfin.q1_opt2")} selected={expAssurance === false} onClick={() => handleLsfinAnswer(setExpAssurance, false)} />
              </div>
          </div>
      );
      case 1: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q2_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q2_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q2_opt1")} selected={expFonds === true} onClick={() => handleLsfinAnswer(setExpFonds, true)} />
                  <SelectionCard label={t("lsfin.q2_opt2")} selected={expFonds === false} onClick={() => handleLsfinAnswer(setExpFonds, false)} />
              </div>
          </div>
      );
      case 2: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q3_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q3_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q3_opt1")} selected={revenuMensuel === "<4000"} onClick={() => handleLsfinAnswer(setRevenuMensuel, "<4000")} small />
                  <SelectionCard label={t("lsfin.q3_opt2")} selected={revenuMensuel === "4000-6000"} onClick={() => handleLsfinAnswer(setRevenuMensuel, "4000-6000")} small />
                  <SelectionCard label={t("lsfin.q3_opt3")} selected={revenuMensuel === "6000-9000"} onClick={() => handleLsfinAnswer(setRevenuMensuel, "6000-9000")} small />
                  <SelectionCard label={t("lsfin.q3_opt4")} selected={revenuMensuel === "9000-12000"} onClick={() => handleLsfinAnswer(setRevenuMensuel, "9000-12000")} small />
                  <SelectionCard label={t("lsfin.q3_opt5")} selected={revenuMensuel === ">12000"} onClick={() => handleLsfinAnswer(setRevenuMensuel, ">12000")} small />
              </div>
          </div>
      );
      case 3: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q4_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q4_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q4_opt1")} selected={engagements === "<2000"} onClick={() => handleLsfinAnswer(setEngagements, "<2000")} small />
                  <SelectionCard label={t("lsfin.q4_opt2")} selected={engagements === "2000-3000"} onClick={() => handleLsfinAnswer(setEngagements, "2000-3000")} small />
                  <SelectionCard label={t("lsfin.q4_opt3")} selected={engagements === "3000-5000"} onClick={() => handleLsfinAnswer(setEngagements, "3000-5000")} small />
                  <SelectionCard label={t("lsfin.q4_opt4")} selected={engagements === "5000-8000"} onClick={() => handleLsfinAnswer(setEngagements, "5000-8000")} small />
                  <SelectionCard label={t("lsfin.q4_opt5")} selected={engagements === ">8000"} onClick={() => handleLsfinAnswer(setEngagements, ">8000")} small />
              </div>
          </div>
      );
      case 4: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q5_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q5_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q5_opt1")} selected={fortuneGlobale === "0"} onClick={() => handleLsfinAnswer(setFortuneGlobale, "0")} small />
                  <SelectionCard label={t("lsfin.q5_opt2")} selected={fortuneGlobale === "<50000"} onClick={() => handleLsfinAnswer(setFortuneGlobale, "<50000")} small />
                  <SelectionCard label={t("lsfin.q5_opt3")} selected={fortuneGlobale === "50000-249999"} onClick={() => handleLsfinAnswer(setFortuneGlobale, "50000-249999")} small />
                  <SelectionCard label={t("lsfin.q5_opt4")} selected={fortuneGlobale === "250000-999999"} onClick={() => handleLsfinAnswer(setFortuneGlobale, "250000-999999")} small />
                  <SelectionCard label={t("lsfin.q5_opt5")} selected={fortuneGlobale === "1M-3M"} onClick={() => handleLsfinAnswer(setFortuneGlobale, "1M-3M")} small />
                  <SelectionCard label={t("lsfin.q5_opt6")} selected={fortuneGlobale === ">3M"} onClick={() => handleLsfinAnswer(setFortuneGlobale, ">3M")} small />
              </div>
          </div>
      );
      case 5: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q6_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q6_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q6_opt1")} selected={fortuneLiquide === "<50000"} onClick={() => handleLsfinAnswer(setFortuneLiquide, "<50000")} small />
                  <SelectionCard label={t("lsfin.q6_opt2")} selected={fortuneLiquide === "50000-100000"} onClick={() => handleLsfinAnswer(setFortuneLiquide, "50000-100000")} small />
                  <SelectionCard label={t("lsfin.q6_opt3")} selected={fortuneLiquide === "100000-250000"} onClick={() => handleLsfinAnswer(setFortuneLiquide, "100000-250000")} small />
                  <SelectionCard label={t("lsfin.q6_opt4")} selected={fortuneLiquide === "250000-1000000"} onClick={() => handleLsfinAnswer(setFortuneLiquide, "250000-1000000")} small />
                  <SelectionCard label={t("lsfin.q6_opt5")} selected={fortuneLiquide === ">1000000"} onClick={() => handleLsfinAnswer(setFortuneLiquide, ">1000000")} small />
              </div>
          </div>
      );
      case 6: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q7_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q7_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q7_opt1")} selected={evolutionRevenus === "hausse"} onClick={() => handleLsfinAnswer(setEvolutionRevenus, "hausse")} />
                  <SelectionCard label={t("lsfin.q7_opt2")} selected={evolutionRevenus === "stable"} onClick={() => handleLsfinAnswer(setEvolutionRevenus, "stable")} />
                  <SelectionCard label={t("lsfin.q7_opt3")} selected={evolutionRevenus === "baisse"} onClick={() => handleLsfinAnswer(setEvolutionRevenus, "baisse")} />
              </div>
          </div>
      );
      case 7: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q8_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q8_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q8_opt1")} selected={epargnePourcent === "0%"} onClick={() => handleLsfinAnswer(setEpargnePourcent, "0%")} />
                  <SelectionCard label={t("lsfin.q8_opt2")} selected={epargnePourcent === "<10%"} onClick={() => handleLsfinAnswer(setEpargnePourcent, "<10%")} />
                  <SelectionCard label={t("lsfin.q8_opt3")} selected={epargnePourcent === "10-20%"} onClick={() => handleLsfinAnswer(setEpargnePourcent, "10-20%")} />
                  <SelectionCard label={t("lsfin.q8_opt4")} selected={epargnePourcent === ">20%"} onClick={() => handleLsfinAnswer(setEpargnePourcent, ">20%")} />
              </div>
          </div>
      );
      case 8: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q9_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q9_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q9_opt1")} selected={depensesPrevues === "non"} onClick={() => handleLsfinAnswer(setDepensesPrevues, "non")} />
                  <SelectionCard label={t("lsfin.q9_opt2")} selected={depensesPrevues === "<20%"} onClick={() => handleLsfinAnswer(setDepensesPrevues, "<20%")} />
                  <SelectionCard label={t("lsfin.q9_opt3")} selected={depensesPrevues === "20-40%"} onClick={() => handleLsfinAnswer(setDepensesPrevues, "20-40%")} />
                  <SelectionCard label={t("lsfin.q9_opt4")} selected={depensesPrevues === ">40%"} onClick={() => handleLsfinAnswer(setDepensesPrevues, ">40%")} />
              </div>
          </div>
      );
      case 9: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q10_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q10_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q10_opt1")} selected={reserveMois === "<3"} onClick={() => handleLsfinAnswer(setReserveMois, "<3")} />
                  <SelectionCard label={t("lsfin.q10_opt2")} selected={reserveMois === "3-6"} onClick={() => handleLsfinAnswer(setReserveMois, "3-6")} />
                  <SelectionCard label={t("lsfin.q10_opt3")} selected={reserveMois === "7-12"} onClick={() => handleLsfinAnswer(setReserveMois, "7-12")} />
                  <SelectionCard label={t("lsfin.q10_opt4")} selected={reserveMois === ">12"} onClick={() => handleLsfinAnswer(setReserveMois, ">12")} />
              </div>
          </div>
      );
      case 10: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q11_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q11_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q11_opt1")} selected={personnesCharge === "0"} onClick={() => handleLsfinAnswer(setPersonnesCharge, "0")} small />
                  <SelectionCard label={t("lsfin.q11_opt2")} selected={personnesCharge === "1"} onClick={() => handleLsfinAnswer(setPersonnesCharge, "1")} small />
                  <SelectionCard label={t("lsfin.q11_opt3")} selected={personnesCharge === "2-3"} onClick={() => handleLsfinAnswer(setPersonnesCharge, "2-3")} small />
                  <SelectionCard label={t("lsfin.q11_opt4")} selected={personnesCharge === "4-5"} onClick={() => handleLsfinAnswer(setPersonnesCharge, "4-5")} small />
                  <SelectionCard label={t("lsfin.q11_opt5")} selected={personnesCharge === ">5"} onClick={() => handleLsfinAnswer(setPersonnesCharge, ">5")} small />
              </div>
          </div>
      );
      case 11: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q12_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q12_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q12_opt1")} selected={horizonLong === true} onClick={() => handleLsfinAnswer(setHorizonLong, true)} />
                  <SelectionCard label={t("lsfin.q12_opt2")} selected={horizonLong === false} onClick={() => handleLsfinAnswer(setHorizonLong, false)} />
              </div>
          </div>
      );
      case 12: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q13_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q13_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q13_opt1")} selected={perteAcceptable === "minime"} onClick={() => handleLsfinAnswer(setPerteAcceptable, "minime")} />
                  <SelectionCard label={t("lsfin.q13_opt2")} selected={perteAcceptable === "moderee"} onClick={() => handleLsfinAnswer(setPerteAcceptable, "moderee")} />
                  <SelectionCard label={t("lsfin.q13_opt3")} selected={perteAcceptable === "importante"} onClick={() => handleLsfinAnswer(setPerteAcceptable, "importante")} />
                  <SelectionCard label={t("lsfin.q13_opt4")} selected={perteAcceptable === "elevee"} onClick={() => handleLsfinAnswer(setPerteAcceptable, "elevee")} />
              </div>
          </div>
      );
      case 13: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q14_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q14_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q14_opt1")} selected={objectifRendement === "securite"} onClick={() => handleLsfinAnswer(setObjectifRendement, "securite")} />
                  <SelectionCard label={t("lsfin.q14_opt2")} selected={objectifRendement === "prudent"} onClick={() => handleLsfinAnswer(setObjectifRendement, "prudent")} />
                  <SelectionCard label={t("lsfin.q14_opt3")} selected={objectifRendement === "equilibre"} onClick={() => handleLsfinAnswer(setObjectifRendement, "equilibre")} />
                  <SelectionCard label={t("lsfin.q14_opt4")} selected={objectifRendement === "dynamique"} onClick={() => handleLsfinAnswer(setObjectifRendement, "dynamique")} />
              </div>
          </div>
      );
      case 14: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q15_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q15_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q15_opt1")} selected={scenario === "1"} onClick={() => handleLsfinAnswer(setScenario, "1")} small />
                  <SelectionCard label={t("lsfin.q15_opt2")} selected={scenario === "2"} onClick={() => handleLsfinAnswer(setScenario, "2")} small />
                  <SelectionCard label={t("lsfin.q15_opt3")} selected={scenario === "3"} onClick={() => handleLsfinAnswer(setScenario, "3")} small />
                  <SelectionCard label={t("lsfin.q15_opt4")} selected={scenario === "4"} onClick={() => handleLsfinAnswer(setScenario, "4")} small />
                  <SelectionCard label={t("lsfin.q15_opt5")} selected={scenario === "5"} onClick={() => handleLsfinAnswer(setScenario, "5")} small />
              </div>
          </div>
      );
      case 15: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q16_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q16_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q16_opt1")} selected={reactionBaisse === "vente_totale"} onClick={() => handleLsfinAnswer(setReactionBaisse, "vente_totale")} />
                  <SelectionCard label={t("lsfin.q16_opt2")} selected={reactionBaisse === "vente_partielle"} onClick={() => handleLsfinAnswer(setReactionBaisse, "vente_partielle")} />
                  <SelectionCard label={t("lsfin.q16_opt3")} selected={reactionBaisse === "attente"} onClick={() => handleLsfinAnswer(setReactionBaisse, "attente")} />
                  <SelectionCard label={t("lsfin.q16_opt4")} selected={reactionBaisse === "achat"} onClick={() => handleLsfinAnswer(setReactionBaisse, "achat")} />
              </div>
          </div>
      );
      case 16: return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">{t("lsfin.q17_title")}</h3>
              <p className="text-xl font-bold leading-tight text-slate-900">{t("lsfin.q17_desc")}</p>
              <div className="grid grid-cols-1 gap-3 mt-4">
                  <SelectionCard label={t("lsfin.q17_opt1")} selected={critereESG === "non"} onClick={() => handleLsfinAnswer(setCritereESG, "non")} />
                  <SelectionCard label={t("lsfin.q17_opt2")} selected={critereESG === "esg"} onClick={() => handleLsfinAnswer(setCritereESG, "esg")} />
                  <SelectionCard label={t("lsfin.q17_opt3")} selected={critereESG === "strict"} onClick={() => handleLsfinAnswer(setCritereESG, "strict")} />
              </div>
          </div>
      );
      default: return null;
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="bg-white text-slate-900 h-screen w-screen border-none outline-none shadow-none rounded-none p-0 m-0 overflow-hidden font-sans flex flex-col focus:outline-none focus:ring-0">
        <div className="sr-only">
          <DrawerTitle>Souscription CreditX</DrawerTitle>
        </div>

        <div className="flex items-center justify-between px-6 py-6 border-b border-slate-100 shrink-0 bg-white z-10">
          <button onClick={handleBackNavigation} className="text-slate-400 hover:text-black transition-colors bg-white">
            {(isFirstStep || step === 5) ? <X size={28} /> : <ChevronLeft size={28} />}
          </button>
          
          <div className="flex gap-1.5">
            {step !== 5 && Array.from({ length: stepsSequence.length - 1 }).map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 w-8 rounded-full transition-all duration-300 ${i <= currentStepIndex ? 'bg-black' : 'bg-slate-100'}`} 
              />
            ))}
          </div>
          <div className="w-8" />
        </div>

        <div className="flex-1 overflow-y-auto px-10 py-12 flex flex-col bg-white">
          
          <div className="flex-1">
            {step === 1 && (
              <div className="max-w-xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white">
                <div className="space-y-2">
                  <h1 className="text-3xl font-black tracking-tight text-slate-900">{t("step1.title")}</h1>
                  <p className="text-slate-500 font-medium leading-relaxed">
                    {t.rich("step1.desc", {
                      amount: formatCHF(monthlySavings),
                      years: horizon,
                      b: (chunks) => <span className="text-black font-black text-xl">{chunks}</span>,
                      horizon: (chunks) => <span className="text-black font-bold">{chunks}</span>
                    })}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-6 rounded-[32px] flex gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-black text-white">
                    <span className="material-symbols-rounded" style={{ fontVariationSettings: "'FILL' 1" }}>hourglass_top</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-tighter text-slate-400 mb-1">{t("step1.disclaimer_title")}</p>
                    <p className="text-sm font-bold leading-snug text-slate-800">{t("step1.disclaimer_body")}</p>
                  </div>
                </div>
              </div>
            )}

            {step === "risk_profile" && (
              <div className="max-w-2xl mx-auto flex flex-col h-full bg-white space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="space-y-4 shrink-0">
                  <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-black tracking-tight text-slate-900">{t("lsfin.title")}</h1>
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#816DEC] bg-[#816DEC]/10 px-3 py-1 rounded-full">
                      {lsfinStep + 1} / 17
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-[#816DEC] h-full transition-all duration-500 ease-out" style={{ width: `${((lsfinStep + 1) / 17) * 100}%` }}></div>
                  </div>
                  <p className="text-slate-500 font-medium leading-relaxed">
                    {t("lsfin.desc")}
                  </p>
                </div>

                <div className="flex-1 flex flex-col justify-start">
                  {renderLsfinQuestion()}
                </div>
              </div>
            )}
            
            {step === 2 && (
              <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 bg-white">
                <div className="space-y-2">
                  <h1 className="text-3xl font-black tracking-tight text-slate-900">{t("step2.title")}</h1>
                  <p className="text-slate-500 font-medium leading-relaxed">
                    {t("step2.desc")}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <RiskOption title={t("step2.opt_safe")} description={t("step2.opt_safe_desc")} yield_rate={0.5} projection={getProjectedCapital(0.5)} selected={riskProfile === 'safe'} icon="shield" color="slate" onClick={() => setRiskProfile("safe")} formatCHF={formatCHF} t={t} />
                  <RiskOption title={t("step2.opt_prud")} description={t("step2.opt_prud_desc")} yield_rate={2.5} projection={getProjectedCapital(2.5)} selected={riskProfile === 'conservative'} icon="account_balance" color="blue" onClick={() => setRiskProfile("conservative")} formatCHF={formatCHF} t={t} />
                  <RiskOption title={t("step2.opt_bal")} description={t("step2.opt_bal_desc")} yield_rate={4.5} projection={getProjectedCapital(4.5)} selected={riskProfile === 'balanced'} icon="balance" color="indigo" onClick={() => setRiskProfile("balanced")} formatCHF={formatCHF} t={t} />
                  <RiskOption title={t("step2.opt_dyn")} description={t("step2.opt_dyn_desc")} yield_rate={7.0} projection={getProjectedCapital(7.0)} selected={riskProfile === 'growth'} icon="trending_up" color="black" onClick={() => setRiskProfile("growth")} formatCHF={formatCHF} t={t} />
                </div>

                {riskProfile === "safe" && (
                  <div className="bg-slate-50 border border-slate-100 p-6 rounded-[32px] flex gap-4 animate-in zoom-in-95 duration-300 mt-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-blue-600 text-white">
                      <span className="material-symbols-rounded" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-tighter text-slate-400 mb-1">{t("step2.advice_title")}</p>
                      <p className="text-sm font-bold leading-snug text-slate-800">
                        {t("step2.advice_desc")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="max-w-xl mx-auto space-y-10 animate-in fade-in slide-in-from-right-4 duration-500 bg-white">
                <div className="space-y-2">
                  <h1 className="text-3xl font-black tracking-tight text-slate-900">{t("step3.title")}</h1>
                  <p className="text-slate-500 font-medium">{t("step3.desc")}</p>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step3.q_smoker")}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <SelectionCard label={t("step3.opt_smoker_no")} selected={isSmoker === false} onClick={() => setIsSmoker(false)} />
                    <SelectionCard label={t("step3.opt_smoker_yes")} selected={isSmoker === true} onClick={() => setIsSmoker(true)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step3.q_height")}</p>
                    <input type="number" placeholder="175" value={height} onChange={(e) => setHeight(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-xl text-slate-900 outline-none focus:border-black transition-all shadow-none" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step3.q_weight")}</p>
                    <input type="number" placeholder="75" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-xl text-slate-900 outline-none focus:border-black transition-all shadow-none" />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <button 
                    onClick={() => setHealthOk(healthOk === true ? null : true)}
                    className={`w-full p-6 rounded-[24px] border-2 transition-all flex items-center gap-4 text-left ${healthOk ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${healthOk ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300'}`}>
                      <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>check</span>
                    </div>
                    <p className="text-xs font-bold leading-tight">{t("step3.confirm_health")}</p>
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 bg-white">
                <div className="space-y-2">
                  <h1 className="text-3xl font-black tracking-tight text-slate-900">{t("step4.title")}</h1>
                  <p className="text-slate-500 font-medium">{t("step4.desc")}</p>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step4.lbl_fn")}</p>
                      <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-black transition-all shadow-none" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step4.lbl_ln")}</p>
                      <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-black transition-all shadow-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step4.lbl_phone")}</p>
                      <input type="tel" placeholder="07x xxx xx xx" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-black transition-all shadow-none" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step4.lbl_prof")}</p>
                      <input type="text" placeholder="ex: Architecte" value={profession} onChange={(e) => setProfession(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-black transition-all shadow-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step4.lbl_addr")}</p>
                    <input type="text" placeholder="Rue, n°, Code postal, Ville" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-black transition-all shadow-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step4.lbl_nat")}</p>
                      <div className="relative">
                        <select 
                          value={nationality} 
                          onChange={(e) => setNationality(e.target.value)} 
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-black transition-all shadow-none appearance-none"
                        >
                          <option value="">{t("step4.opt_select")}</option>
                          {optionsPays.map((pays) => (
                            <option key={pays.id} value={pays.id}>{pays.label}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                          <ChevronLeft size={16} className="-rotate-90" />
                        </div>
                      </div>
                    </div>
                    {nationality && nationality.toLowerCase() !== "suisse" && nationality.toLowerCase() !== "ch" && (
                      <div className="space-y-2 animate-in fade-in zoom-in-95 duration-300">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("step4.lbl_permit")}</p>
                        <div className="relative">
                          <select value={permit} onChange={(e) => setPermit(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-black transition-all shadow-none appearance-none">
                            <option value="">{t("step4.opt_select")}</option>
                            <option value="B">{t("step4.permit_b")}</option>
                            <option value="C">{t("step4.permit_c")}</option>
                            <option value="G">{t("step4.permit_g")}</option>
                            <option value="L">{t("step4.permit_l")}</option>
                            <option value="Ci">{t("step4.permit_ci")}</option>
                            <option value="Autre">{t("step4.permit_other")}</option>
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <ChevronLeft size={16} className="-rotate-90" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

            {step === 5 && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-8 animate-in zoom-in-95 fade-in duration-700 bg-white">
                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-500 shadow-xl shadow-emerald-500/20 mt-8">
                  <span className="material-symbols-rounded" style={{ fontSize: '56px', fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                </div>
                
                <div className="space-y-3 px-4">
                  <h1 className="text-4xl font-black tracking-tighter text-slate-900">{t("step5.title")}</h1>
                  <p className="text-slate-500 font-medium leading-relaxed max-w-sm mx-auto">
                    {t.rich("step5.desc", {
                      name: firstName,
                      b: (chunks) => <span className="text-black font-bold">{chunks}</span>
                    })}
                  </p>
                </div>

                <div className="w-full max-w-xs space-y-6 mx-auto">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 space-y-2">
                    <p>{t("step5.recap", { recommendation: `${recommendation} ${hasSavings && riskProfile ? `• ${riskProfile}` : ''}` })}</p>
                    {hasSavings && analysisData?.sol?.isSpillover && (
                       <div className="pt-2 border-t border-slate-200 mt-2 text-slate-500">
                         <p className="flex justify-between"><span>{t("step5.pillar_3a")}</span> <span>{formatCHF(analysisData.sol.split3a)}/m</span></p>
                         <p className="flex justify-between"><span>{t("step5.pillar_3b")}</span> <span>{formatCHF(analysisData.sol.split3b)}/m</span></p>
                       </div>
                    )}
                  </div>

                  <div className="px-2">
                    <p className="text-[9px] leading-relaxed text-slate-400 text-justify">
                      {t.rich("step5.note", {
                        note: (chunks) => <span className="font-bold">{chunks}</span>
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-12 max-w-xl mx-auto w-full pt-8 border-t border-slate-100 bg-white">
             <Button 
                onClick={currentStepIndex === stepsSequence.length - 2 ? handleFinalSubmit : step === 5 ? () => router.push(basePath) : nextStep}
                disabled={isCurrentStepDisabled()}
                className={`w-full py-8 rounded-[32px] font-black text-lg shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100 ${step === 5 ? 'bg-emerald-500 text-white' : 'bg-black text-white'}`}
             >
                {currentStepIndex === stepsSequence.length - 2 
                  ? t("buttons.confirm") 
                  : step === 5 
                    ? t("buttons.back_dash") 
                    : (step === "risk_profile" && lsfinStep < 16)
                      ? t("buttons.select_answer")
                      : t("buttons.continue")
                }
             </Button>
          </div>

        </div>
      </DrawerContent>
    </Drawer>
  );
}

function SelectionCard({ label, selected, onClick, small = false }: { label: string, selected: boolean, onClick: () => void, small?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`rounded-[24px] text-left border-2 transition-all duration-200 outline-none focus:outline-none ${small ? 'p-4' : 'p-6 rounded-[32px]'} ${
        selected 
          ? 'border-black bg-black text-white shadow-md scale-[1.02]' 
          : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
      }`}
    >
      <p className={`${small ? 'text-xs font-bold' : 'font-black'} leading-tight`}>{label}</p>
    </button>
  );
}

function RiskOption({ title, description, yield_rate, projection, selected, icon, color, onClick, formatCHF, t }: any) {
  const colorMap: any = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-100 text-blue-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    black: 'bg-black text-white'
  };

  return (
    <button 
      onClick={onClick}
      className={`p-5 rounded-[28px] border-2 transition-all flex items-center gap-4 text-left outline-none focus:outline-none ${selected ? 'border-black bg-white shadow-xl scale-[1.02]' : 'border-slate-50 bg-slate-50/50 opacity-70 hover:opacity-100 hover:border-slate-100'}`}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${selected ? colorMap[color] : 'bg-white text-slate-400'}`}>
        <span className="material-symbols-rounded" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <p className="font-black text-lg text-slate-900">{title}</p>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t("step2.yield_pa", { rate: yield_rate })}</p>
        </div>
        <p className="text-[11px] font-bold text-slate-400 leading-tight mb-2">{description}</p>
        <div className="flex items-center gap-2">
           <p className="text-xs font-black text-slate-900 uppercase">{t("step2.est_capital")}</p>
           <p className={`text-sm font-black ${selected ? 'text-emerald-600' : 'text-slate-600'}`}>{formatCHF(projection)}</p>
        </div>
      </div>
    </button>
  );
}