// app/analyse/[id]/_client/LppCertificateEditor.tsx
'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { LppParsed, LppProofs } from '@/lib/layoutTypes';

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { BadgeCheck, UserRoundCheck, Edit3, Save, X, BadgeAlert } from 'lucide-react';

/* ================= Helpers ================= */
const SUCCESS = '#4fd1c5';
const AMBER = '#F59E0B';

function toNumberOrNull(v: string) {
  if (v.trim() === '') return null;
  const n = Number(v.replace(/[’'\u00A0 ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function toStr(v: unknown): string {
  return v == null ? '' : String(v);
}

/* ---- format "25 000" ---- */
function normalizeNumString(s: string): string {
  return s.replace(/[’'\u00A0 ]/g, '').replace(',', '.');
}
function formatWithSpacesFromString(s: string): string {
  const raw = normalizeNumString(s);
  if (raw === '' || isNaN(Number(raw))) return s;
  const neg = raw.startsWith('-');
  const [intPart, decPart] = (neg ? raw.slice(1) : raw).split('.');
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + (decPart ? `${intFmt}.${decPart}` : intFmt);
}
function parseToNumberOrNull(s: string): number | null {
  const raw = normalizeNumString(s);
  if (raw === '' || isNaN(Number(raw))) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function formatSpacesNum(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n as number)) return '';
  return formatWithSpacesFromString(String(n));
}


// Format live "friendly": espace pour milliers, mais conserve '.'/',' en fin de saisie
function formatForTyping(s: string): string {
  // garde le signe & remplace virgule par point pour l'affichage cohérent
  const neg = s.trim().startsWith('-');
  const cleaned = s.replace(/[^\d.,-]/g, '');
  const unified = cleaned.replace(/,/g, '.');

  const endsWithSep = /[.]$/.test(unified);          // finit par un point ?
  const parts = unified.replace(/^-/, '').split('.'); // "1234" | "1234.5" | "1234."
  const intPart = parts[0] || '';
  const decPart = parts[1] ?? '';

  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // 1234 -> 1 234

  if (endsWithSep) return (neg ? '-' : '') + intFmt + '.';      // conserve le point en fin
  if (decPart !== '') return (neg ? '-' : '') + intFmt + '.' + decPart; // garde les décimales tapées
  return (neg ? '-' : '') + intFmt;                             // entier
}


/** Input contrôlé (shadcn) qui affiche des espaces milliers, remonte number|null */
function ThousandsInput({ value, onChangeNum, placeholder, disabled }: {
  value: number | null | undefined;
  onChangeNum: (n: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string>(value == null ? '' : String(value));
  useEffect(() => {
    const next = value == null ? '' : String(value);
    // affichage formaté mais *sans* détruire un éventuel '.' en fin (on ne l'a pas en prop, donc ok)
    setText(formatWithSpacesFromString(next));
  }, [value]);

  return (
    <Input
      className="shadow-none"
      inputMode="decimal"
      pattern="[0-9., -]*"          // autorise . et , au clavier mobile
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        // 1) affichage "friendly" pendant la frappe (garde '.'/',' en fin)
        setText(formatForTyping(raw));
        // 2) valeur numérique envoyée au state parent (null tant que décimale incomplète)
        onChangeNum(parseToNumberOrNull(raw));
      }}
      onBlur={(e) => {
        // normalise proprement à la sortie (espaces & décimales finales)
        const raw = e.target.value;
        setText(formatWithSpacesFromString(raw.replace(/,/g, '.')));
      }}
    />
  );
}


/* ================= Clés & définitions des champs ================= */
type NumericKey = Extract<
  keyof LppParsed,
  | 'salaireDeterminant'
  | 'deductionCoordination'
  | 'salaireAssureEpargne'
  | 'salaireAssureRisque'
  | 'avoirVieillesse'
  | 'avoirVieillesseSelonLpp'
  | 'interetProjetePct'
  | 'renteInvaliditeAnnuelle'
  | 'renteEnfantInvaliditeAnnuelle'
  | 'renteConjointAnnuelle'
  | 'renteOrphelinAnnuelle'
  | 'capitalDeces'
  | 'capitalRetraite65'
  | 'renteRetraite65Annuelle'
  | 'rachatPossible'
  | 'eplDisponible'
>;
type StringKey = Extract<
  keyof LppParsed,
  | 'caisse'
  | 'dateCertificat'
  | 'prenom'
  | 'nom'
  | 'dateNaissance'
  | 'employeur'
>;
type BoolKey = 'miseEnGage';

const IDENTITY_FIELDS: ReadonlyArray<[string, StringKey, string | undefined]> = [
  ['Caisse de pension', 'caisse', 'Saisir…'],
  ['Date du certificat', 'dateCertificat', 'dd.mm.yyyy'],
  ['Prénom', 'prenom', 'Saisir…'],
  ['Nom', 'nom', 'Saisir…'],
  ['Date de naissance', 'dateNaissance', 'dd.mm.yyyy'],
  ['Employeur', 'employeur', 'Saisir…'],
];

const NUM_FIELDS_SALAIRES: ReadonlyArray<[string, NumericKey, string | undefined]> = [
  ['Salaire déterminant', 'salaireDeterminant', 'ex. 59 300'],
  ['Déduction de coordination', 'deductionCoordination', 'ex. 25 725'],
  ['Salaire assuré (Épargne)', 'salaireAssureEpargne', 'ex. 50 411'],
  ['Salaire assuré (Risque)', 'salaireAssureRisque', 'ex. 52 766'],
  ['Avoir de vieillesse (actuel)', 'avoirVieillesse', 'ex. 25 221'],
  ['… dont selon LPP/BVG', 'avoirVieillesseSelonLpp', 'ex. 20 000'],
  ['Taux d’intérêt projeté', 'interetProjetePct', 'ex. 1.5'],
];

const NUM_FIELDS_PRESTATIONS: ReadonlyArray<[string, NumericKey]> = [
  ['Rente d’invalidité (an)', 'renteInvaliditeAnnuelle'],
  ['Rente enfant d’invalide (an)', 'renteEnfantInvaliditeAnnuelle'],
  ['Rente de conjoint (an)', 'renteConjointAnnuelle'],
  ['Rente d’orphelin (an)', 'renteOrphelinAnnuelle'],
  ['Capital décès', 'capitalDeces'],
  ['Capital à la retraite (65 ans)', 'capitalRetraite65'],
  ['Rente à la retraite (65 ans, an)', 'renteRetraite65Annuelle'],
];

const OPTIONS_FIELDS: ReadonlyArray<[string, NumericKey | BoolKey, string | undefined, 'bool' | 'num']> = [
  ['Rachat possible', 'rachatPossible', 'ex. 25 000', 'num'],
  ['EPL disponible', 'eplDisponible', 'ex. 30 000', 'num'],
  ['Mise en gage', 'miseEnGage', undefined, 'bool'],
];

/* ================= États & status par champ ================= */
type FieldState = 'manual_confirmed' | 'scan_confident' | 'scan_uncertain' | 'empty';

function isEmptyVal(v: any) {
  return v === undefined || v === null || v === '';
}
function sameVal(a: any, b: any) {
  const emptyA = a === '' || a == null;
  const emptyB = b === '' || b == null;
  if (emptyA && emptyB) return true;
  return a === b;
}
function computeFieldState(
  field: keyof LppParsed,
  base: LppParsed,
  proofs?: LppProofs | null,
  confidence?: number | null
): FieldState {
  const src = (base.sources || {}) as Record<string, 'ocr' | 'manual'>;
  if (src[field as string] === 'manual') return 'manual_confirmed';
  const val = (base as any)[field];
  if (isEmptyVal(val)) return 'empty';
  const conf = confidence ?? 0.7;
  const hasProof = !!(proofs && (proofs as any)[field as string]);
  if (hasProof || conf >= 0.7) return 'scan_confident';
  return 'scan_uncertain';
}

/* ================= Component ================= */
export default function LppCertificateEditor({
  initial,
  onSaved,
  onDirtyChange,
  onEditingChange,
}: {
  initial: LppParsed;
  onSaved?: (next: LppParsed) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onEditingChange?: (hasEditing: boolean) => void;
}) {
  const [form, setForm] = useState<LppParsed>({ ...initial });
  const [base, setBase] = useState<LppParsed>({ ...initial }); // dernière version sauvegardée
  const [pending, startTransition] = useTransition();

  // édition & pending par champ
  const [editing, setEditing] = useState<Record<string, boolean>>(() => {
    const e: Record<string, boolean> = {};
    const all = [
      ...IDENTITY_FIELDS.map(([, k]) => k),
      ...NUM_FIELDS_SALAIRES.map(([, k]) => k),
      ...NUM_FIELDS_PRESTATIONS.map(([, k]) => k),
      'rachatPossible',
      'eplDisponible',
      'miseEnGage',
    ];
    all.forEach((k) => {
      const v = (initial as any)[k];
      if (isEmptyVal(v)) e[k as string] = true; // champs vides → prêt à saisir
    });
    return e;
  });
  const [rowPending, setRowPending] = useState<Record<string, boolean>>({});

  const proofs = initial.proofs;
  const confidence = initial.confidence ?? 0.7;

  const ALL_KEYS: (StringKey | NumericKey | BoolKey)[] = useMemo(
    () => [
      ...IDENTITY_FIELDS.map(([, k]) => k),
      ...NUM_FIELDS_SALAIRES.map(([, k]) => k),
      ...NUM_FIELDS_PRESTATIONS.map(([, k]) => k),
      'rachatPossible',
      'eplDisponible',
      'miseEnGage',
    ],
    []
  );
  const dirty = useMemo(() => {
    for (const k of ALL_KEYS) {
      if (!sameVal((form as any)[k], (base as any)[k])) return true;
    }
    return false;
  }, [form, base, ALL_KEYS]);
  const hasEditing = useMemo(() => Object.values(editing).some(Boolean), [editing]);

  // notifier le parent
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onEditingChange?.(hasEditing); }, [hasEditing, onEditingChange]);

  const setField = (key: keyof LppParsed, v: any, isNumber = false) => {
    setForm((prev) => {
      const next: LppParsed = {
        ...prev,
        [key]: isNumber && typeof v === 'string' ? toNumberOrNull(v) : v,
      };
      return next;
    });
  };

  const savePatch = (patch: Partial<LppParsed>) =>
    fetch(`/api/lpp/${initial.id}/save`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    });

  const saveLine = (key: keyof LppParsed) => {
    startTransition(async () => {
      try {
        setRowPending((p) => ({ ...p, [String(key)]: true }));
        const patch: Partial<LppParsed> = {
          [key]: (form as any)[key],
          sources: { [String(key)]: 'manual' as const },
        };
        const res = await savePatch(patch);
        const saved: LppParsed = res?.doc || form;
        setBase((prev) => {
          const next = { ...prev };
          (next as any)[key] = (saved as any)[key];
          next.sources = { ...(prev.sources || {}), [String(key)]: 'manual' };
          return next;
        });
        setEditing((e) => ({ ...e, [String(key)]: false }));
        onSaved?.(saved);
      } catch {
        // toast optionnel
      } finally {
        setRowPending((p) => ({ ...p, [String(key)]: false }));
      }
    });
  };

  const cancelLine = (key: keyof LppParsed) => {
    setForm((prev) => {
      const next = { ...prev };
      (next as any)[key] = (base as any)[key] ?? null;
      return next;
    });
    setEditing((e) => ({ ...e, [String(key)]: false }));
  };

  /* ===== Rendu d'une ligne générique ===== */
  type FieldState = 'manual_confirmed' | 'scan_confident' | 'scan_uncertain' | 'empty';
  function RowIcon({ state }: { state: FieldState }) {
    if (state === 'manual_confirmed') {
      return <UserRoundCheck className="h-4 w-4" style={{ color: SUCCESS }} />;
    }
    if (state === 'scan_confident') {
      return <BadgeCheck className="h-4 w-4" style={{ color: SUCCESS }} />;
    }
    return <BadgeAlert className="h-4 w-4" style={{ color: AMBER }} />;
  }
  function ReadValue({ value }: { value: any }) {
    const text = typeof value === 'number' ? formatSpacesNum(value) : toStr(value);
    return <div className="text-sm text-muted-foreground">{text || ''}</div>;
  }
  function ActionCell({
    k,
    isEditing,
    lineChanged,
    onEdit,
    onSave,
    onCancel,
    saving,
  }: {
    k: keyof LppParsed;
    isEditing: boolean;
    lineChanged: boolean;
    onEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    saving?: boolean;
  }) {
    return (
      <TableCell className="w-[190px] text-right">
        {isEditing ? (
          lineChanged ? (
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" className="h-8" onClick={onSave} disabled={!!saving}>
                <Save className="mr-1 h-3.5 w-3.5" />
                Enregistrer
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={onCancel} disabled={!!saving}>
                <X className="mr-1 h-3.5 w-3.5" />
                Annuler
              </Button>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground pr-1">Saisir…</div>
          )
        ) : (
          <Button size="sm" variant="outline" className="h-8" onClick={onEdit}>
            <Edit3 className="mr-1 h-3.5 w-3.5" />
            Éditer
          </Button>
        )}
      </TableCell>
    );
  }

  function renderStringRow(label: string, key: StringKey, placeholder?: string) {
    const state = computeFieldState(key, base, proofs, confidence);
    const isEditing = !!editing[key] || state === 'empty';
    const lineChanged = !sameVal((form as any)[key], (base as any)[key]);

    return (
      <TableRow key={key} className="h-14 align-middle hover:bg-muted/40">
        <TableCell className="w-72">
          <div className="flex items-center gap-2">
            <RowIcon state={state} />
            <span className="text-sm text-gray-700">{label}</span>
          </div>
        </TableCell>
        <TableCell>
          {isEditing ? (
            <Input
              className="shadow-none"
              placeholder={placeholder || 'Saisir…'}
              value={toStr((form as any)[key])}
              onChange={(e) => setField(key, e.target.value)}
            />
          ) : (
            <ReadValue value={(base as any)[key]} />
          )}
        </TableCell>
        <ActionCell
          k={key}
          isEditing={isEditing}
          lineChanged={lineChanged}
          saving={rowPending[String(key)]}
          onEdit={() => setEditing((e) => ({ ...e, [key]: true }))}
          onSave={() => saveLine(key)}
          onCancel={() => cancelLine(key)}
        />
      </TableRow>
    );
  }

  function renderNumberRow(label: string, key: NumericKey, placeholder?: string) {
    const state = computeFieldState(key, base, proofs, confidence);
    const isEditing = !!editing[key] || state === 'empty';
    const lineChanged = !sameVal((form as any)[key], (base as any)[key]);

    return (
      <TableRow key={key} className="h-14 align-middle hover:bg-muted/40">
        <TableCell className="w-72">
          <div className="flex items-center gap-2">
            <RowIcon state={state} />
            <span className="text-sm text-gray-700">{label}</span>
          </div>
        </TableCell>
        <TableCell>
          {isEditing ? (
            <ThousandsInput
              value={(form as any)[key] as number | null}
              onChangeNum={(n) => setField(key, n, true)}
              placeholder={placeholder}
            />
          ) : (
            <ReadValue value={(base as any)[key]} />
          )}
        </TableCell>
        <ActionCell
          k={key}
          isEditing={isEditing}
          lineChanged={lineChanged}
          saving={rowPending[String(key)]}
          onEdit={() => setEditing((e) => ({ ...e, [key]: true }))}
          onSave={() => saveLine(key)}
          onCancel={() => cancelLine(key)}
        />
      </TableRow>
    );
  }

  function renderBoolRow(label: string, key: BoolKey) {
    const state = computeFieldState(key, base, proofs, confidence);
    const isEditing = !!editing[key] || state === 'empty';
    const lineChanged = !sameVal((form as any)[key], (base as any)[key]);

    const val = (form as any)[key] as boolean | null | undefined;
    const display = val == null ? '' : val ? 'Oui' : 'Non';

    return (
      <TableRow key={key} className="h-14 align-middle hover:bg-muted/40">
        <TableCell className="w-72">
          <div className="flex items-center gap-2">
            <RowIcon state={state} />
            <span className="text-sm text-gray-700">{label}</span>
          </div>
        </TableCell>
        <TableCell>
          {isEditing ? (
            <Select
              value={val === true ? 'oui' : val === false ? 'non' : 'unset'}
              onValueChange={(v) => {
                const next = v === 'oui' ? true : v === 'non' ? false : null;
                setField(key, next);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Non renseigné</SelectItem>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <ReadValue value={display} />
          )}
        </TableCell>
        <ActionCell
          k={key}
          isEditing={isEditing}
          lineChanged={lineChanged}
          saving={rowPending[String(key)]}
          onEdit={() => setEditing((e) => ({ ...e, [key]: true }))}
          onSave={() => saveLine(key)}
          onCancel={() => cancelLine(key)}
        />
      </TableRow>
    );
  }

  /* ================= Render ================= */
  return (
    <Table>
      <TableHeader>
        <TableRow className="h-12">
          <TableHead className="w-72">Champ</TableHead>
          <TableHead>Valeur</TableHead>
          <TableHead className="w-[190px] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {/* Identité & document */}
        <TableRow className="h-10">
          <TableCell colSpan={3} className="bg-gray-50 text-xs font-medium text-gray-600">
            Identité & document
          </TableCell>
        </TableRow>
        {IDENTITY_FIELDS.map(([label, key, ph]) => renderStringRow(label, key, ph))}

        {/* Salaires & avoirs */}
        <TableRow className="h-10">
          <TableCell colSpan={3} className="bg-gray-50 text-xs font-medium text-gray-600">
            Salaires & avoirs
          </TableCell>
        </TableRow>
        {NUM_FIELDS_SALAIRES.map(([label, key, ph]) => renderNumberRow(label, key, ph))}

        {/* Prestations & retraite (annuels) */}
        <TableRow className="h-10">
          <TableCell colSpan={3} className="bg-gray-50 text-xs font-medium text-gray-600">
            Prestations & retraite (annuels)
          </TableCell>
        </TableRow>
        {NUM_FIELDS_PRESTATIONS.map(([label, key]) => renderNumberRow(label, key))}

        {/* Options & opérations */}
        <TableRow className="h-10">
          <TableCell colSpan={3} className="bg-gray-50 text-xs font-medium text-gray-600">
            Options & opérations
          </TableCell>
        </TableRow>
        {OPTIONS_FIELDS.map(([label, key, ph, kind]) =>
          kind === 'bool'
            ? renderBoolRow(label, key as BoolKey)
            : renderNumberRow(label, key as NumericKey, ph)
        )}
      </TableBody>
    </Table>
  );
}
