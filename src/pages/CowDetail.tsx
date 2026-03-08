import { useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAnimal, useCowBreedingRecords, useBreedingCalvingRecords, useActiveAnimals } from '@/hooks/useCattleData';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft } from 'lucide-react';
import { ShimmerSkeleton, ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { EmptyState } from '@/components/ui/empty-state';
import { computeCompositeFromRecords } from '@/lib/calculations';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs">
      <p className="text-primary font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

function computeCowKPIs(recs: BreedingCalvingRecord[], yearBorn?: number | null) {
  const withCalf = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
  const totalCalves = withCalf.length;
  const bws = withCalf.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
  const avgBw = bws.length > 0 ? Math.round(bws.reduce((a, b) => a + b, 0) / bws.length) : 0;
  const withAiDate1 = recs.filter(r => r.ai_date_1 != null);
  const aiConceived = recs.filter(r => r.preg_stage?.toLowerCase() === 'ai' || r.preg_stage?.toLowerCase() === 'second ai');
  const conceptionRate = withAiDate1.length > 0 ? Math.round((aiConceived.length / withAiDate1.length) * 1000) / 10 : 0;
  const liveCalves = withCalf.filter(r => r.calf_status!.toLowerCase() === 'alive').length;
  const survivalRate = withCalf.length > 0 ? Math.round((liveCalves / withCalf.length) * 1000) / 10 : 0;
  const composite = computeCompositeFromRecords(recs, yearBorn);
  return { totalCalves, avgBw, conceptionRate, survivalRate, composite };
}

function generateNotes(recs: BreedingCalvingRecord[], kpis: ReturnType<typeof computeCowKPIs>, allCompositeScores: number[]) {
  const notes: string[] = [];
  if (kpis.totalCalves > 0) notes.push(`Calved ${kpis.totalCalves} time${kpis.totalCalves > 1 ? 's' : ''} with ${kpis.survivalRate}% calf survival rate.`);
  const years = recs.map(r => r.breeding_year).filter((v): v is number => v != null);
  const recentYears = [...new Set(years)].sort((a, b) => b - a).slice(0, 2);
  const openRecent = recs.filter(r => recentYears.includes(r.breeding_year!) && (r.preg_stage?.toLowerCase() === 'open' || r.calf_status?.toLowerCase() === 'open')).map(r => r.breeding_year);
  if (openRecent.length >= 2) notes.push(`⚠ Open in ${openRecent.sort().join(' and ')} — flagged for reproductive review.`);
  if (allCompositeScores.length > 0 && kpis.composite > 0) {
    const sorted = [...allCompositeScores].sort((a, b) => a - b);
    const q25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
    if (kpis.composite <= q25) notes.push('⚠ Bottom quartile composite score — candidate for culling evaluation.');
  }
  if (kpis.avgBw > 90) notes.push(`Birth weights trending heavy (avg ${kpis.avgBw} lbs) — monitor for calving difficulty.`);
  const withCalf = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
  const allLive = withCalf.length > 0 && withCalf.every(r => r.calf_status!.toLowerCase() === 'live');
  if (allLive && withCalf.length >= 2) notes.push('✓ 100% calf survival across all recorded calvings.');
  if (kpis.conceptionRate > 95 && recs.length >= 3) notes.push('✓ Elite AI conception rate.');
  if (notes.length === 0) notes.push('Insufficient data to generate performance observations.');
  return notes;
}

function pregColor(stage: string | null) {
  if (!stage) return '';
  const s = stage.toLowerCase();
  if (s === 'open') return 'text-destructive';
  if (s === 'pregnant' || s === 'bred') return 'text-success';
  return '';
}

function calfStatusColor(status: string | null) {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s === 'live') return 'text-success';
  if (['dead', 'stillborn', 'died'].includes(s)) return 'text-destructive';
  return '';
}

export default function CowDetail() {
  const navigate = useNavigate();
  const { lifetime_id } = useParams<{ lifetime_id: string }>();
  const decodedId = decodeURIComponent(lifetime_id || '');
  const { data: animal, isLoading: la, error: animalError } = useAnimal(decodedId);
  const { data: calvingRecords, isLoading: lr, error: calvingError } = useCowBreedingRecords(decodedId);
  // Derive ultrasound records from blair_combined data
  const ultrasoundRecords = useMemo(() => {
    if (!calvingRecords) return [];
    return calvingRecords
      .filter(r => r.ultrasound_date)
      .map(r => ({
        ultrasound_date: r.ultrasound_date,
        preg_stage: r.preg_stage,
        dog: r.dog,
        fetal_sex: r.fetal_sex,
        ultrasound_notes: r.ultrasound_notes,
      }));
  }, [calvingRecords]);
  const { data: allRecords } = useBreedingCalvingRecords();
  const { data: activeAnimals } = useActiveAnimals();

  const kpis = useMemo(() => calvingRecords ? computeCowKPIs(calvingRecords, animal?.year_born) : null, [calvingRecords, animal]);

  const activeLids = useMemo(() => new Set((activeAnimals ?? []).map(a => a.lifetime_id).filter(Boolean) as string[]), [activeAnimals]);

  const animalYearBorn = useMemo(() => new Map((activeAnimals ?? []).map(a => [a.lifetime_id ?? '', a.year_born ?? null] as [string, number | null])), [activeAnimals]);

  const allCompositeScores = useMemo(() => {
    if (!allRecords || activeLids.size === 0) return [];
    const byCow = new Map<string, BreedingCalvingRecord[]>();
    allRecords.forEach(r => { if (r.lifetime_id && activeLids.has(r.lifetime_id)) { const a = byCow.get(r.lifetime_id) || []; a.push(r); byCow.set(r.lifetime_id, a); } });
    const scores: number[] = [];
    byCow.forEach((recs, lid) => { const c = computeCompositeFromRecords(recs, animalYearBorn.get(lid)); if (c > 0) scores.push(c); });
    return scores;
  }, [allRecords, activeLids, animalYearBorn]);

  const notes = useMemo(() => {
    if (!calvingRecords || !kpis) return [];
    return generateNotes(calvingRecords, kpis, allCompositeScores);
  }, [calvingRecords, kpis, allCompositeScores]);

  const bwTrend = useMemo(() => {
    if (!calvingRecords) return [];
    return calvingRecords.filter(r => r.calf_bw && r.calf_bw > 0 && r.breeding_year)
      .sort((a, b) => (a.breeding_year ?? 0) - (b.breeding_year ?? 0))
      .map(r => ({ year: String(r.breeding_year), bw: r.calf_bw }));
  }, [calvingRecords]);

  const sortedCalving = useMemo(() => calvingRecords ? [...calvingRecords].sort((a, b) => (a.breeding_year ?? 0) - (b.breeding_year ?? 0)) : [], [calvingRecords]);
  const sortedUltrasound = useMemo(() => ultrasoundRecords ? [...ultrasoundRecords].sort((a, b) => (a.ultrasound_date ?? '').localeCompare(b.ultrasound_date ?? '')) : [], [ultrasoundRecords]);

  const loading = la || lr;

  if (loading) return (
    <div className="space-y-4">
      <ShimmerSkeleton className="h-6 w-40" />
      <ShimmerCard className="h-32" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <ShimmerCard key={i} />)}
      </div>
      <ShimmerSkeleton className="h-64" />
    </div>
  );

  if (animalError || calvingError) return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</button>
      <ErrorBox />
    </div>
  );

  if (!animal) return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</button>
      <EmptyState message="Animal not found." />
    </div>
  );

  const chips = [
    { label: 'Year Born', value: animal.year_born },
    { label: 'Sire', value: animal.sire },
    { label: 'Dam Sire', value: animal.dam_sire },
    { label: 'Animal Type', value: animal.animal_type },
    { label: 'Owner', value: animal.owner },
  ];

  const scoreColor = (score: number) => {
    if (score >= 75) return 'text-success';
    if (score >= 50) return 'text-yellow-400';
    if (score >= 25) return 'text-orange-400';
    return 'text-destructive';
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[20px] font-semibold text-foreground">
                Tag #{animal.tag || '—'} <span className="text-muted-foreground font-normal text-lg ml-2">{animal.lifetime_id}</span>
              </h1>
              <div className="flex flex-wrap gap-2 mt-3">
                {chips.map(c => (
                  <span key={c.label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">{c.label}:</span> {c.value || '—'}
                  </span>
                ))}
              </div>
            </div>
            <Badge className={`text-xs ${animal.status?.toLowerCase() === 'active' ? 'bg-success/20 text-success border-success/30' : 'bg-muted text-muted-foreground border-border'}`} variant="outline">
              {animal.status || '—'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* KPI Row */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total Calvings', value: kpis.totalCalves },
            { label: 'Avg Calf Birth Weight', value: kpis.avgBw ? `${kpis.avgBw} lbs` : '—' },
            { label: 'AI Conception Rate', value: `${kpis.conceptionRate}%` },
            { label: 'Calf Survival Rate', value: `${kpis.survivalRate}%` },
            { label: 'Composite Score', value: kpis.composite, color: scoreColor(kpis.composite) },
          ].map(k => (
            <Card key={k.label} className="bg-card border-border">
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <p className={`text-[24px] font-bold ${'color' in k && k.color ? k.color : 'text-primary'}`}>{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Performance Summary */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {notes.map((n, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>{n}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Birth Weight Trend */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Birth Weight Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {bwTrend.length < 2 ? <EmptyState message="Not enough data for trend chart." /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={bwTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                <XAxis dataKey="year" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} unit=" lbs" />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="bw" stroke="hsl(40, 63%, 49%)" strokeWidth={2} dot={{ r: 4 }} name="Birth Weight" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Calving History */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Calving History</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedCalving.length === 0 ? <EmptyState message="No calving records found for this cow." /> : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                    <TableHead className="text-[12px]">Year</TableHead><TableHead className="text-[12px]">AI Date</TableHead><TableHead className="text-[12px]">Sire Used</TableHead>
                    <TableHead className="text-[12px]">Preg Check</TableHead><TableHead className="text-[12px]">Calving Date</TableHead><TableHead className="text-[12px]">Calf Sex</TableHead>
                    <TableHead className="text-[12px]">Calf BW</TableHead><TableHead className="text-[12px]">Calf Status</TableHead><TableHead className="text-[12px]">Gestation Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCalving.map((r, i) => (
                    <TableRow key={i} className="border-border text-[13px]" style={{ backgroundColor: i % 2 === 1 ? '#0E1528' : undefined }}>
                      <TableCell>{r.breeding_year ?? '—'}</TableCell><TableCell className="text-xs">{r.ai_date_1 ?? '—'}</TableCell><TableCell>{r.calf_sire || r.ai_sire_1 || '—'}</TableCell>
                      <TableCell className={pregColor(r.preg_stage)}>{r.preg_stage ?? '—'}</TableCell><TableCell className="text-xs">{r.calving_date ?? '—'}</TableCell>
                      <TableCell>{r.calf_sex ?? '—'}</TableCell><TableCell>{r.calf_bw ?? '—'}</TableCell>
                      <TableCell className={calfStatusColor(r.calf_status)}>{r.calf_status ?? '—'}</TableCell><TableCell>{'—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ultrasound History */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Ultrasound Records</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedUltrasound.length === 0 ? <EmptyState message="No ultrasound records found for this cow." /> : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                    <TableHead className="text-[12px]">Ultrasound Date</TableHead><TableHead className="text-[12px]">Preg Stage</TableHead>
                    <TableHead className="text-[12px]">Days Gestation</TableHead><TableHead className="text-[12px]">Fetal Sex</TableHead><TableHead className="text-[12px]">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUltrasound.map((r, i) => (
                    <TableRow key={i} className="border-border text-[13px]" style={{ backgroundColor: i % 2 === 1 ? '#0E1528' : undefined }}>
                      <TableCell className="text-xs">{r.ultrasound_date ?? '—'}</TableCell><TableCell className={pregColor(r.preg_stage)}>{r.preg_stage ?? '—'}</TableCell>
                      <TableCell>{r.dog ?? '—'}</TableCell><TableCell>{r.fetal_sex ?? '—'}</TableCell><TableCell className="text-xs text-muted-foreground">{r.ultrasound_notes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
