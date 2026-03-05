import { BreedingCalvingRecord, CowStats, SireStats, CalvingIntervalStats, CullCandidate, Animal } from '@/types/cattle';

/** Compute per-cow composite using the canonical formula:
 *  avg of (conception score, survival score, BW consistency score) */
function computeConsistencyScore(bws: number[]): number {
  if (bws.length === 0) return 0;
  if (bws.length === 1) return 75;
  const mean = bws.reduce((a, b) => a + b, 0) / bws.length;
  if (mean === 0) return 0;
  const std = Math.sqrt(bws.reduce((a, b) => a + (b - mean) ** 2, 0) / bws.length);
  const cv = (std / mean) * 100;
  return Math.max(0, Math.min(100, 100 - cv));
}

export function computeCowStats(animal: Animal, records: BreedingCalvingRecord[]): CowStats {
  const cowRecords = records.filter(r => r.lifetime_id === animal.lifetime_id);
  const withCalves = cowRecords.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
  const totalCalves = withCalves.length;
  const bws = withCalves.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
  const avg_bw = bws.length > 0 ? bws.reduce((a, b) => a + b, 0) / bws.length : 0;

  const totalBreedings = cowRecords.length;
  const ai_conception_rate = totalBreedings > 0 ? (totalCalves / totalBreedings) * 100 : 0;

  const bornAlive = withCalves.filter(r => r.calf_status && !['dead', 'stillborn', 'died'].includes(r.calf_status.toLowerCase())).length;
  const calf_survival_rate = totalCalves > 0 ? (bornAlive / totalCalves) * 100 : 0;

  const consistency = computeConsistencyScore(bws);
  const composite = totalBreedings > 0
    ? Math.round(((ai_conception_rate + calf_survival_rate + consistency) / 3) * 10) / 10
    : 0;

  return {
    lifetime_id: animal.lifetime_id,
    tag: animal.tag,
    year_born: animal.year_born,
    sire: animal.sire,
    dam_sire: animal.dam_sire,
    status: animal.status,
    animal_type: animal.animal_type,
    total_calves: totalCalves,
    avg_bw: Math.round(avg_bw),
    ai_conception_rate: Math.round(ai_conception_rate * 10) / 10,
    calf_survival_rate: Math.round(calf_survival_rate * 10) / 10,
    composite_score: composite,
  };
}

export function computeCompositeScores(stats: CowStats[]): CowStats[] {
  // Already computed inline — pass-through
  return stats;
}

export function getQuartile(score: number, allScores: number[]): 'top' | 'upper' | 'lower' | 'bottom' {
  const sorted = [...allScores].sort((a, b) => a - b);
  const q25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const q50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const q75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  if (score >= q75) return 'top';
  if (score >= q50) return 'upper';
  if (score >= q25) return 'lower';
  return 'bottom';
}

export function computeCalvingIntervals(records: BreedingCalvingRecord[]): CalvingIntervalStats | null {
  const byCow = new Map<string, string[]>();
  records.forEach(r => {
    if (r.lifetime_id && r.calving_date) {
      const dates = byCow.get(r.lifetime_id) || [];
      dates.push(r.calving_date);
      byCow.set(r.lifetime_id, dates);
    }
  });

  const intervals: number[] = [];
  byCow.forEach(dates => {
    const sorted = dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round((new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 200 && days < 800) intervals.push(days);
    }
  });

  if (intervals.length === 0) return null;

  intervals.sort((a, b) => a - b);
  const avg = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
  const median = intervals[Math.floor(intervals.length / 2)];
  return { average: avg, median, best: intervals[0], longest: intervals[intervals.length - 1] };
}

/** Canonical composite score from raw records (for use in pages that don't have Animal objects) */
export function computeCompositeFromRecords(recs: BreedingCalvingRecord[]): number {
  const totalBreedings = recs.length;
  if (totalBreedings === 0) return 0;
  const withCalves = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
  const conceptionRate = (withCalves.length / totalBreedings) * 100;
  const liveCalves = withCalves.filter(r => r.calf_status && !['dead', 'stillborn', 'died'].includes(r.calf_status.toLowerCase())).length;
  const survivalRate = withCalves.length > 0 ? (liveCalves / withCalves.length) * 100 : 0;
  const bws = withCalves.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
  const consistency = computeConsistencyScore(bws);
  return Math.round(((conceptionRate + survivalRate + consistency) / 3) * 10) / 10;
}

export function computeSireStats(records: BreedingCalvingRecord[]): SireStats[] {
  const bySire = new Map<string, BreedingCalvingRecord[]>();
  records.forEach(r => {
    const sire = r.calf_sire || r.sire;
    if (sire) {
      const arr = bySire.get(sire) || [];
      arr.push(r);
      bySire.set(sire, arr);
    }
  });

  const stats: SireStats[] = [];
  bySire.forEach((recs, sire) => {
    if (recs.length < 20) return;
    const withCalves = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
    const totalCalves = withCalves.length;
    const conceptionRate = recs.length > 0 ? (totalCalves / recs.length) * 100 : 0;
    const gestations = recs.map(r => r.gestation_days).filter((v): v is number => v != null && v >= 250 && v <= 310);
    const avgGest = gestations.length > 0 ? gestations.reduce((a, b) => a + b, 0) / gestations.length : 0;
    const bws = withCalves.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
    const avgBW = bws.length > 0 ? bws.reduce((a, b) => a + b, 0) / bws.length : 0;
    const alive = withCalves.filter(r => r.calf_status && !['dead', 'stillborn', 'died'].includes(r.calf_status.toLowerCase())).length;
    const survival = totalCalves > 0 ? (alive / totalCalves) * 100 : 0;
    const knownSex = withCalves.filter(r => r.calf_sex && ['bull', 'male', 'b', 'm', 'steer'].some(s => r.calf_sex!.toLowerCase().includes(s)));
    const totalKnownSex = withCalves.filter(r => r.calf_sex && r.calf_sex.trim() !== '').length;
    const bullPct = totalKnownSex > 0 ? (knownSex.length / totalKnownSex) * 100 : 50;

    let badge: SireStats['performance_badge'] = 'AVERAGE';
    if (conceptionRate >= 95) badge = 'ELITE';
    else if (conceptionRate >= 88) badge = 'STRONG';
    else if (conceptionRate < 80) badge = 'BELOW AVG';

    stats.push({
      sire,
      total_calves: totalCalves,
      ai_conception_rate: Math.round(conceptionRate * 10) / 10,
      avg_gestation_days: Math.round(avgGest * 10) / 10,
      avg_calf_bw: Math.round(avgBW),
      calf_survival_rate: Math.round(survival * 10) / 10,
      bull_calf_pct: Math.round(bullPct * 10) / 10,
      performance_badge: badge,
    });
  });

  return stats.sort((a, b) => b.ai_conception_rate - a.ai_conception_rate);
}

export function generateCullList(
  cowStats: CowStats[],
  records: BreedingCalvingRecord[],
  currentYear: number
): CullCandidate[] {
  const allScores = cowStats.filter(s => s.composite_score > 0).map(s => s.composite_score);
  const sorted = [...allScores].sort((a, b) => a - b);
  const q25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;

  const candidates: CullCandidate[] = [];

  cowStats.forEach(cow => {
    const reasons: string[] = [];
    const cowRecords = records.filter(r => r.lifetime_id === cow.lifetime_id);

    const recentOpens = cowRecords.filter(r =>
      r.breeding_year && r.breeding_year >= currentYear - 3 &&
      (r.preg_stage?.toLowerCase() === 'open' || r.calf_status?.toLowerCase() === 'open')
    ).length;
    if (recentOpens >= 2) reasons.push(`Open ${recentOpens}x in last 4 years`);

    const age = cow.year_born ? currentYear - cow.year_born : 0;
    if (cow.composite_score > 0 && cow.composite_score <= q25 && age >= 5) {
      reasons.push('Bottom 25% composite score & 5+ years old');
    }

    if (cow.total_calves >= 3 && cow.calf_survival_rate < 85) {
      reasons.push(`Low calf survival rate (${cow.calf_survival_rate}%)`);
    }

    const recentCalving = cowRecords.some(r =>
      r.breeding_year && r.breeding_year >= currentYear - 1 && r.calving_date
    );
    if (!recentCalving && cowRecords.length > 0) {
      reasons.push('No calving record in last 2 breeding years');
    }

    if (reasons.length > 0) {
      candidates.push({
        lifetime_id: cow.lifetime_id,
        tag: cow.tag,
        year_born: cow.year_born,
        sire: cow.sire,
        composite_score: cow.composite_score,
        reasons,
      });
    }
  });

  return candidates.sort((a, b) => a.composite_score - b.composite_score);
}

export function generatePerformanceNotes(
  cow: CowStats,
  records: BreedingCalvingRecord[]
): string[] {
  const notes: string[] = [];
  const cowRecords = records.filter(r => r.lifetime_id === cow.lifetime_id);

  if (cow.total_calves > 0) {
    notes.push(`This cow has calved ${cow.total_calves} time${cow.total_calves > 1 ? 's' : ''} with ${cow.calf_survival_rate}% calf survival.`);
  }

  if (cow.ai_conception_rate === 100 && cow.total_calves >= 3) {
    notes.push('Perfect AI conception rate — highly efficient breeder.');
  }

  const openYears = cowRecords
    .filter(r => r.preg_stage?.toLowerCase() === 'open' || r.calf_status?.toLowerCase() === 'open')
    .map(r => r.breeding_year)
    .filter(Boolean);
  if (openYears.length > 0) {
    notes.push(`Open in ${openYears.join(' and ')} — flagged for review.`);
  }

  if (cow.avg_bw > 0) {
    if (cow.avg_bw > 95) notes.push(`Above-average birth weight (${cow.avg_bw} lbs) — monitor for calving difficulty.`);
    else if (cow.avg_bw < 70) notes.push(`Below-average birth weight (${cow.avg_bw} lbs).`);
  }

  if (cow.composite_score >= 75) {
    notes.push('Top-tier composite score — retain as a priority.');
  } else if (cow.composite_score > 0 && cow.composite_score < 40) {
    notes.push('Low composite score — review for potential culling.');
  }

  if (notes.length === 0) {
    notes.push('Insufficient data to generate performance observations.');
  }

  return notes;
}

export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => {
    const val = row[h];
    const str = Array.isArray(val) ? val.join('; ') : String(val ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
