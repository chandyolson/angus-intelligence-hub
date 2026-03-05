import { supabase } from '@/integrations/supabase/client';
import { Animal, BreedingCalvingRecord } from '@/types/cattle';
import { computeCompositeFromRecords, computeSireStats, computeCowStats } from '@/lib/calculations';

async function fetchAllRows<T>(table: string, filter?: { column: string; value: string }): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  let from = 0;
  let done = false;
  while (!done) {
    let query = (supabase.from as any)(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (filter) query = query.eq(filter.column, filter.value);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) done = true;
    else {
      allRows.push(...data);
      if (data.length < PAGE_SIZE) done = true;
      else from += PAGE_SIZE;
    }
  }
  return allRows as T[];
}

export async function buildHerdContext(): Promise<string> {
  const [allAnimals, allRecords] = await Promise.all([
    fetchAllRows<Animal>('animals'),
    fetchAllRows<BreedingCalvingRecord>('blair_breeding_calving'),
  ]);

  const activeAnimals = allAnimals.filter(a => a.status?.toLowerCase() === 'active' && a.operation === 'Blair');
  const blairLids = new Set(activeAnimals.map(a => a.lifetime_id).filter(Boolean));
  const blairRecords = allRecords.filter(r => r.lifetime_id && blairLids.has(r.lifetime_id));

  // Overall stats — scoped to Blair
  const withCalves = blairRecords.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
  const totalBreedings = blairRecords.filter(r => r.lifetime_id).length;
  const conceptionRate = totalBreedings > 0 ? (withCalves.length / totalBreedings) * 100 : 0;
  const liveCalves = withCalves.filter(r => r.calf_status?.toLowerCase() === 'alive');
  const survivalRate = withCalves.length > 0 ? (liveCalves.length / withCalves.length) * 100 : 0;
  const gestations = blairRecords.map(r => r.gestation_days).filter((v): v is number => v != null && v >= 250 && v <= 310);
  const avgGestation = gestations.length > 0 ? gestations.reduce((a, b) => a + b, 0) / gestations.length : 0;

  // Year-over-year open rate
  const byYear = new Map<number, { total: number; open: number }>();
  blairRecords.forEach(r => {
    if (!r.breeding_year) return;
    const y = byYear.get(r.breeding_year) || { total: 0, open: 0 };
    y.total++;
    if (r.preg_stage?.toLowerCase() === 'open') y.open++;
    byYear.set(r.breeding_year, y);
  });
  const yearTrend = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([yr, d]) => `${yr}: ${((d.open / d.total) * 100).toFixed(1)}%`)
    .join(', ');

  // Calving intervals
  const byCowDates = new Map<string, string[]>();
  blairRecords.forEach(r => {
    if (r.lifetime_id && r.calving_date) {
      const d = byCowDates.get(r.lifetime_id) || [];
      d.push(r.calving_date);
      byCowDates.set(r.lifetime_id, d);
    }
  });
  const intervals: number[] = [];
  byCowDates.forEach(dates => {
    const sorted = dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round((new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 200 && days < 800) intervals.push(days);
    }
  });
  intervals.sort((a, b) => a - b);
  const avgInterval = intervals.length > 0 ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;
  const medianInterval = intervals.length > 0 ? intervals[Math.floor(intervals.length / 2)] : 0;
  const cowsWithIntervals = byCowDates.size;

  // Sire stats
  const sireStats = computeSireStats(blairRecords);
  const sireLines = sireStats.slice(0, 15).map(s =>
    `${s.sire} | Calves: ${s.total_calves} | Conception: ${s.ai_conception_rate}% | Avg Gest: ${s.avg_gestation_days}d | Avg BW: ${s.avg_calf_bw}lbs | Survival: ${s.calf_survival_rate}%`
  ).join('\n');

  // Composite scores
  const cowStatsList = activeAnimals.map(a => computeCowStats(a, blairRecords)).filter(c => c.composite_score > 0);
  const sorted = [...cowStatsList].sort((a, b) => b.composite_score - a.composite_score);
  const top10 = sorted.slice(0, 10).map(c => `${c.tag || '—'} | ${c.lifetime_id} | Score: ${c.composite_score} | Calves: ${c.total_calves} | Conception: ${c.ai_conception_rate}% | Survival: ${c.calf_survival_rate}%`).join('\n');
  const bottom10 = sorted.slice(-10).map(c => `${c.tag || '—'} | ${c.lifetime_id} | Score: ${c.composite_score} | Calves: ${c.total_calves} | Conception: ${c.ai_conception_rate}% | Survival: ${c.calf_survival_rate}%`).join('\n');

  // Score distribution
  const scores = cowStatsList.map(c => c.composite_score);
  const scoreSorted = [...scores].sort((a, b) => a - b);
  const q25 = scoreSorted[Math.floor(scoreSorted.length * 0.25)] ?? 0;
  const q50 = scoreSorted[Math.floor(scoreSorted.length * 0.5)] ?? 0;
  const q75 = scoreSorted[Math.floor(scoreSorted.length * 0.75)] ?? 0;

  // Cull candidates
  const currentYear = new Date().getFullYear();
  const openMultiple = cowStatsList.filter(c => {
    const cowRecs = blairRecords.filter(r => r.lifetime_id === c.lifetime_id);
    const opens = cowRecs.filter(r => r.breeding_year && r.breeding_year >= currentYear - 3 && (r.preg_stage?.toLowerCase() === 'open' || r.calf_status?.toLowerCase() === 'open')).length;
    return opens >= 2;
  }).length;
  const bottomOld = cowStatsList.filter(c => c.composite_score <= q25 && c.year_born && currentYear - c.year_born >= 5).length;
  const lowSurvival = cowStatsList.filter(c => c.total_calves >= 3 && c.calf_survival_rate < 85).length;

  const lostDays = avgInterval > 365 ? (avgInterval - 365) * cowsWithIntervals : 0;

  return `BLAIR BROS ANGUS — LIVE HERD DATA SUMMARY
==========================================
Report generated: ${new Date().toLocaleString()}

HERD OVERVIEW
- Total active cows: ${activeAnimals.length}
- Total calving records: ${blairRecords.length}
- Years of data: 2017–2025

REPRODUCTIVE PERFORMANCE
- Overall AI conception rate: ${conceptionRate.toFixed(1)}%
- Overall calf survival rate: ${survivalRate.toFixed(1)}%
- Average gestation length: ${Math.round(avgGestation)} days
- Open rate trend: ${yearTrend}

CALVING INTERVAL
- Average: ${avgInterval} days (target is 365)
- Median: ${medianInterval} days
- Lost production days at current avg: ${avgInterval > 365 ? `${avgInterval - 365} days × ${cowsWithIntervals} cows = ${lostDays} days/year` : 'Within optimal range'}

SIRE PERFORMANCE (sires with 20+ calves, sorted by conception rate)
${sireLines}

SCORE DISTRIBUTION (composite scores across active herd)
- Top 25% (score ≥${q75.toFixed(1)}): ${scores.filter(s => s >= q75).length} cows
- Upper-middle (${q50.toFixed(1)}–${q75.toFixed(1)}): ${scores.filter(s => s >= q50 && s < q75).length} cows
- Lower-middle (${q25.toFixed(1)}–${q50.toFixed(1)}): ${scores.filter(s => s >= q25 && s < q50).length} cows
- Bottom 25% (score <${q25.toFixed(1)}): ${scores.filter(s => s < q25).length} cows

CULL CANDIDATES
- Cows open 2+ times in last 4 years: ${openMultiple}
- Bottom quartile score + 5+ years old: ${bottomOld}
- Calf survival below 85%: ${lowSurvival}

TOP 10 COWS BY COMPOSITE SCORE
${top10}

BOTTOM 10 COWS BY COMPOSITE SCORE
${bottom10}`;
}

export async function fetchCowContext(tagNumber: string): Promise<string | null> {
  const { data: animal } = await supabase.from('animals').select('*').eq('tag', tagNumber).limit(1).single();
  if (!animal) return null;

  const lid = (animal as any).lifetime_id;
  if (!lid) return `Found cow with tag ${tagNumber} but no lifetime_id linked.`;

  const records = await fetchAllRows<BreedingCalvingRecord>('blair_breeding_calving', { column: 'lifetime_id', value: lid });

  const lines = records.map(r =>
    `Year: ${r.breeding_year} | AI Date: ${r.ai_date_1 || '—'} | Sire: ${r.sire || '—'} | Preg: ${r.preg_stage || '—'} | Calving: ${r.calving_date || '—'} | Calf Status: ${r.calf_status || '—'} | Calf BW: ${r.calf_bw ?? '—'} | Gestation: ${r.gestation_days ?? '—'}d`
  ).join('\n');

  return `\nSPECIFIC COW DATA REQUESTED — Tag: ${tagNumber}, Lifetime ID: ${lid}
Animal: sire=${(animal as any).sire || '—'}, dam_sire=${(animal as any).dam_sire || '—'}, year_born=${(animal as any).year_born || '—'}, status=${(animal as any).status || '—'}
Records (${records.length}):
${lines}`;
}
