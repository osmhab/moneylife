// lib/regs.ts
// Point d’accès unique aux barèmes locaux.

import avsAi2025 from '@/firestore/regs_avs_ai_2025.json'
import avsSurv2025 from '@/firestore/regs_avs_survivants_2025.json'
import laa2025 from '@/firestore/regs_laa_2025.json'
import lpp2025 from '@/firestore/regs_lpp_2025.json'
import lppSurv2025 from '@/firestore/lpp_survivants_2025.json'

export type AnyJson = Record<string, any>

// ✅ catalogue typé “souple” (évite les erreurs 2536/7053)
type RegsCatalog = Record<string, Record<number, AnyJson>>

const REGS: RegsCatalog = {
  avs_ai: { 2025: avsAi2025 as AnyJson },
  avs_survivants: { 2025: avsSurv2025 as AnyJson },
  laa: { 2025: laa2025 as AnyJson },
  lpp: { 2025: lpp2025 as AnyJson },
  lpp_survivants: { 2025: lppSurv2025 as AnyJson },
}

// choisi l’année demandée, sinon la plus proche ≤ year, sinon la plus récente
function pickYear(pack: Record<number, AnyJson>, year: number): number {
  const ys = Object.keys(pack).map(Number).sort((a,b)=>b-a)
  if (ys.includes(year)) return year
  const lower = ys.find(y => y <= year)
  return lower ?? ys[0]
}

// ✅ renvoie toujours AnyJson (et plus un type “vide” {})
export function getRegs(key: keyof RegsCatalog, year: number): AnyJson {
  const pack = REGS[key]
  const y = pickYear(pack, year)
  return pack[y]
}
