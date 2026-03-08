import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Animal, BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, ExternalLink } from 'lucide-react';
import { computeCompositeFromRecords, computeCalvingIntervals } from '@/lib/calculations';

interface CullFlag {
  lifetime_id: string;
  reasonType: string;
}

interface CowLookupProps {
  animals: Animal[];
  records: BreedingCalvingRecord[];
  cullFlags: CullFlag[];
}

const PREG_STAGE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ai: { bg: 'bg-emerald-500', text: 'text-emerald-100', label: 'AI' },
  'second ai': { bg: 'bg-lime-500', text: 'text-lime-100', label: '2nd AI' },
  early: { bg: 'bg-yellow-500', text: 'text-yellow-100', label: 'Early' },
  middle: { bg: 'bg-yellow-500', text: 'text-yellow-100', label: 'Middle' },
  late: { bg: 'bg-orange-500', text: 'text-orange-100', label: 'Late' },
  open: { bg: 'bg-red-500', text: 'text-red-100', label: 'Open' },
};

function getCullSeverity(flags: CullFlag[], lid: string): { label: string; style: string } | null {
  const cowFlags = flags.filter(f => f.lifetime_id === lid);
  if (cowFlags.length === 0) return null;
  const types = new Set(cowFlags.map(f => f.reasonType));
  if (types.has('REPEATED OPEN') || types.has('POOR SURVIVAL'))
    return { label: 'URGENT', style: 'bg-destructive/20 text-destructive border-destructive/30' };
  if (types.has('LOW SCORE + AGE'))
    return { label: 'REVIEW', style: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
  return { label: 'MONITOR', style: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
}

export function CowLookup({ animals, records, cullFlags }: CowLookupProps) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const byLid = useMemo(() => {
    const map = new Map<string, BreedingCalvingRecord[]>();
    records.forEach(r => {
      if (r.lifetime_id) {
        const arr = map.get(r.lifetime_id) || [];
        arr.push(r);
        map.set(r.lifetime_id, arr);
      }
    });
    return map;
  }, [records]);

  // Herd averages for the 6 component scores
  const herdAvgs = useMemo(() => {
    const keys = [
      'c1_conception_score', 'c2_survival_score', 'c3_interval_score',
      'c4_calves_per_year_score', 'c5_gestation_score', 'c6_birthweight_score',
    ] as const;
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    keys.forEach(k => { sums[k] = 0; counts[k] = 0; });
    animals.forEach(a => {
      if (a.status?.toLowerCase() !== 'active') return;
      keys.forEach(k => {
        const v = a[k];
        if (v != null && (v as number) > 0) { sums[k] += v as number; counts[k]++; }
      });
    });
    const avgs: Record<string, number> = {};
    keys.forEach(k => { avgs[k] = counts[k] > 0 ? Math.round((sums[k] / counts[k]) * 10) / 10 : 0; });
    return avgs;
  }, [animals]);

  const matchedCow = useMemo(() => {
    if (search.trim().length < 2) return null;
    const q = search.trim().toLowerCase();
    return animals.find(a =>
      (a.tag && a.tag.toLowerCase() === q) ||
      (a.lifetime_id && a.lifetime_id.toLowerCase() === q)
    ) || animals.find(a =>
      (a.tag && a.tag.toLowerCase().includes(q)) ||
      (a.lifetime_id && a.lifetime_id.toLowerCase().includes(q))
    ) || null;
  }, [search, animals]);

  const cowData = useMemo(() => {
    if (!matchedCow || !matchedCow.lifetime_id) return null;
    const recs = byLid.get(matchedCow.lifetime_id) || [];
    const composite = computeCompositeFromRecords(recs, matchedCow.year_born);

    // AI Conception Rate
    const withAi = recs.filter(r => r.ai_date_1 != null);
    const aiConceived = withAi.filter(r => r.preg_stage?.toLowerCase() === 'ai' || r.preg_stage?.toLowerCase() === 'second ai');
    const aiRate = withAi.length > 0 ? Math.round((aiConceived.length / withAi.length) * 1000) / 10 : 0;

    // Total calves & survival
    const withCalf = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
    const alive = withCalf.filter(r => r.calf_status?.toLowerCase() === 'alive').length;
    const survivalRate = withCalf.length > 0 ? Math.round((alive / withCalf.length) * 1000) / 10 : 0;

    // Calving interval for this cow
    const cowIntervals = computeCalvingIntervals(recs);
    const avgInterval = cowIntervals?.average ?? null;

    // Age
    const currentYear = new Date().getFullYear();
    const age = matchedCow.year_born ? currentYear - matchedCow.year_born : null;

    // Calves per productive year
    const years = recs.map(r => r.breeding_year).filter(Boolean) as number[];
    const uniqueYears = new Set(years);
    const calvesPerYear = uniqueYears.size > 0 ? Math.round((withCalf.length / uniqueYears.size) * 10) / 10 : 0;

    // Last 5 breeding years timeline
    const allYears = recs.map(r => r.breeding_year).filter(Boolean) as number[];
    const maxYear = Math.max(...allYears, currentYear);
    const timeline = Array.from({ length: 5 }, (_, i) => {
      const yr = maxYear - 4 + i;
      const rec = recs.find(r => r.breeding_year === yr);
      return {
        year: yr,
        preg_stage: rec?.preg_stage?.toLowerCase() || null,
        raw_stage: rec?.preg_stage || null,
      };
    });

    // Dam Quality Index
    const dam = matchedCow.dam_lid ? animals.find(a => a.lifetime_id === matchedCow.dam_lid) : null;
    const damScore = dam ? computeCompositeFromRecords(byLid.get(dam.lifetime_id ?? '') || [], dam.year_born) : null;

    return {
      composite, aiRate, totalCalves: withCalf.length, survivalRate,
      avgInterval, age, calvesPerYear, timeline, damScore,
      components: {
        c1: matchedCow.c1_conception_score,
        c2: matchedCow.c2_survival_score,
        c3: matchedCow.c3_interval_score,
        c4: matchedCow.c4_calves_per_year_score,
        c5: matchedCow.c5_gestation_score,
        c6: matchedCow.c6_birthweight_score,
      },
    };
  }, [matchedCow, byLid, animals]);

  const scoreColorClass = (score: number) => {
    if (score >= 75) return 'text-emerald-400';
    if (score >= 50) return 'text-yellow-400';
    if (score >= 25) return 'text-orange-400';
    return 'text-red-400';
  };

  const componentDefs = [
    { key: 'c1', label: 'C1 Conception', herdKey: 'c1_conception_score', weight: '30%' },
    { key: 'c2', label: 'C2 Survival', herdKey: 'c2_survival_score', weight: '25%' },
    { key: 'c3', label: 'C3 Interval', herdKey: 'c3_interval_score', weight: '20%' },
    { key: 'c4', label: 'C4 Calves/Yr', herdKey: 'c4_calves_per_year_score', weight: '15%' },
    { key: 'c5', label: 'C5 Gestation', herdKey: 'c5_gestation_score', weight: '5%' },
    { key: 'c6', label: 'C6 Birth Wt', herdKey: 'c6_birthweight_score', weight: '5%' },
  ] as const;

  const cullSeverity = matchedCow ? getCullSeverity(cullFlags, matchedCow.lifetime_id ?? '') : null;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Cow Lookup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by tag or lifetime ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-background border-border"
          />
        </div>

        {search.trim().length >= 2 && !matchedCow && (
          <p className="text-sm text-muted-foreground">No cow found matching "{search}"</p>
        )}

        {matchedCow && cowData && (
          <div className="rounded-lg border border-border bg-background p-4 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-foreground">{matchedCow.tag || '—'}</span>
                  <span className="text-xs text-muted-foreground">{matchedCow.lifetime_id}</span>
                  {cullSeverity && (
                    <Badge variant="outline" className={`text-[10px] ${cullSeverity.style}`}>{cullSeverity.label}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {matchedCow.sire ? `Sire: ${matchedCow.sire}` : ''}{matchedCow.dam_sire ? ` · Dam Sire: ${matchedCow.dam_sire}` : ''}
                </p>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-bold ${scoreColorClass(cowData.composite)}`}>{cowData.composite}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Combined Score</div>
              </div>
            </div>

            {/* Component Bars vs Herd Average */}
            <div className="space-y-2">
              <h4 className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Component Scores vs Herd Average</h4>
              {componentDefs.map(comp => {
                const cowVal = cowData.components[comp.key as keyof typeof cowData.components] ?? 0;
                const herdVal = herdAvgs[comp.herdKey] ?? 0;
                const maxVal = 100;
                return (
                  <div key={comp.key} className="flex items-center gap-2">
                    <div className="w-28 text-[11px] text-muted-foreground truncate">{comp.label} <span className="text-[9px]">({comp.weight})</span></div>
                    <div className="flex-1 relative h-5 rounded bg-muted/30">
                      {/* Cow bar */}
                      <div
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                          width: `${Math.min((cowVal / maxVal) * 100, 100)}%`,
                          backgroundColor: cowVal >= 75 ? 'hsl(142, 71%, 45%)' : cowVal >= 50 ? 'hsl(48, 96%, 53%)' : cowVal >= 25 ? 'hsl(25, 95%, 53%)' : 'hsl(0, 72%, 51%)',
                          opacity: 0.8,
                        }}
                      />
                      {/* Herd average marker */}
                      <div
                        className="absolute inset-y-0 w-0.5 bg-foreground/50"
                        style={{ left: `${Math.min((herdVal / maxVal) * 100, 100)}%` }}
                        title={`Herd avg: ${herdVal}`}
                      />
                    </div>
                    <div className="w-10 text-right text-xs font-medium text-foreground">{cowVal > 0 ? cowVal : '—'}</div>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-emerald-500/80" /> Cow</span>
                <span className="flex items-center gap-1"><span className="h-4 w-0.5 bg-foreground/50" /> Herd Avg</span>
              </div>
            </div>

            {/* Key Stats Grid */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {[
                { label: 'Age', value: cowData.age != null ? `${cowData.age} yrs` : '—' },
                { label: 'Calving Interval', value: cowData.avgInterval != null ? `${cowData.avgInterval} d` : '—', warn: cowData.avgInterval != null && cowData.avgInterval > 365 },
                { label: 'AI Conception', value: `${cowData.aiRate}%` },
                { label: 'Total Calves', value: String(cowData.totalCalves) },
                { label: 'Calves/Prod Yr', value: String(cowData.calvesPerYear) },
                { label: 'Survival Rate', value: `${cowData.survivalRate}%` },
              ].map(stat => (
                <div key={stat.label} className="rounded border border-border p-2 text-center">
                  <div className={`text-sm font-bold ${stat.warn ? 'text-destructive' : 'text-foreground'}`}>{stat.value}</div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Breeding Timeline */}
            <div>
              <h4 className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Last 5 Breeding Years</h4>
              <div className="flex gap-2">
                {cowData.timeline.map(t => {
                  const stage = t.preg_stage ? PREG_STAGE_COLORS[t.preg_stage] || PREG_STAGE_COLORS['open'] : null;
                  return (
                    <div key={t.year} className="flex-1 text-center">
                      <div className={`rounded-md py-2 text-xs font-medium ${stage ? `${stage.bg} ${stage.text}` : 'bg-muted/30 text-muted-foreground'}`}>
                        {stage?.label || '—'}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">{t.year}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dam Quality Index */}
            {cowData.damScore != null && cowData.damScore > 0 && (
              <div className="flex items-center gap-3 rounded border border-border p-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Dam Quality Index</div>
                <div className={`text-lg font-bold ${scoreColorClass(cowData.damScore)}`}>{cowData.damScore}</div>
                <span className="text-xs text-muted-foreground">({matchedCow.dam_lid})</span>
              </div>
            )}

            {/* Link to detail */}
            <button
              onClick={() => navigate(`/cow/${encodeURIComponent(matchedCow.lifetime_id ?? '')}`)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View full cow detail <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
