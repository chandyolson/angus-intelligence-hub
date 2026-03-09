import { supabase } from '@/integrations/supabase/client';
import { Animal, BreedingCalvingRecord } from '@/types/cattle';
import { computeSireStats, computeCowStats, computeCalvingIntervals, generateCullList } from '@/lib/calculations';

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

export async function buildHerdContext(operation: string = 'Blair'): Promise<string> {
  const [allAnimals, allRecords] = await Promise.all([
    fetchAllRows<Animal>('animals'),
    fetchAllRows<BreedingCalvingRecord>('blair_combined'),
  ]);

  // Filter by operation — matching how all other screens filter
  const animals = operation === 'Both' ? allAnimals : allAnimals.filter(a => a.operation === operation);
  const records = operation === 'Both' ? allRecords : allRecords.filter((r: any) => r.operation === operation);
  const activeAnimals = animals.filter(a => a.status?.toLowerCase() === 'active');

  // ── Overall Reproductive Stats ──
  const withAiDate1 = records.filter(r => r.ai_date_1 != null);
  const firstConceived = withAiDate1.filter(r => r.preg_stage?.toLowerCase() === 'ai');
  const secondConceived = records.filter(r => r.ai_date_2 != null && r.preg_stage?.toLowerCase() === 'second ai');
  const firstServiceRate = withAiDate1.length > 0 ? (firstConceived.length / withAiDate1.length) * 100 : 0;
  const overallAiRate = withAiDate1.length > 0 ? ((firstConceived.length + secondConceived.length) / withAiDate1.length) * 100 : 0;

  const withCalves = records.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
  const liveCalves = withCalves.filter(r => r.calf_status?.toLowerCase() === 'alive');
  const survivalRate = withCalves.length > 0 ? (liveCalves.length / withCalves.length) * 100 : 0;

  // Gestation stats
  const gestDays = records.map(r => r.gestation_days).filter((v): v is number => v != null && v >= 250 && v <= 310);
  const avgGestation = gestDays.length > 0 ? gestDays.reduce((a, b) => a + b, 0) / gestDays.length : 0;
  const gestSorted = [...gestDays].sort((a, b) => a - b);
  const gestMedian = gestSorted.length > 0 ? gestSorted[Math.floor(gestSorted.length / 2)] : 0;

  // ── Year-over-Year Breeding Stats ──
  const byYear = new Map<number, { total: number; open: number; ai1: number; ai1Conceived: number; calves: number; alive: number; bws: number[]; gestations: number[] }>();
  records.forEach(r => {
    if (!r.breeding_year) return;
    const y = byYear.get(r.breeding_year) || { total: 0, open: 0, ai1: 0, ai1Conceived: 0, calves: 0, alive: 0, bws: [], gestations: [] };
    y.total++;
    if (r.preg_stage?.toLowerCase() === 'open') y.open++;
    if (r.ai_date_1) { y.ai1++; if (r.preg_stage?.toLowerCase() === 'ai') y.ai1Conceived++; }
    if (r.calf_status && r.calf_status.toLowerCase() !== 'open') {
      y.calves++;
      if (r.calf_status.toLowerCase() === 'alive') y.alive++;
    }
    if (r.calf_bw && r.calf_bw > 0) y.bws.push(r.calf_bw);
    if (r.gestation_days && r.gestation_days >= 250 && r.gestation_days <= 310) y.gestations.push(r.gestation_days);
    byYear.set(r.breeding_year, y);
  });

  const yearlyLines = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([yr, d]) => {
      const openRate = d.total > 0 ? ((d.open / d.total) * 100).toFixed(1) : '—';
      const conRate = d.ai1 > 0 ? ((d.ai1Conceived / d.ai1) * 100).toFixed(1) : '—';
      const survRate = d.calves > 0 ? ((d.alive / d.calves) * 100).toFixed(1) : '—';
      const avgBw = d.bws.length > 0 ? (d.bws.reduce((a, b) => a + b, 0) / d.bws.length).toFixed(0) : '—';
      const avgGest = d.gestations.length > 0 ? (d.gestations.reduce((a, b) => a + b, 0) / d.gestations.length).toFixed(1) : '—';
      return `${yr}: Services=${d.total} | Open Rate=${openRate}% | 1st Svc Rate=${conRate}% | Survival=${survRate}% | Avg BW=${avgBw}lbs | Avg Gest=${avgGest}d`;
    })
    .join('\n');

  // ── Birth Weight by Calving Year ──
  const bwByCalvingYear = new Map<number, number[]>();
  records.forEach(r => {
    if (!r.calving_date || !r.calf_bw || r.calf_bw <= 0) return;
    const yr = new Date(r.calving_date).getFullYear();
    const arr = bwByCalvingYear.get(yr) || [];
    arr.push(r.calf_bw);
    bwByCalvingYear.set(yr, arr);
  });
  const bwTrendLines = Array.from(bwByCalvingYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([yr, bws]) => `${yr}: Avg=${(bws.reduce((a, b) => a + b, 0) / bws.length).toFixed(1)}lbs, Count=${bws.length}`)
    .join(', ');

  // ── Calving Intervals ──
  const intervalStats = computeCalvingIntervals(records);

  // ── Sire Stats (same calc as Sire Analysis page) ──
  const sireStats = computeSireStats(records);
  const sireLines = sireStats.slice(0, 20).map(s =>
    `${s.sire} [${s.performance_badge}] | 1st Units=${s.units_used_1st} | 1st Rate=${s.first_service_rate}% | 2nd Units=${s.units_used_2nd} | 2nd Rate=${s.second_service_rate}% | Overall AI=${s.overall_ai_rate}% | Calves=${s.total_calves} | Survival=${s.calf_survival_rate}% | Avg BW=${s.avg_calf_bw}lbs | Avg Gest=${s.avg_gestation_days}d | Bull%=${s.bull_calf_pct}%`
  ).join('\n');

  // ── Cow Composite Scores (same calc as Rankings page) ──
  const cowStatsList = activeAnimals.map(a => computeCowStats(a, records)).filter(c => c.composite_score > 0);
  const sorted = [...cowStatsList].sort((a, b) => b.composite_score - a.composite_score);
  const scores = cowStatsList.map(c => c.composite_score);
  const scoreSorted = [...scores].sort((a, b) => a - b);
  const q25 = scoreSorted[Math.floor(scoreSorted.length * 0.25)] ?? 0;
  const q50 = scoreSorted[Math.floor(scoreSorted.length * 0.5)] ?? 0;
  const q75 = scoreSorted[Math.floor(scoreSorted.length * 0.75)] ?? 0;

  const top10 = sorted.slice(0, 10).map(c =>
    `${c.tag || '—'} (${c.lifetime_id}) | Score=${c.composite_score} | Calves=${c.total_calves} | Conception=${c.ai_conception_rate}% | Survival=${c.calf_survival_rate ?? '—'}% | Avg BW=${c.avg_bw}lbs | Born=${c.year_born || '—'} | Sire=${c.sire || '—'}`
  ).join('\n');
  const bottom10 = sorted.slice(-10).map(c =>
    `${c.tag || '—'} (${c.lifetime_id}) | Score=${c.composite_score} | Calves=${c.total_calves} | Conception=${c.ai_conception_rate}% | Survival=${c.calf_survival_rate ?? '—'}% | Avg BW=${c.avg_bw}lbs | Born=${c.year_born || '—'} | Sire=${c.sire || '—'}`
  ).join('\n');

  // ── Cull Candidates (same calc as Culling page) ──
  const currentYear = new Date().getFullYear();
  const cullList = generateCullList(cowStatsList, records, currentYear);
  const cullLines = cullList.slice(0, 15).map(c =>
    `${c.tag || '—'} (${c.lifetime_id}) | Score=${c.composite_score} | Born=${c.year_born || '—'} | Reasons: ${c.reasons.join('; ')}`
  ).join('\n');

  // ── Open Cows (current year) ──
  const openCows = records
    .filter(r => r.breeding_year && r.breeding_year >= currentYear - 1 && r.preg_stage?.toLowerCase() === 'open')
    .map(r => {
      const animal = animals.find(a => a.lifetime_id === r.lifetime_id);
      return `${animal?.tag || '—'} (${r.lifetime_id}) | Year=${r.breeding_year} | Born=${animal?.year_born || '—'}`;
    });

  // ── Herd Demographics ──
  const byAge = new Map<number, number>();
  activeAnimals.forEach(a => {
    if (a.year_born) {
      const age = currentYear - a.year_born;
      byAge.set(age, (byAge.get(age) || 0) + 1);
    }
  });
  const ageDist = Array.from(byAge.entries()).sort(([a], [b]) => a - b).map(([age, cnt]) => `${age}yr: ${cnt}`).join(', ');

  // ── Gestation Distribution ──
  const gestBuckets = new Map<string, number>();
  gestDays.forEach(d => {
    const bucket = `${Math.floor(d / 5) * 5}-${Math.floor(d / 5) * 5 + 5}`;
    gestBuckets.set(bucket, (gestBuckets.get(bucket) || 0) + 1);
  });
  const gestDist = Array.from(gestBuckets.entries()).sort().map(([b, c]) => `${b}d: ${c}`).join(', ');

  return `${operation === 'Both' ? 'ALL OPERATIONS' : operation.toUpperCase()} — LIVE HERD DATA SUMMARY
==========================================
Report generated: ${new Date().toLocaleString()}

HERD OVERVIEW
- Total animals: ${animals.length}
- Active cows: ${activeAnimals.length}
- Total breeding records: ${records.length}
- Operation filter: ${operation}

REPRODUCTIVE PERFORMANCE
- 1st Service Conception Rate: ${firstServiceRate.toFixed(1)}%
- Overall AI Rate (1st+2nd/1st services): ${overallAiRate.toFixed(1)}%
- Calf Survival Rate: ${survivalRate.toFixed(1)}%
- Average Gestation: ${Math.round(avgGestation)} days (median: ${gestMedian}d)

YEAR-BY-YEAR BREAKDOWN (same data as dashboard trends)
${yearlyLines}

BIRTH WEIGHT TREND BY CALVING YEAR
${bwTrendLines}

CALVING INTERVAL
- Average: ${intervalStats?.average ?? '—'} days (target: 365)
- Median: ${intervalStats?.median ?? '—'} days
- Best: ${intervalStats?.best ?? '—'} days
- Longest: ${intervalStats?.longest ?? '—'} days

GESTATION DISTRIBUTION
${gestDist}

SIRE PERFORMANCE (top 20 sires, same data as Sire Analysis page)
${sireLines}

HERD AGE DISTRIBUTION
${ageDist}

SCORE DISTRIBUTION (composite scores)
- Top 25% (≥${q75.toFixed(1)}): ${scores.filter(s => s >= q75).length} cows
- Upper-middle (${q50.toFixed(1)}–${q75.toFixed(1)}): ${scores.filter(s => s >= q50 && s < q75).length} cows
- Lower-middle (${q25.toFixed(1)}–${q50.toFixed(1)}): ${scores.filter(s => s >= q25 && s < q50).length} cows
- Bottom 25% (<${q25.toFixed(1)}): ${scores.filter(s => s < q25).length} cows

CULL CANDIDATES (${cullList.length} total, same logic as Culling page)
${cullLines}

OPEN COWS (last 2 breeding years, ${openCows.length} total)
${openCows.slice(0, 20).join('\n')}${openCows.length > 20 ? `\n... and ${openCows.length - 20} more` : ''}

TOP 10 COWS BY COMPOSITE SCORE
${top10}

BOTTOM 10 COWS BY COMPOSITE SCORE
${bottom10}`;
}

export async function fetchCowContext(tagNumber: string): Promise<string | null> {
  // Try exact tag match first, then partial
  let { data: animal } = await supabase.from('animals').select('*').eq('tag', tagNumber).limit(1).single();
  if (!animal) {
    const { data: partial } = await supabase.from('animals').select('*').ilike('tag', `%${tagNumber}%`).limit(1).single();
    animal = partial;
  }
  if (!animal) return null;

  const a = animal as any;
  const lid = a.lifetime_id;
  if (!lid) return `Found cow with tag ${tagNumber} but no lifetime_id linked.`;

  const records = await fetchAllRows<BreedingCalvingRecord>('blair_combined', { column: 'lifetime_id', value: lid });

  const lines = records
    .sort((a, b) => (a.breeding_year ?? 0) - (b.breeding_year ?? 0))
    .map(r =>
      `Year=${r.breeding_year} | AI1=${r.ai_date_1 || '—'} Sire1=${r.ai_sire_1 || '—'} | AI2=${r.ai_date_2 || '—'} Sire2=${r.ai_sire_2 || '—'} | Preg=${r.preg_stage || '—'} | Calving=${r.calving_date || '—'} | Calf Sire=${r.calf_sire || '—'} | Sex=${r.calf_sex || '—'} | Status=${r.calf_status || '—'} | BW=${r.calf_bw ?? '—'} | Gest=${r.gestation_days ?? '—'}d`
    ).join('\n');

  // Compute cow stats
  const cowStats = computeCowStats(a as Animal, records);

  return `\nSPECIFIC COW DATA — Tag: ${a.tag}, Lifetime ID: ${lid}
Animal: sire=${a.sire || '—'}, dam_sire=${a.dam_sire || '—'}, year_born=${a.year_born || '—'}, status=${a.status || '—'}, operation=${a.operation || '—'}, type=${a.animal_type || '—'}
Value Score: ${a.value_score ?? '—'} (percentile: ${a.value_score_percentile ?? '—'})
Composite: ${cowStats.composite_score} | Conception: ${cowStats.ai_conception_rate}% | Survival: ${cowStats.calf_survival_rate ?? '—'}% | Avg BW: ${cowStats.avg_bw}lbs | Total Calves: ${cowStats.total_calves}

Breeding Records (${records.length}):
${lines}`;
}
