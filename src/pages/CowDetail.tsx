import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAnimal, useCowBreedingRecords, useUltrasoundRecords, useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft } from 'lucide-react';

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

function computeCowKPIs(recs: BreedingCalvingRecord[]) {
  const withCalf = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
  const totalCalves = withCalf.length;
  const bws = withCalf.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
  const avgBw = bws.length > 0 ? Math.round(bws.reduce((a, b) => a + b, 0) / bws.length) : 0;
  const settled = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open').length;
  const conceptionRate = recs.length > 0 ? Math.round((settled / recs.length) * 1000) / 10 : 0;
  const liveCalves = withCalf.filter(r => r.calf_status!.toLowerCase() === 'live').length;
  const survivalRate = withCalf.length > 0 ? Math.round((liveCalves / withCalf.length) * 1000) / 10 : 0;

  let bwConsistency = 50;
  if (bws.length >= 2) {
    const mean = bws.reduce((a, b) => a + b, 0) / bws.length;
    const std = Math.sqrt(bws.reduce((a, b) => a + (b - mean) ** 2, 0) / bws.length);
    bwConsistency = Math.max(0, Math.min(100, (1 - (mean > 0 ? std / mean : 0)) * 100));
  }
  const composite = recs.length > 0
    ? Math.round((conceptionRate * 0.4 + survivalRate * 0.35 + bwConsistency * 0.25) * 10) / 10
    : 0;

  return { totalCalves, avgBw, conceptionRate, survivalRate, composite };
}

function generateNotes(recs: BreedingCalvingRecord[], kpis: ReturnType<typeof computeCowKPIs>, allCompositeScores: number[]) {
  const notes: string[] = [];

  if (kpis.totalCalves > 0) {
    notes.push(`Calved ${kpis.totalCalves} time${kpis.totalCalves > 1 ? 's' : ''} with ${kpis.survivalRate}% calf survival rate.`);
  }

  // Open in 2 most recent breeding years
  const years = recs.map(r => r.breeding_year).filter((v): v is number => v != null);
  const recentYears = [...new Set(years)].sort((a, b) => b - a).slice(0, 2);
  const openRecent = recs.filter(r => recentYears.includes(r.breeding_year!) && r.preg_stage?.toLowerCase() === 'open')
    .map(r => r.breeding_year);
  if (openRecent.length >= 2) {
    notes.push(`⚠ Open in ${openRecent.sort().join(' and ')} — flagged for reproductive review.`);
  }

  // Bottom 25% composite
  if (allCompositeScores.length > 0 && kpis.composite > 0) {
    const sorted = [...allCompositeScores].sort((a, b) => a - b);
    const q25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
    if (kpis.composite <= q25) {
      notes.push('⚠ Bottom quartile composite score — candidate for culling evaluation.');
    }
  }

  if (kpis.avgBw > 90) {
    notes.push(`Birth weights trending heavy (avg ${kpis.avgBw} lbs) — monitor for calving difficulty.`);
  }

  const withCalf = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
  const allLive = withCalf.length > 0 && withCalf.every(r => r.calf_status!.toLowerCase() === 'live');
  if (allLive && withCalf.length >= 2) {
    notes.push('✓ 100% calf survival across all recorded calvings.');
  }

  if (kpis.conceptionRate > 95 && recs.length >= 3) {
    notes.push('✓ Elite AI conception rate.');
  }

  if (notes.length === 0) {
    notes.push('Insufficient data to generate performance observations.');
  }

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
  if (s === 'dead' || s === 'stillborn' || s === 'died') return 'text-destructive';
  return '';
}

export default function CowDetail() {
  const { lifetime_id } = useParams<{ lifetime_id: string }>();
  const decodedId = decodeURIComponent(lifetime_id || '');
  const { data: animal, isLoading: la } = useAnimal(decodedId);
  const { data: calvingRecords, isLoading: lr } = useCowBreedingRecords(decodedId);
  const { data: ultrasoundRecords, isLoading: lu } = useUltrasoundRecords(decodedId);
  const { data: allRecords } = useBreedingCalvingRecords();

  const kpis = useMemo(() => {
    if (!calvingRecords) return null;
    return computeCowKPIs(calvingRecords);
  }, [calvingRecords]);

  // All composite scores for quartile comparison
  const allCompositeScores = useMemo(() => {
    if (!allRecords) return [];
    const byCow = new Map<string, BreedingCalvingRecord[]>();
    allRecords.forEach(r => { if (r.lifetime_id) { const a = byCow.get(r.lifetime_id) || []; a.push(r); byCow.set(r.lifetime_id, a); } });
    const scores: number[] = [];
    byCow.forEach(recs => {
      const k = computeCowKPIs(recs);
      if (k.composite > 0) scores.push(k.composite);
    });
    return scores;
  }, [allRecords]);

  const notes = useMemo(() => {
    if (!calvingRecords || !kpis) return [];
    return generateNotes(calvingRecords, kpis, allCompositeScores);
  }, [calvingRecords, kpis, allCompositeScores]);

  const bwTrend = useMemo(() => {
    if (!calvingRecords) return [];
    return calvingRecords
      .filter(r => r.calf_bw && r.calf_bw > 0 && r.breeding_year)
      .sort((a, b) => (a.breeding_year ?? 0) - (b.breeding_year ?? 0))
      .map(r => ({ year: String(r.breeding_year), bw: r.calf_bw }));
  }, [calvingRecords]);

  const sortedCalving = useMemo(() => {
    if (!calvingRecords) return [];
    return [...calvingRecords].sort((a, b) => (a.breeding_year ?? 0) - (b.breeding_year ?? 0));
  }, [calvingRecords]);

  const sortedUltrasound = useMemo(() => {
    if (!ultrasoundRecords) return [];
    return [...ultrasoundRecords].sort((a, b) => (a.ultrasound_date ?? '').localeCompare(b.ultrasound_date ?? ''));
  }, [ultrasoundRecords]);

  const loading = la || lr || lu;

  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
    </div>
  );

  if (!animal) return (
    <div className="space-y-4">
      <Link to="/roster" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Roster
      </Link>
      <p className="text-destructive">Animal not found.</p>
    </div>
  );

  const chips = [
    { label: 'Year Born', value: animal.year_born },
    { label: 'Sire', value: animal.sire },
    { label: 'Dam Sire', value: animal.dam_sire },
    { label: 'Animal Type', value: animal.animal_type },
    { label: 'Owner', value: animal.owner },
  ];

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link to="/roster" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Roster
      </Link>

      {/* Header Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
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
            <Badge
              className={`text-xs ${animal.status?.toLowerCase() === 'active'
                ? 'bg-success/20 text-success border-success/30'
                : 'bg-muted text-muted-foreground border-border'}`}
              variant="outline"
            >
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
            { label: 'Composite Score', value: kpis.composite },
          ].map(k => (
            <Card key={k.label} className="bg-card border-border">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-xl font-bold text-primary">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Calving History Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground">Calving History</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedCalving.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No calving records found for this cow.</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar-background border-border hover:bg-sidebar-background">
                    <TableHead>Year</TableHead>
                    <TableHead>AI Date</TableHead>
                    <TableHead>Sire Used</TableHead>
                    <TableHead>Preg Check Result</TableHead>
                    <TableHead>Calving Date</TableHead>
                    <TableHead>Calf Sex</TableHead>
                    <TableHead>Calf BW</TableHead>
                    <TableHead>Calf Status</TableHead>
                    <TableHead>Gestation Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCalving.map((r, i) => (
                    <TableRow key={i} className={`border-border ${i % 2 === 0 ? 'bg-card' : 'bg-background'}`}>
                      <TableCell>{r.breeding_year ?? '—'}</TableCell>
                      <TableCell className="text-xs">{r.ai_date_1 ?? '—'}</TableCell>
                      <TableCell>{r.calf_sire || r.sire || '—'}</TableCell>
                      <TableCell className={pregColor(r.preg_stage)}>{r.preg_stage ?? '—'}</TableCell>
                      <TableCell className="text-xs">{r.calving_date ?? '—'}</TableCell>
                      <TableCell>{r.calf_sex ?? '—'}</TableCell>
                      <TableCell>{r.calf_bw ?? '—'}</TableCell>
                      <TableCell className={calfStatusColor(r.calf_status)}>{r.calf_status ?? '—'}</TableCell>
                      <TableCell>{r.gestation_days ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ultrasound History Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground">Ultrasound Records</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedUltrasound.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No ultrasound records found for this cow.</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar-background border-border hover:bg-sidebar-background">
                    <TableHead>Ultrasound Date</TableHead>
                    <TableHead>Preg Stage</TableHead>
                    <TableHead>Days Gestation at Scan</TableHead>
                    <TableHead>Fetal Sex</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUltrasound.map((r, i) => (
                    <TableRow key={i} className={`border-border ${i % 2 === 0 ? 'bg-card' : 'bg-background'}`}>
                      <TableCell className="text-xs">{r.ultrasound_date ?? '—'}</TableCell>
                      <TableCell className={pregColor(r.preg_stage)}>{r.preg_stage ?? '—'}</TableCell>
                      <TableCell>{r.dog ?? '—'}</TableCell>
                      <TableCell>{r.calf_sex ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.notes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Birth Weight Trend Chart */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground">Birth Weight Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {bwTrend.length < 2 ? (
            <p className="text-sm text-muted-foreground py-4">Not enough data for trend chart.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={bwTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 42% 20%)" />
                <XAxis dataKey="year" tick={{ fill: 'hsl(219 23% 53%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(219 23% 53%)', fontSize: 11 }} unit=" lbs" />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="bw" stroke="hsl(40 63% 49%)" strokeWidth={2} dot={{ r: 4 }} name="Birth Weight" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Performance Summary */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground">Performance Summary</CardTitle>
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
    </div>
  );
}
