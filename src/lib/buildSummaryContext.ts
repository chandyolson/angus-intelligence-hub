import { supabase } from '@/integrations/supabase/client';

interface BlairRow {
  ai_sire_1: string | null;
  preg_stage: string | null;
  breeding_year: number | null;
  calf_status: string | null;
  operation: string | null;
  lifetime_id: string | null;
  calf_sire: string | null;
  calf_bw: number | null;
  gestation_days: number | null;
}

async function fetchAllBlairCombined(): Promise<BlairRow[]> {
  const PAGE_SIZE = 1000;
  const rows: BlairRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('blair_combined')
      .select('ai_sire_1, preg_stage, breeding_year, calf_status, operation, lifetime_id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as BlairRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

const CULLING_KEYWORDS = ['cull', 'culling', 'worst', 'bottom', 'flag', 'rank', 'remove', 'sell', 'ship', 'get rid of'];
const COW_ID_PATTERN = /\b\d{1,5}[-]\d{4}\b/;

function needsCullingContext(question: string): boolean {
  const q = question.toLowerCase();
  if (CULLING_KEYWORDS.some(kw => q.includes(kw))) return true;
  if (COW_ID_PATTERN.test(question)) return true;
  return false;
}

async function buildCullingTable(blairRows: BlairRow[]): Promise<string> {
  // Fetch bottom 30 active Blair cows by value_score
  const { data: cows, error } = await supabase
    .from('animals')
    .select('lifetime_id, tag, year_born, sire, value_score, value_score_percentile')
    .eq('operation', 'Blair')
    .eq('status', 'Active')
    .order('value_score', { ascending: true, nullsFirst: false })
    .limit(30);

  if (error || !cows || cows.length === 0) return '';

  // Compute breeding stats per cow from blair_combined
  const cowStats = new Map<string, { timesOpen: number; aiBred: number; aiConceived: number; alive: number; dead: number; total: number }>();
  for (const r of blairRows) {
    if (!r.lifetime_id || r.operation !== 'Blair') continue;
    const entry = cowStats.get(r.lifetime_id) || { timesOpen: 0, aiBred: 0, aiConceived: 0, alive: 0, dead: 0, total: 0 };
    if (r.preg_stage === 'Open') entry.timesOpen++;
    if (r.preg_stage != null) { entry.aiBred++; if (r.preg_stage === 'AI') entry.aiConceived++; }
    if (r.calf_status === 'Alive') { entry.alive++; entry.total++; }
    if (r.calf_status === 'Dead') { entry.dead++; entry.total++; }
    cowStats.set(r.lifetime_id, entry);
  }

  let table = '\n=== BOTTOM 30 COWS BY VALUE SCORE (Blair, Active) ===\n';
  table += 'LID | TAG | YR_BORN | SIRE | VALUE_SCORE | PERCENTILE | TIMES_OPEN | AI_RATE | TOTAL_CALVES | ALIVE | DEAD | SURVIVAL\n';
  table += '-'.repeat(120) + '\n';

  for (const c of cows) {
    const lid = c.lifetime_id ?? '—';
    const stats = cowStats.get(lid) || { timesOpen: 0, aiBred: 0, aiConceived: 0, alive: 0, dead: 0, total: 0 };
    const aiRate = stats.aiBred > 0 ? ((stats.aiConceived / stats.aiBred) * 100).toFixed(1) + '%' : '—';
    const survival = stats.total > 0 ? ((stats.alive / stats.total) * 100).toFixed(1) + '%' : '—';
    table += `${lid} | ${c.tag ?? '—'} | ${c.year_born ?? '—'} | ${c.sire ?? '—'} | ${c.value_score ?? '—'} | ${c.value_score_percentile ?? '—'} | ${stats.timesOpen} | ${aiRate} | ${stats.total} | ${stats.alive} | ${stats.dead} | ${survival}\n`;
  }

  return table;
}

export async function buildSummaryContext(question?: string): Promise<string> {
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

  let result = sireTable + yearTable;

  // --- Conditionally add culling data ---
  if (question && needsCullingContext(question)) {
    const cullingTable = await buildCullingTable(rows);
    result += cullingTable;
  }

  return result;
}
