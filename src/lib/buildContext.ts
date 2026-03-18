import { supabase } from '@/integrations/supabase/client';

const KNOWN_SIRES = [
  'FIREBALL', 'WALLACE', 'TAHOE', 'GRID PREMIUM', 'NEW ADDITION', 'TOP CUT',
  'TRANSCENDENT', 'PATRIARCH', 'HOMETOWN', 'FOUNDATION', 'PLUS 1', 'RAWHIDE',
  'POWERCAT', 'CONTENDER', 'TESTAMENT', 'SUNBEAM', 'GROWTH FUND', 'SUREFIRE',
  'ADVANCE', 'COMRADE', 'ABSOLUTE', 'PROPHET', '007', 'CLEANUP',
];

async function safeSelect(buildQuery: () => any): Promise<any[] | null> {
  try {
    const { data, error } = await buildQuery();
    if (error) { console.warn('[buildContext] query error:', error.message); return null; }
    return data;
  } catch (e) { console.warn('[buildContext] exception:', e); return null; }
}

/** Paginated fetch to get all rows past the 1000-row limit */
async function fetchAll(
  table: string,
  select: string,
  filters: Record<string, any> = {},
  inFilters: Record<string, string[]> = {},
  gteFilters: Record<string, any> = {},
  notNullCols: string[] = [],
): Promise<any[]> {
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;
  while (true) {
    let q = (supabase.from as any)(table).select(select).range(from, from + PAGE - 1);
    for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
    for (const [col, vals] of Object.entries(inFilters)) q = q.in(col, vals);
    for (const [col, val] of Object.entries(gteFilters)) q = q.gte(col, val);
    for (const col of notNullCols) q = q.not(col, 'is', null);
    const { data, error } = await q;
    if (error) { console.warn(`[buildContext] fetchAll ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const PREG_STAGES = ['AI', 'Second AI', 'Early', 'Middle', 'Late', 'Open', 'In Between'];

export async function buildContext(question: string): Promise<string> {
  const q = question.toLowerCase();
  const contextParts: string[] = [];

  // ── COW-SPECIFIC (tag number) ──────────────────────────────
  const tagMatch = question.match(/\b(\d{3,4})\b/);
  if (tagMatch) {
    const tag = tagMatch[1];
    const cowData = await safeSelect(() =>
      supabase.from('animals')
        .select('lifetime_id, tag, year_born, status, sire, dam_sire, operation, value_score, value_score_percentile, c1_conception_score, c2_survival_score, c3_interval_score, c4_calves_per_year_score, c5_gestation_score, c6_birthweight_score')
        .eq('tag', tag).eq('operation', 'Blair').limit(5)
    );
    if (cowData && cowData.length > 0) {
      contextParts.push(`COW PROFILE:\n${JSON.stringify(cowData, null, 2)}`);
      const lid = cowData[0].lifetime_id;
      if (lid) {
        const breeding = await fetchAll('blair_combined',
          'breeding_year, ai_sire_1, ai_sire_2, preg_stage, calving_date, calf_sire, calf_sex, calf_bw, calf_status, gestation_days, cow_sire',
          { lifetime_id: lid, operation: 'Blair' });
        if (breeding.length > 0) contextParts.push(`BREEDING HISTORY FOR ${lid}:\n${JSON.stringify(breeding, null, 2)}`);
      }
    }
  }

  // ── SIRE QUESTIONS ─────────────────────────────────────────
  if (q.includes('sire') || q.includes('conception rate') || q.includes('bull') || q.includes('conception')) {
    const sireData = await fetchAll(
      'blair_combined', 'ai_sire_1, preg_stage',
      { operation: 'Blair' }, { preg_stage: PREG_STAGES }, {}, ['ai_sire_1']
    );
    if (sireData.length > 0) {
      const sireMap: Record<string, { total: number; conceived: number }> = {};
      for (const row of sireData) {
        const s = row.ai_sire_1;
        if (!sireMap[s]) sireMap[s] = { total: 0, conceived: 0 };
        sireMap[s].total++;
        if (row.preg_stage === 'AI') sireMap[s].conceived++;
      }
      const sireRates = Object.entries(sireMap)
        .map(([sire, st]) => ({ sire, breedings: st.total, conceived: st.conceived, rate: Math.round((st.conceived / st.total) * 1000) / 10 }))
        .filter(s => s.breedings >= 10)
        .sort((a, b) => b.breedings - a.breedings);
      contextParts.push(`SIRE CONCEPTION RATES (10+ breedings, sorted by usage):\n${JSON.stringify(sireRates, null, 2)}`);
    }
  }

  // ── SPECIFIC SIRE MENTIONED — fetch calf outcomes ──────────
  const mentionedSires = KNOWN_SIRES.filter(s => q.includes(s.toLowerCase()));
  for (const sire of mentionedSires) {
    const calfData = await fetchAll(
      'blair_combined', 'calf_bw, calf_status, calf_sex, gestation_days, breeding_year, lifetime_id',
      { calf_sire: sire, operation: 'Blair' }
    );
    if (calfData.length > 0) {
      contextParts.push(`CALF OUTCOMES FOR ${sire} (as confirmed calf sire, ${calfData.length} calves):\n${JSON.stringify(calfData.slice(0, 80), null, 2)}`);
    }
    const aiData = await fetchAll(
      'blair_combined', 'ai_sire_1, preg_stage, breeding_year, lifetime_id',
      { ai_sire_1: sire, operation: 'Blair' }
    );
    if (aiData.length > 0) {
      contextParts.push(`AI BREEDING DATA FOR ${sire} (as AI sire, ${aiData.length} breedings):\n${JSON.stringify(aiData.slice(0, 80), null, 2)}`);
    }
  }

  // ── DAUGHTER COMPARISON / HEIFER / BIRTH WEIGHT BY SIRE ────
  if (q.includes('daughter') || q.includes('heifer') || (q.includes('birth weight') && mentionedSires.length > 0)) {
    for (const sire of mentionedSires) {
      const daughters = await safeSelect(() =>
        supabase.from('animals')
          .select('lifetime_id, tag, year_born, sire, sex, status')
          .eq('sire', sire).eq('operation', 'Blair')
      );
      if (daughters && daughters.length > 0) {
        contextParts.push(`DAUGHTERS OF ${sire} (${daughters.length} animals):\n${JSON.stringify(daughters.slice(0, 30), null, 2)}`);
        const lids = daughters.map((d: any) => d.lifetime_id).filter(Boolean);
        if (lids.length > 0) {
          const allCalving: any[] = [];
          for (let i = 0; i < lids.length; i += 50) {
            const batch = lids.slice(i, i + 50);
            const calvingData = await safeSelect(() =>
              supabase.from('blair_combined')
                .select('lifetime_id, breeding_year, calf_bw, calf_sex, calf_status, calf_sire, gestation_days')
                .in('lifetime_id', batch).eq('operation', 'Blair')
            );
            if (calvingData) allCalving.push(...calvingData);
          }
          if (allCalving.length > 0) {
            contextParts.push(`CALVING RECORDS OF ${sire} DAUGHTERS (${allCalving.length} records):\n${JSON.stringify(allCalving.slice(0, 100), null, 2)}`);
          }
        }
      }
    }
  }

  // ── OPEN RATE / TRENDS ─────────────────────────────────────
  if (q.includes('open') || q.includes('trend') || q.includes('year over year') || q.includes('breeding season')) {
    const trendData = await fetchAll(
      'blair_combined', 'breeding_year, preg_stage',
      { operation: 'Blair' }, { preg_stage: PREG_STAGES }, { breeding_year: 2021 }
    );
    if (trendData.length > 0) {
      const yearMap: Record<number, { total: number; open: number; ai: number }> = {};
      for (const row of trendData) {
        const yr = row.breeding_year;
        if (!yearMap[yr]) yearMap[yr] = { total: 0, open: 0, ai: 0 };
        yearMap[yr].total++;
        if (row.preg_stage === 'Open') yearMap[yr].open++;
        if (row.preg_stage === 'AI') yearMap[yr].ai++;
      }
      const yearStats = Object.entries(yearMap)
        .map(([year, s]) => ({ breeding_year: +year, total_checked: s.total, open_count: s.open, open_rate: Math.round((s.open / s.total) * 1000) / 10, ai_count: s.ai, ai_rate: Math.round((s.ai / s.total) * 1000) / 10 }))
        .sort((a, b) => a.breeding_year - b.breeding_year);
      contextParts.push(`YEAR-OVER-YEAR BREEDING RESULTS (Blair, 2021-2025):\n${JSON.stringify(yearStats, null, 2)}`);
    }
  }

  // ── CULLING / RANKINGS ─────────────────────────────────────
  if (q.includes('cull') || q.includes('worst') || q.includes('bottom') || q.includes('ranking') || q.includes('score') || q.includes('best cow') || q.includes('top cow')) {
    const bottomCows = await safeSelect(() =>
      supabase.from('animals')
        .select('lifetime_id, tag, year_born, sire, value_score, value_score_percentile, c1_conception_score, c2_survival_score, c3_interval_score, c4_calves_per_year_score')
        .eq('status', 'Active').eq('operation', 'Blair').not('value_score', 'is', null)
        .order('value_score', { ascending: true }).limit(20)
    );
    const topCows = await safeSelect(() =>
      supabase.from('animals')
        .select('lifetime_id, tag, year_born, sire, value_score, value_score_percentile, c1_conception_score, c2_survival_score, c3_interval_score, c4_calves_per_year_score')
        .eq('status', 'Active').eq('operation', 'Blair').not('value_score', 'is', null)
        .order('value_score', { ascending: false }).limit(20)
    );
    if (bottomCows) contextParts.push(`BOTTOM 20 COWS BY COMPOSITE SCORE:\n${JSON.stringify(bottomCows, null, 2)}`);
    if (topCows) contextParts.push(`TOP 20 COWS BY COMPOSITE SCORE:\n${JSON.stringify(topCows, null, 2)}`);
  }

  // ── CALVING / BIRTH WEIGHT / SURVIVAL ──────────────────────
  if (q.includes('calving') || q.includes('birth weight') || q.includes('dead calf') || q.includes('death loss') || q.includes('survival')) {
    const calvingStats = await fetchAll(
      'blair_combined', 'breeding_year, calf_bw, calf_status, calf_sire, calf_sex, calving_date',
      { operation: 'Blair' }, {}, { breeding_year: 2021 }, ['calving_date']
    );
    if (calvingStats.length > 0) {
      const yearCalving: Record<number, { total: number; alive: number; dead: number; bwSum: number; bwCount: number }> = {};
      for (const row of calvingStats) {
        const yr = row.breeding_year;
        if (!yearCalving[yr]) yearCalving[yr] = { total: 0, alive: 0, dead: 0, bwSum: 0, bwCount: 0 };
        yearCalving[yr].total++;
        if (row.calf_status === 'Alive') yearCalving[yr].alive++;
        if (row.calf_status === 'Dead') yearCalving[yr].dead++;
        if (row.calf_bw) { yearCalving[yr].bwSum += parseFloat(row.calf_bw); yearCalving[yr].bwCount++; }
      }
      const summary = Object.entries(yearCalving)
        .map(([year, s]) => ({ calving_year: +year + 1, total_calves: s.total, alive: s.alive, dead: s.dead, survival_rate: Math.round((s.alive / s.total) * 1000) / 10, avg_birth_weight: s.bwCount > 0 ? Math.round((s.bwSum / s.bwCount) * 10) / 10 : null }))
        .sort((a, b) => a.calving_year - b.calving_year);
      contextParts.push(`CALVING SUMMARY BY YEAR:\n${JSON.stringify(summary, null, 2)}`);
    }
  }

  // ── FALLBACK: basic herd stats ─────────────────────────────
  if (contextParts.length === 0) {
    const herdStats = await safeSelect(() =>
      supabase.from('animals')
        .select('value_score, value_score_percentile')
        .eq('status', 'Active').eq('operation', 'Blair').not('value_score', 'is', null)
    );
    if (herdStats && herdStats.length > 0) {
      const scores = herdStats.map((r: any) => parseFloat(r.value_score)).filter((v: number) => !isNaN(v));
      const avg = Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10;
      contextParts.push(`HERD SUMMARY: ${scores.length} scored Blair cows. Average composite score: ${avg}. Range: ${Math.min(...scores)} to ${Math.max(...scores)}.`);
    }
  }

  return contextParts.join('\n\n');
}
