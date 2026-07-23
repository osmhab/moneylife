// lib/pdf/AuditTrailTemplate.tsx
//
// Rapport PDF de la PISTE D'AUDIT d'un client — export FINMA.
// Structure : en-tête (identité client + date d'édition + mention légale), puis
// un tableau chronologique de tous les événements, avec le détail des
// changements et les références de documents.
//
// Contraintes @react-pdf 3.x respectées : PAS de style en tableau (style={[...]}),
// PAS d'emoji (police Helvetica intégrée, sans glyphes emoji) — les deux
// provoquent une erreur de rendu serveur.

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { AuditEventType } from "lib/shared/core/audit";
import { AUDIT_LABELS } from "lib/shared/core/audit";

export interface AuditRow {
  type: AuditEventType;
  at: string; // déjà formaté "jj.mm.aaaa hh:mm:ss"
  summary: string;
  actorType: string;
  changes?: { label: string; before: unknown; after: unknown }[];
  document?: { fileName?: string; docType?: string; method?: string; sourceUrl?: string } | null;
}

export interface AuditReportProps {
  clientName: string;
  clientEmail: string;
  uid: string;
  generatedAt: string;
  rows: AuditRow[];
}

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#1A1A1A", fontFamily: "Helvetica" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sub: { fontSize: 9, color: "#4A4A4A", marginBottom: 1 },
  legal: { fontSize: 7.5, color: "#64748B", marginTop: 10, marginBottom: 14, lineHeight: 1.4 },
  rowHeader: { flexDirection: "row", backgroundColor: "#F1F5F9", paddingVertical: 4, paddingHorizontal: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", paddingVertical: 4, paddingHorizontal: 4 },
  thDate: { width: "18%", paddingRight: 4, fontFamily: "Helvetica-Bold", fontSize: 8, color: "#334155" },
  thType: { width: "24%", paddingRight: 4, fontFamily: "Helvetica-Bold", fontSize: 8, color: "#334155" },
  thDetail: { width: "58%", fontFamily: "Helvetica-Bold", fontSize: 8, color: "#334155" },
  cDate: { width: "18%", paddingRight: 4, fontSize: 8, color: "#475569" },
  cType: { width: "24%", paddingRight: 4, fontFamily: "Helvetica-Bold" },
  cDetail: { width: "58%" },
  change: { fontSize: 8, color: "#334155", marginTop: 1 },
  doc: { fontSize: 8, color: "#1d4ed8", marginTop: 1 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7, color: "#94A3B8", textAlign: "center" },
});

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export function AuditTrailTemplate({ clientName, clientEmail, uid, generatedAt, rows }: AuditReportProps) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Piste d'audit - {clientName || "Client"}</Text>
        <Text style={s.sub}>E-mail : {clientEmail || "-"}</Text>
        <Text style={s.sub}>Identifiant : {uid}</Text>
        <Text style={s.sub}>Document edite le : {generatedAt}</Text>
        <Text style={s.sub}>Nombre d'evenements : {rows.length}</Text>

        <Text style={s.legal}>
          Ce document constitue l'historique complet et horodate des actions
          enregistrees pour ce client dans la plateforme CreditX. Les evenements
          sont enregistres de maniere inalterable (ajout seul, sans modification ni
          suppression possible) et conserves conformement aux obligations de
          documentation applicables aux intermediaires financiers. CreditX Sarl.
        </Text>

        <View style={s.rowHeader}>
          <Text style={s.thDate}>Date et heure</Text>
          <Text style={s.thType}>Type</Text>
          <Text style={s.thDetail}>Detail</Text>
        </View>

        {rows.map((r, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.cDate}>{r.at}</Text>
            <Text style={s.cType}>{AUDIT_LABELS[r.type] ?? r.type}</Text>
            <View style={s.cDetail}>
              <Text>{r.summary}</Text>
              {(r.changes ?? []).map((c, j) => (
                <Text key={j} style={s.change}>
                  - {c.label} : {fmt(c.before)} {"->"} {fmt(c.after)}
                </Text>
              ))}
              {r.document ? (
                <Text style={s.doc}>
                  Document : {r.document.docType || "piece jointe"}
                  {r.document.method ? " (" + r.document.method + ")" : ""}
                  {r.document.sourceUrl ? " - " + r.document.sourceUrl : ""}
                </Text>
              ) : null}
            </View>
          </View>
        ))}

        <Text style={s.footer} fixed>
          CreditX Sarl - Piste d'audit generee le {generatedAt} - Document confidentiel
        </Text>
      </Page>
    </Document>
  );
}
