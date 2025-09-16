// lib/layoutTypes.ts
export type Line = {
  text: string;
  yMid: number;
  x1: number;
  x2: number;
  // minimal payload; si tu veux détailler: words[], page, etc.
  page?: number;
  words?: Array<{ text: string; x1: number; y1: number; x2: number; y2: number }>;
};
