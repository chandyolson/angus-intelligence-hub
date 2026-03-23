export const PRESENTATION_MODE = true;

const OPERATION_MAP: Record<string, string> = {
  "Blair Bros Angus": "Operation A",
  "Blair Bros": "Operation A",
  "Blair": "Operation A",
  "blair": "Operation A",
  "BLAIR BROS ANGUS": "OPERATION A",
  "BLAIR BROS": "OPERATION A",
  "BLAIR": "OPERATION A",
  "Snyder Ranch": "Operation B",
  "Snyder": "Operation B",
  "snyder": "Operation B",
  "SNYDER RANCH": "OPERATION B",
  "SNYDER": "OPERATION B",
};

const SIRE_MAP: Record<string, string> = {
  "WALLACE": "SIRE X",
  "Wallace": "Sire X",
  "wallace": "sire x",
};

export function anonymize(value: string | null | undefined): string {
  if (!value || !PRESENTATION_MODE) return value ?? "";
  if (OPERATION_MAP[value]) return OPERATION_MAP[value];
  if (SIRE_MAP[value]) return SIRE_MAP[value];
  let result = value;
  result = result.replace(/Blair Bros Angus/g, "Operation A");
  result = result.replace(/BLAIR BROS ANGUS/g, "OPERATION A");
  result = result.replace(/Blair Bros/g, "Operation A");
  result = result.replace(/BLAIR BROS/g, "OPERATION A");
  result = result.replace(/Snyder Ranch/g, "Operation B");
  result = result.replace(/SNYDER RANCH/g, "OPERATION B");
  result = result.replace(/\bBlair\b/g, "Operation A");
  result = result.replace(/\bBLAIR\b/g, "OPERATION A");
  result = result.replace(/\bSnyder\b/g, "Operation B");
  result = result.replace(/\bSNYDER\b/g, "OPERATION B");
  result = result.replace(/\bWALLACE\b/g, "SIRE X");
  result = result.replace(/\bWallace\b/g, "Sire X");
  return result;
}

export function anonymizeOperation(value: string | null | undefined): string {
  if (!value || !PRESENTATION_MODE) return value ?? "";
  return OPERATION_MAP[value] ?? value;
}

export function anonymizeSire(value: string | null | undefined): string {
  if (!value || !PRESENTATION_MODE) return value ?? "";
  return SIRE_MAP[value] ?? value;
}
