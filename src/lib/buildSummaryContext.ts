import { supabase } from '@/integrations/supabase/client';

interface BlairRow {
  ai_sire_1: string | null;
  preg_stage: string | null;
  breeding_year: number | null;
  calf_status: string | null;
  operation: string | null;
}

async function fetchAllBlairCombined(): Promise<BlairRow[]> {
  const PAGE_SIZE = 1000;
  const rows: BlairRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('blair_combined')
      .select('ai_sire_1, preg_stage, breeding_year, calf_status, operation')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as BlairRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function buildSummaryContext(): Promise<string> {
  const rows = await fetchAllBlairCombined();

  // Filter to Blair operation
  const blair = rows.filter(r => r.operation === 'Blair');

  // --- Sire Conception Summary ---
  const sireRows = blair.filter(r => r.preg_stage != null && r.ai_sire_1 != null);
  const sireMap = new Map<string, { total: number; ai: number; open: number }>();

  for (const r of sireRows) {
    const sire = r.ai_sire_1!;
    const entry = sireMap.get(sire) || { total: 0, ai: 0, open: 0 };
    entry.total++;
    if (r.preg_stage === 'AI') entry.ai++;
    if (r.preg_stage === 'Open') entry.open++;
    sireMap.set(sire, entry);
  }

  const sireEntries = [...sireMap.entries()]
    .filter(([, v]) => v.total >= 20)
    .sort((a, b) => b[1].total - a[1].total);

  let sireTable = '=== SIRE CONCEPTION SUMMARY (Blair, 20+ breedings) ===\n';
  sireTable += 'SIRE | TOTAL BRED | AI CONCEIVED | RATE | OPEN\n';
  sireTable += '-'.repeat(60) + '\n';
  for (const [sire, v] of sireEntries) {
    const rate = ((v.ai / v.total) * 100).toFixed(1);
    sireTable += `${sire} | ${v.total} | ${v.ai} | ${rate}% | ${v.open}\n`;
  }

  // --- Yearly Summary ---
  const yearRows = blair.filter(r => r.preg_stage != null);
  const yearMap = new Map<number, { total: number; ai: number; open: number; alive: number; dead: number }>();

  for (const r of yearRows) {
    const yr = r.breeding_year;
    if (yr == null) continue;
    const entry = yearMap.get(yr) || { total: 0, ai: 0, open: 0, alive: 0, dead: 0 };
    entry.total++;
    if (r.preg_stage === 'AI') entry.ai++;
    if (r.preg_stage === 'Open') entry.open++;
    if (r.calf_status === 'Alive') entry.alive++;
    if (r.calf_status === 'Dead') entry.dead++;
    yearMap.set(yr, entry);
  }

  const yearEntries = [...yearMap.entries()].sort((a, b) => a[0] - b[0]);

  let yearTable = '\n=== YEARLY BREEDING SUMMARY (Blair) ===\n';
  yearTable += 'YEAR | TESTED | AI% | OPEN | OPEN% | ALIVE | DEAD\n';
  yearTable += '-'.repeat(60) + '\n';
  for (const [yr, v] of yearEntries) {
    const aiPct = ((v.ai / v.total) * 100).toFixed(1);
    const openPct = ((v.open / v.total) * 100).toFixed(1);
    yearTable += `${yr} | ${v.total} | ${aiPct}% | ${v.open} | ${openPct}% | ${v.alive} | ${v.dead}\n`;
  }

  return sireTable + yearTable;
}
