// lib/offers/parsers/swisslife/utils.ts

export function extractAllTextFromResponse(response: any): string {
  let out = "";

  for (const item of response.output ?? []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block.type === "output_text" && typeof block.text === "string") {
          out += block.text;
        }
      }
    }

    if (typeof item.text === "string") {
      out += item.text;
    }
  }

  return out.trim();
}

export function extractJsonFromModelOutput(text: string): string {
  const mj = text.match(/```json([\s\S]*?)```/i);
  if (mj) return mj[1].trim();

  const mc = text.match(/```([\s\S]*?)```/);
  if (mc) return mc[1].trim();

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first !== -1 && last !== -1) {
    return text.slice(first, last + 1).trim();
  }
  return text.trim();
}

export function parseSwissNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = String(raw)
    .replace(/\u00A0/g, " ")
    .replace(/[’']/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function fixDeathCapitalFromText(ai: any, ocrText: string): any {
  const current = ai?.benefits?.death?.extraCapital ?? null;
  if (current != null && current >= 50000) return ai;

  const match = ocrText.replace(/\u00A0/g, " ").match(
    /Capital supplémentaire[^0-9]*CHF\s*([0-9'’\s]+)/i
  );
  if (match) {
    const val = Number(match[1].replace(/[’'\s]/g, ""));
    if (val >= 50000) {
      ai.benefits ??= {};
      ai.benefits.death ??= {};
      ai.benefits.death.extraCapital = val;
    }
  }
  return ai;
}