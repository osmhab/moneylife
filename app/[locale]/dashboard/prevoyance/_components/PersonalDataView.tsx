//app/[locale]/dashboard/prevoyance/_components/PersonalDataView.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Pencil, User, Heart, Briefcase, Calendar,
  ShieldCheck, Activity, MapPin, Plus, Trash2, Phone, GraduationCap
} from "lucide-react";
import { db, auth } from "@/lib/firebase/index"; // Alias mis à jour si besoin
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { toast } from "sonner";

// Helpers & Enums
import { parseMoneyToNumber, formatMoneyDisplay } from "@/lib/core/format"; // Alias mis à jour
import { normalizeDateMask } from "@/lib/core/dates"; // Alias mis à jour

// 👈 NOUVEAU : Imports pour la traduction
import { useTranslations, useLocale } from "next-intl";

/** Âge "aujourd'hui" depuis un masque "dd.MM.yyyy" (null si invalide). */
function ageFromMaskLocal(mask?: string): number | null {
  if (!mask) return null;
  const [d, m, y] = String(mask).split(".").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const mDiff = (now.getMonth() + 1) - m;
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < d)) age--;
  return age;
}

// Liste abrégée pour l'exemple (tu pourras rajouter les 190 pays)
const optionsPaysBase = [
  // 📌 Pays les plus fréquents en premier
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
  // 🌍 Reste du monde (ordre alphabétique)
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

export default function PersonalDataView({ isOpen, onClose, adminUid }: { isOpen: boolean; onClose: () => void; adminUid?: string }) {
  // 👈 NOUVEAU : Récupération des traductions et de la locale
  const t = useTranslations("PersonalDataView");
  const locale = useLocale();

  const [data, setData] = useState<any>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null); // 👈 AJOUT

  const targetUid = adminUid || auth.currentUser?.uid;

  // 👈 NOUVEAU : Génération des options traduites via useMemo
  const optionsSexe = useMemo(() => [
    { id: 0, label: t("opt_male") },
    { id: 1, label: t("opt_female") }
  ], [t]);

  const optionsEtatCivil = useMemo(() => [
    { id: 0, label: t("opt_single") },
    { id: 1, label: t("opt_married") },
    { id: 2, label: t("opt_divorced") },
    { id: 3, label: t("opt_partnership") },
    { id: 4, label: t("opt_cohabitation") },
    { id: 5, label: t("opt_widowed") }
  ], [t]);

  const optionsStatut = useMemo(() => [
    { id: 0, label: t("opt_employee") },
    { id: 1, label: t("opt_self_employed") },
    { id: 2, label: t("opt_unemployed") }
  ], [t]);

  const optionsPermis = useMemo(() => [
    { id: "B", label: t("opt_permit_b") },
    { id: "C", label: t("opt_permit_c") },
    { id: "G", label: t("opt_permit_g") },
    { id: "L", label: t("opt_permit_l") },
    { id: "Ci", label: t("opt_permit_ci") },
    { id: "Autre", label: t("opt_permit_other") }
  ], [t]);

  const optionsPays = useMemo(() => {
    return optionsPaysBase.map(pays => ({
      id: pays.id,
      label: locale === 'de' ? pays.labelDE : pays.labelFR
    }));
  }, [locale]);


  useEffect(() => {
    if (!targetUid || !isOpen) return;
    
    // Écoute des données personnelles
    const unsubData = onSnapshot(doc(db, "clients", targetUid, "DonneePersonnelles", "current"), (snap) => {
      if (snap.exists()) setData(snap.data());
    });

    // Écoute du document racine pour la photo de profil (Temps réel global)
    const unsubRoot = onSnapshot(doc(db, "clients", targetUid), (snap) => {
      if (snap.exists() && snap.data().photoURL) {
        setPhotoURL(snap.data().photoURL);
      }
    });

    return () => { unsubData(); unsubRoot(); };
  }, [isOpen, targetUid]);

  const handleUpdateDirect = async (key: string, value: any, silent: boolean = false) => {
    if (!targetUid) return;
    try {
      let finalValue = value;
      
      const numericFields = [
        "Enter_salaireAnnuel", 
        "Enter_ageDebutCotisationsAVS", 
        "Enter_npa", 
        "Enter_ijMaladieTaux", 
        "Enter_ijAccidentTaux",
        "Enter_sexe",
        "Enter_etatCivil",
        "Enter_statutProfessionnel"
      ];

      if (numericFields.includes(key)) {
        finalValue = Number(value);
        if (isNaN(finalValue)) finalValue = value; 
      }

      let patch: any = { [key]: finalValue };

      // Logique spécifique AVS
      if (key === "Enter_ageDebutCotisationsAVS") {
        patch.Enter_hasAnnesManquantesAVS = Number(finalValue) > 21;
      }
      
      // Logique spécifique Enfants (mise à jour du tableau)
      if (key.startsWith("enfant_")) {
        const parts = key.split("_");
        const subKey =
          parts[1] === "prenom" ? "Enter_prenom"
          : parts[1] === "formation" ? "Enter_enFormation"
          : "Enter_dateNaissance";
        const index = parseInt(parts[2]);

        const children = [...(data?.Enter_enfants || [])];
        children[index] = { ...children[index], [subKey]: finalValue };
        patch = { Enter_enfants: children };
      }
      
      await setDoc(doc(db, "clients", targetUid, "DonneePersonnelles", "current"), patch, { merge: true });
      
      if (!silent) toast.success(t("toast_updated"));
      setEditingField(null);
    } catch (e) { 
      console.error("Erreur save:", e);
      if (!silent) toast.error(t("toast_err_save")); 
    }
  };

  if (!isOpen) return null;
  
  const isMarried = [1, 3].includes(Number(data?.Enter_etatCivil));
  const isSalarie = Number(data?.Enter_statutProfessionnel) === 0;

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-[#F8F9FB] z-[120] flex flex-col overflow-hidden"
    >
      <div className="px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 bg-[#F8F9FB]/80 backdrop-blur-md z-10">
        <button onClick={onClose} className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white shadow-sm">
          <img 
            src={photoURL || `https://api.dicebear.com/7.x/rings/svg?seed=${targetUid || data?.Enter_prenom || 'User'}&radius=25`} 
            alt="Avatar" 
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 space-y-8 pb-40">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">{t("title")}</h1>

        <Section title={t("sec_identity")}>
          <EditableRow mandatory fieldKey="Enter_prenom" label={t("lbl_firstname")} value={data?.Enter_prenom} icon={<User />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          <EditableRow mandatory fieldKey="Enter_nom" label={t("lbl_lastname")} value={data?.Enter_nom} icon={<User />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          
          <EditableRow mandatory fieldKey="Enter_nationalite" label={t("lbl_nationality")} value={data?.Enter_nationalite} displayValue={optionsPays.find(o => o.id === data?.Enter_nationalite)?.label || data?.Enter_nationalite} type="searchable" options={optionsPays} icon={<MapPin />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          {data?.Enter_nationalite && data.Enter_nationalite !== "Suisse" && (
            <EditableRow mandatory fieldKey="Enter_permisSejour" label={t("lbl_permit")} value={data?.Enter_permisSejour} displayValue={optionsPermis.find(o => o.id === data?.Enter_permisSejour)?.label || data?.Enter_permisSejour} type="select" options={optionsPermis} icon={<ShieldCheck />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          )}

          <EditableRow mandatory fieldKey="Enter_dateNaissance" label={t("lbl_dob")} value={data?.Enter_dateNaissance} type="date" icon={<Calendar />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          <EditableRow mandatory fieldKey="Enter_telephone" label={t("lbl_phone")} value={data?.Enter_telephone} type="tel" icon={<Phone />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          <EditableRow mandatory fieldKey="Enter_sexe" label={t("lbl_gender")} value={data?.Enter_sexe} displayValue={optionsSexe.find(o => o.id === Number(data?.Enter_sexe))?.label} type="select" options={optionsSexe} icon={<User />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          <EditableRow mandatory fieldKey="Enter_etatCivil" label={t("lbl_civil_status")} value={data?.Enter_etatCivil} displayValue={optionsEtatCivil.find(o => o.id === Number(data?.Enter_etatCivil))?.label} type="select" options={optionsEtatCivil} icon={<Heart />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} last />
        </Section>

        {/* ADRESSE */}
        <Section title={t("sec_address")}>
          {editingField === "Enter_adresse" ? (
            <InlineAddressEditor 
              currentValue={data?.Enter_adresse ? [data?.Enter_adresse, `${data?.Enter_npa || ''} ${data?.Enter_localite || ''}`.trim()].filter(Boolean).join(", ") : ""}
              onCancel={() => setEditingField(null)}
              onSave={async (parsedAddress: any) => {
                if (!targetUid) return;
                try {
                  await setDoc(doc(db, "clients", targetUid, "DonneePersonnelles", "current"), parsedAddress, { merge: true });
                  toast.success(t("toast_address_saved"));
                  setEditingField(null);
                } catch (e) {
                  toast.error(t("toast_err_save"));
                }
              }}
            />
          ) : (
            <DetailRow 
              mandatory
              icon={<MapPin />} label={t("lbl_full_address")} 
              value={data?.Enter_adresse || data?.Enter_npa || data?.Enter_localite ? [data?.Enter_adresse, `${data?.Enter_npa || ''} ${data?.Enter_localite || ''}`.trim()].filter(Boolean).join(", ") : null} 
              onClick={() => setEditingField("Enter_adresse")} 
              last 
            />
          )}
        </Section>

        <Section title={t("sec_pro")}>
          <EditableRow mandatory fieldKey="Enter_statutProfessionnel" label={t("lbl_status")} value={data?.Enter_statutProfessionnel} displayValue={optionsStatut.find(o => o.id === Number(data?.Enter_statutProfessionnel))?.label} type="select" options={optionsStatut} icon={<Briefcase />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          <EditableRow mandatory fieldKey="Enter_profession" label={t("lbl_profession")} value={data?.Enter_profession} icon={<Briefcase />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          <EditableRow mandatory fieldKey="Enter_salaireAnnuel" label={t("lbl_salary")} value={data?.Enter_salaireAnnuel} displayValue={data?.Enter_salaireAnnuel ? formatMoneyDisplay(data.Enter_salaireAnnuel) : null} type="money" icon={<Activity />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
          
          <DetailRow icon={<ShieldCheck />} label={t("lbl_lpp")} value={data?.Enter_Affilie_LPP ? t("opt_yes") : t("opt_no")} onClick={() => handleUpdateDirect("Enter_Affilie_LPP", !data?.Enter_Affilie_LPP)} isBoolean boolValue={data?.Enter_Affilie_LPP} />
          {isSalarie && (
            <DetailRow icon={<Activity />} label={t("lbl_hours")} value={data?.Enter_travaillePlusde8HSemaine !== false ? t("opt_yes") : t("opt_no")} onClick={() => handleUpdateDirect("Enter_travaillePlusde8HSemaine", data?.Enter_travaillePlusde8HSemaine === false)} isBoolean boolValue={data?.Enter_travaillePlusde8HSemaine !== false} last />
          )}
        </Section>

        {isMarried && (
          <Section title={t("sec_spouse")}>
            <EditableRow mandatory fieldKey="Enter_spousePrenom" label={t("lbl_spouse_firstname")} value={data?.Enter_spousePrenom} icon={<User />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
            <EditableRow mandatory fieldKey="Enter_spouseSexe" label={t("lbl_spouse_gender")} value={data?.Enter_spouseSexe} displayValue={optionsSexe.find(o => o.id === Number(data?.Enter_spouseSexe))?.label} type="select" options={optionsSexe} icon={<User />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} />
            <EditableRow mandatory fieldKey="Enter_spouseDateNaissance" label={t("lbl_spouse_dob")} value={data?.Enter_spouseDateNaissance} type="date" icon={<Calendar />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} last />
          </Section>
        )}

        <Section title={t("sec_kids")}>
          <div className="px-6 py-4 flex justify-between items-center">
             <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">{t("lbl_family")}</span>
             <button onClick={() => handleUpdateDirect("Enter_enfants", [...(data?.Enter_enfants || []), { Enter_prenom: "", Enter_dateNaissance: "" }])} className="flex items-center space-x-1 text-blue-600 font-bold text-xs active:scale-95 transition-all">
                <Plus size={14}/> <span>{t("btn_add")}</span>
             </button>
          </div>
          <div className="px-3 pb-4 space-y-4">
            {(data?.Enter_enfants || []).map((kid: any, idx: number) => {
              // Le flag « encore en formation » ne concerne le droit aux rentes (orphelin / conjoint
              // LPP) qu'entre 18 et 25 ans : avant 18 = automatiquement à charge, après 25 = plus de
              // droit. On n'affiche donc le switch QUE dans cette tranche.
              const kidAge = ageFromMaskLocal(kid.Enter_dateNaissance);
              const showFormation = kidAge !== null && kidAge >= 18 && kidAge < 25;
              return (
              <div key={idx} className="bg-slate-50/50 rounded-[24px] border border-slate-100/50 overflow-hidden">
                <div className="px-5 pt-4 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-400">{t("lbl_kid", { num: idx + 1 })}</span>
                  <button onClick={() => {
                    const newList = data.Enter_enfants.filter((_: any, i: number) => i !== idx);
                    handleUpdateDirect("Enter_enfants", newList);
                  }} className="text-red-300"><Trash2 size={14} /></button>
                </div>
                <div className="divide-y divide-slate-100">
                  <EditableRow fieldKey={`enfant_prenom_${idx}`} label={t("lbl_firstname")} value={kid.Enter_prenom} icon={<User />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} noBorder />
                  <EditableRow fieldKey={`enfant_date_${idx}`} label={t("lbl_dob")} value={kid.Enter_dateNaissance} type="date" icon={<Calendar />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} last={!showFormation} />
                  {showFormation && (
                    <DetailRow
                      icon={<GraduationCap />}
                      label={t("lbl_kid_in_training")}
                      value={kid.Enter_enFormation ? t("opt_yes") : t("opt_no")}
                      onClick={() => handleUpdateDirect(`enfant_formation_${idx}`, !kid.Enter_enFormation)}
                      isBoolean
                      boolValue={!!kid.Enter_enFormation}
                      last
                    />
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </Section>

        <Section title={t("sec_avs")}>
          <EditableRow fieldKey="Enter_ageDebutCotisationsAVS" label={t("lbl_avs_start")} value={data?.Enter_ageDebutCotisationsAVS || 21} displayValue={`${data?.Enter_ageDebutCotisationsAVS || 21} ans`} type="number" icon={<Calendar />} editingField={editingField} setEditingField={setEditingField} onSave={handleUpdateDirect} last />
          <div className="px-6 py-4 bg-slate-50/50">
            <div className="flex justify-between items-center italic">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">{t("lbl_avs_start_year")}</span>
              <span className="text-[13px] font-black text-[#1a4f8a]">{data?.Enter_anneeDebutCotisationAVS || "—"}</span>
            </div>
          </div>
        </Section>

        <Section title={t("sec_ij")}>
          <SliderRow label={t("lbl_ij_illness")} value={data?.Enter_ijMaladieTaux ?? 80} min={0} max={100} onChange={(val: number) => handleUpdateDirect("Enter_ijMaladieTaux", val, true)} />
          <SliderRow label={t("lbl_ij_accident")} value={data?.Enter_ijAccidentTaux ?? 80} min={80} max={100} onChange={(val: number) => handleUpdateDirect("Enter_ijAccidentTaux", val, true)} last />
        </Section>
      </div>
    </motion.div>
  );
}

// ----------------------------------------------------
// SOUS-COMPOSANTS INLINE 
// ----------------------------------------------------

function EditableRow({ fieldKey, label, value, displayValue, icon, type = "text", options, last, noBorder, editingField, setEditingField, onSave, mandatory }: any) {
  if (editingField === fieldKey) {
    return (
      <InlineEditor 
        type={type} 
        currentValue={value} 
        options={options} 
        label={label} 
        onSave={(val: any) => onSave(fieldKey, val)} 
        onCancel={() => setEditingField(null)} 
      />
    );
  }

  return (
    <DetailRow 
      icon={icon} 
      label={label} 
      value={displayValue !== undefined ? displayValue : value} 
      onClick={() => setEditingField(fieldKey)} 
      last={last} 
      noBorder={noBorder} 
      mandatory={mandatory}
    />
  );
}

function InlineEditor({ type, currentValue, options, label, onSave, onCancel }: any) {
  const t = useTranslations("PersonalDataView");
  const [val, setVal] = useState(currentValue || "");
  const [searchTerm, setSearchTerm] = useState(""); 
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (type !== 'select') {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let text = e.target.value;
    if (type === "date") text = normalizeDateMask(text);
    setVal(text);
  };

  const handleSaveClick = () => {
    let finalVal = val;
    if (type === "money") finalVal = parseMoneyToNumber(String(val));
    onSave(finalVal);
  };

  const filteredOptions = type === 'searchable' && options 
    ? options.filter((opt: any) => opt.label.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10)
    : options;

  return (
    <div className="p-4 bg-slate-50/50 border-b border-slate-50 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] font-bold uppercase text-[#1a4f8a] leading-none">{label}</span>
      </div>
      
      {type === 'searchable' ? (
        <div className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="text"
            placeholder={t("ph_search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-[#1a4f8a]"
          />
          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1 scrollbar-hide">
            {filteredOptions.length > 0 ? filteredOptions.map((opt: any) => (
              <button
                key={opt.id}
                onClick={() => onSave(opt.id)}
                className={`py-3 px-4 rounded-xl text-sm font-bold border text-left transition-all ${
                  currentValue === opt.id
                    ? 'bg-[#1a4f8a] text-white border-[#1a4f8a]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[#1a4f8a]'
                }`}
              >
                {opt.label}
              </button>
            )) : (
              <p className="text-xs text-slate-400 text-center py-2">{t("txt_no_results")}</p>
            )}
          </div>
          <div className="flex justify-end mt-1">
            <button onClick={onCancel} className="text-[11px] font-black uppercase text-slate-400 px-3 py-2">{t("btn_cancel")}</button>
          </div>
        </div>
      ) : type === 'select' ? (
        <div className="flex flex-col gap-2">
          {options.map((opt: any) => (
            <button
              key={opt.id}
              onClick={() => onSave(opt.id)}
              className={`py-3 px-4 rounded-xl text-sm font-bold border text-left transition-all ${
                String(currentValue) === String(opt.id)
                  ? 'bg-[#1a4f8a] text-white border-[#1a4f8a]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#1a4f8a]'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="flex justify-end mt-1">
            <button onClick={onCancel} className="text-[11px] font-black uppercase text-slate-400 px-3 py-2">{t("btn_cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type={type === 'tel' ? 'tel' : type === 'number' ? 'number' : 'text'}
            value={val}
            onChange={handleChange}
            placeholder={type === 'date' ? t("ph_date") : ''}
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-[#1a4f8a]"
          />
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="text-[11px] font-black uppercase text-slate-400 px-3 py-2">{t("btn_cancel")}</button>
            <button onClick={handleSaveClick} className="text-[11px] font-black uppercase bg-[#1a4f8a] text-white px-4 py-2 rounded-lg">{t("btn_save")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InlineAddressEditor({ currentValue, onSave, onCancel }: { currentValue: string, onSave: (data: any) => void, onCancel: () => void }) {
  const t = useTranslations("PersonalDataView");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let autocomplete: any;

    const initAutocomplete = () => {
      if (!inputRef.current || !(window as any).google) return;
      
      autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "ch" },
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;

        let street = ""; let streetNumber = ""; let npa = ""; let city = "";
        for (const component of place.address_components) {
          const types = component.types;
          if (types.includes("route")) street = component.long_name;
          if (types.includes("street_number")) streetNumber = component.long_name;
          if (types.includes("postal_code")) npa = component.long_name;
          if (types.includes("locality")) city = component.long_name;
        }

        onSave({ Enter_adresse: `${street} ${streetNumber}`.trim(), Enter_npa: Number(npa) || "", Enter_localite: city });
      });
    };

    if (!(window as any).google) {
      const scriptId = "google-maps-places-script";
      let script = document.getElementById(scriptId) as HTMLScriptElement;

      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyB5FQA2rgliDm_E2j4vsss_FmDXFU9_fY8";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", initAutocomplete);
      return () => script.removeEventListener("load", initAutocomplete);
    } else {
      initAutocomplete();
    }
  }, [onSave]);

  return (
    <div className="p-4 bg-slate-50/50 border-b border-slate-50 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] font-bold uppercase text-[#1a4f8a] leading-none">{t("lbl_search_address")}</span>
      </div>
      <input 
        ref={inputRef} type="text" defaultValue={currentValue} placeholder={t("ph_address_example")}
        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-[#1a4f8a]"
      />
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="text-[11px] font-black uppercase text-slate-400 px-3 py-2">{t("btn_cancel")}</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// SOUS-COMPOSANTS UI STATIQUES
// ----------------------------------------------------
function Section({ title, children }: any) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-2">{title}</h3>
      <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-50">{children}</div>
    </div>
  );
}

function DetailRow({ icon, label, value, onClick, last, isBoolean, boolValue, noBorder, mandatory }: any) {
  const t = useTranslations("PersonalDataView");
  const isMissing = mandatory && (value === undefined || value === null || value === "");

  return (
    <div onClick={onClick} className={`flex items-center justify-between p-5 active:bg-slate-50 transition-colors cursor-pointer ${(!last && !noBorder) ? 'border-b border-slate-50' : ''} ${isMissing ? 'bg-red-50/40' : ''}`}>
      <div className="flex items-center space-x-4 overflow-hidden">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${isBoolean && boolValue ? 'bg-green-50 text-green-500' : isMissing ? 'bg-red-100 text-red-500 border border-red-200' : 'bg-white shadow-sm border border-slate-100 text-slate-400'}`}>
          {React.cloneElement(icon, { size: 18 })}
        </div>
        <div className="text-left overflow-hidden">
          <p className={`text-[11px] font-bold uppercase leading-none mb-1 ${isMissing ? 'text-red-500' : 'text-slate-400'}`}>
            {label} {mandatory && "*"}
          </p>
          <p className={`text-[15px] font-black leading-tight truncate ${isMissing ? 'text-red-600 italic' : 'text-slate-900'}`}>
            {value || t("txt_to_complete")}
          </p>
        </div>
      </div>
      <div className="shrink-0 ml-4">
        {isBoolean ? (
          <div className={`w-12 h-6 rounded-full transition-all relative ${boolValue ? 'bg-green-500' : 'bg-slate-200'}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${boolValue ? 'left-7' : 'left-1'}`} />
          </div>
        ) : (
          <Pencil size={14} className={isMissing ? "text-red-400" : "text-slate-200"} />
        )}
      </div>
    </div>
  );
}

function SliderRow({ label, value, onChange, last, min = 0, max = 100 }: any) {
  return (
    <div className={`px-6 py-6 space-y-4 ${!last ? 'border-b border-slate-50' : ''}`}>
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-bold uppercase text-slate-400">{label}</span>
        <span className="text-[17px] font-black text-[#1a4f8a]">{value}%</span>
      </div>
      <input type="range" min={min} max={max} step={10} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
    </div>
  );
}