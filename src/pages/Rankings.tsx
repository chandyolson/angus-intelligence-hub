import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveAnimals, useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { exportToCSV, computeCompositeFromRecords } from '@/lib/calculations';
import { Animal, BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, AlertTriangle } from 'lucide-react';
import { ShimmerSkeleton, ShimmerCard, ShimmerTableRows } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { EmptyState } from '@/components/ui/empty-state';

interface RankedCow {
  rank: number; lifetime_id: string; tag: string | null; year_born: number | null; sire: string | null;
  total_calves: number; ai_conception_rate: number; calf_survival_rate: number; avg_bw: number; composite_score: number;
  quartile: 'ELITE' | 'STRONG' | 'AVERAGE' | 'CULL WATCH';
}

interface CullFlag {
  tag: string | null; lifetime_id: string; year_born: number | null; composite_score: number;
  reason: string; details: string; reasonType: 'REPEATED OPEN' | 'LOW SCORE + AGE' | 'POOR SURVIVAL' | 'MISSING RECORDS';
}

interface SireMetrics { totalCalves: number; conceptionRate: number; avgGestation: number; avgBW: number; survivalRate: number; bullPct: number; }

function computeRankedCows(animals: Animal[], records: BreedingCalvingRecord[]): RankedCow[] {
  const byLid = new Map<string, BreedingCalvingRecord[]>();
  records.forEach(r => { if (r.lifetime_id) { const a = byLid.get(r.lifetime_id) || []; a.push(r); byLid.set(r.lifetime_id, a); } });

  const rows = animals.map(a => {
    const recs = byLid.get(a.lifetime_id ?? '') || [];
    const withCalf = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
    const bws = withCalf.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
    const avgBw = bws.length > 0 ? Math.round(bws.reduce((a, b) => a + b, 0) / bws.length) : 0;
    const conceptionRate = recs.length > 0 ? Math.round((withCalf.length / recs.length) * 1000) / 10 : 0;
    const liveCalves = withCalf.filter(r => r.calf_status?.toLowerCase() === 'alive').length;
    const survivalRate = withCalf.length > 0 ? Math.round((liveCalves / withCalf.length) * 1000) / 10 : 0;
    const composite = computeCompositeFromRecords(recs);
    return { lifetime_id: a.lifetime_id ?? '', tag: a.tag, year_born: a.year_born, sire: a.sire, total_calves: withCalf.length, ai_conception_rate: conceptionRate, calf_survival_rate: survivalRate, avg_bw: avgBw, composite_score: composite, rank: 0, quartile: 'AVERAGE' as const };
  });

  rows.sort((a, b) => b.composite_score - a.composite_score);
  const withScore = rows.filter(r => r.composite_score > 0);
  const q25 = withScore[Math.floor(withScore.length * 0.75)]?.composite_score ?? 0;
  const q50 = withScore[Math.floor(withScore.length * 0.5)]?.composite_score ?? 0;
  const q75 = withScore[Math.floor(withScore.length * 0.25)]?.composite_score ?? 0;

  return rows.map((r, i) => ({
    ...r, rank: i + 1,
    quartile: r.composite_score >= q75 ? 'ELITE' : r.composite_score >= q50 ? 'STRONG' : r.composite_score >= q25 ? 'AVERAGE' : 'CULL WATCH',
  }));
}

function computeCullFlags(ranked: RankedCow[], records: BreedingCalvingRecord[]): CullFlag[] {
  const currentYear = new Date().getFullYear();
  const byLid = new Map<string, BreedingCalvingRecord[]>();
  records.forEach(r => { if (r.lifetime_id) { const a = byLid.get(r.lifetime_id) || []; a.push(r); byLid.set(r.lifetime_id, a); } });
  const q25Threshold = [...ranked].filter(r => r.composite_score > 0).sort((a, b) => a.composite_score - b.composite_score);
  const q25Score = q25Threshold[Math.floor(q25Threshold.length * 0.25)]?.composite_score ?? 0;
  const flags: CullFlag[] = [];

  ranked.forEach(cow => {
    const recs = byLid.get(cow.lifetime_id) || [];
    const recentYears = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
    const openYears = recs.filter(r => r.breeding_year && recentYears.includes(r.breeding_year) && (r.preg_stage?.toLowerCase() === 'open' || r.calf_status?.toLowerCase() === 'open')).map(r => r.breeding_year!);
    if (openYears.length >= 2) flags.push({ ...cow, reason: 'REPEATED OPEN', reasonType: 'REPEATED OPEN', details: `Open in ${openYears.sort().join(' and ')}` });
    const age = cow.year_born ? currentYear - cow.year_born : 0;
    if (cow.composite_score > 0 && cow.composite_score <= q25Score && age >= 5) flags.push({ ...cow, reason: 'LOW SCORE + AGE', reasonType: 'LOW SCORE + AGE', details: `Score ${cow.composite_score}, born ${cow.year_born}` });
    if (cow.total_calves >= 3 && cow.calf_survival_rate < 85) flags.push({ ...cow, reason: 'POOR SURVIVAL', reasonType: 'POOR SURVIVAL', details: `${cow.calf_survival_rate}% survival over ${cow.total_calves} calvings` });
    const recentCalving = recs.some(r => r.breeding_year && r.breeding_year >= currentYear - 1 && r.calving_date);
    if (!recentCalving && recs.length > 0) flags.push({ ...cow, reason: 'MISSING RECORDS', reasonType: 'MISSING RECORDS', details: 'No calving in last 2 breeding years' });
  });
  return flags;
}

function computeSireMetrics(sire: string, records: BreedingCalvingRecord[]): SireMetrics {
  const recs = records.filter(r => r.calf_sire === sire || r.ai_sire_1 === sire);
  const withCalf = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
  const conceptionRate = recs.length > 0 ? Math.round((withCalf.length / recs.length) * 1000) / 10 : 0;
  const avgGestation = 0;
  const bws = withCalf.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
  const avgBW = bws.length > 0 ? Math.round(bws.reduce((a, b) => a + b, 0) / bws.length) : 0;
  const alive = withCalf.filter(r => r.calf_status?.toLowerCase() === 'alive');
  const survivalRate = withCalf.length > 0 ? Math.round((alive.length / withCalf.length) * 1000) / 10 : 0;
  const knownSex = withCalf.filter(r => r.calf_sex && r.calf_sex.trim() !== '');
  const bulls = knownSex.filter(r => ['bull', 'male', 'b', 'steer'].some(s => r.calf_sex!.toLowerCase().includes(s)));
  const bullPct = knownSex.length > 0 ? Math.round((bulls.length / knownSex.length) * 1000) / 10 : 0;
  return { totalCalves: withCalf.length, conceptionRate, avgGestation, avgBW, survivalRate, bullPct };
}

type ViewMode = 'top-bottom' | 'top50' | 'bottom50' | 'all';

export default function Rankings() {
  const { data: animals, isLoading: la, error: animalsError } = useActiveAnimals('Blair');
  const { data: records, isLoading: lr, error: recordsError } = useBreedingCalvingRecords();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('top-bottom');
  const [showCull, setShowCull] = useState(false);
  const [sireA, setSireA] = useState('');
  const [sireB, setSireB] = useState('');
  const [computing, setComputing] = useState(false);

  const ranked = useMemo(() => {
    if (!animals || !records) return [];
    return computeRankedCows(animals, records);
  }, [animals, records]);

  const cullFlags = useMemo(() => {
    if (!records || ranked.length === 0) return [];
    return computeCullFlags(ranked, records);
  }, [ranked, records]);

  const activeCowCount = useMemo(() => animals?.length ?? 0, [animals]);
  const uniqueFlaggedIds = useMemo(() => new Set(cullFlags.map(f => f.lifetime_id)), [cullFlags]);

  const sires = useMemo(() => {
    if (!records) return [];
    const counts = new Map<string, number>();
    records.forEach(r => { const s = r.calf_sire || r.ai_sire_1; if (s) counts.set(s, (counts.get(s) || 0) + 1); });
    return [...counts.entries()].filter(([, c]) => c >= 10).map(([s]) => s).sort();
  }, [records]);

  const sireComparison = useMemo(() => {
    if (!sireA || !sireB || !records) return null;
    return { a: computeSireMetrics(sireA, records), b: computeSireMetrics(sireB, records) };
  }, [sireA, sireB, records]);

  const quartileStyle = (q: string) => {
    switch (q) {
      case 'ELITE': return 'bg-success/20 text-success border-success/30';
      case 'STRONG': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'AVERAGE': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'CULL WATCH': return 'bg-destructive/20 text-destructive border-destructive/30';
      default: return '';
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 75) return 'bg-success/20 text-success';
    if (score >= 50) return 'bg-yellow-500/20 text-yellow-400';
    if (score >= 25) return 'bg-orange-500/20 text-orange-400';
    return 'bg-destructive/20 text-destructive';
  };

  const cullReasonStyle = (reason: string) => {
    switch (reason) {
      case 'REPEATED OPEN': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'LOW SCORE + AGE': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'POOR SURVIVAL': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'MISSING RECORDS': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return '';
    }
  };

  const betterColor = (a: number, b: number, higherBetter = true) => {
    if (a === b) return ['', ''];
    const aWins = higherBetter ? a > b : a < b;
    return aWins ? ['text-success', 'text-destructive'] : ['text-destructive', 'text-success'];
  };

  const handleExportCull = () => {
    const today = new Date().toISOString().split('T')[0];
    exportToCSV(cullFlags.map(f => ({ Tag: f.tag ?? '', Lifetime_ID: f.lifetime_id, Year_Born: f.year_born ?? '', Composite_Score: f.composite_score, Cull_Reason: f.reasonType, Details: f.details })), `cull_list_${today}.csv`);
  };

  const isLoading = la || lr;

  if (isLoading) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-60" />
      <ShimmerCard className="h-12" />
      <ShimmerSkeleton className="h-96" />
    </div>
  );

  if (animalsError || recordsError) return <ErrorBox />;

  const renderRow = (cow: RankedCow, i: number) => (
    <TableRow
      key={`${cow.lifetime_id}-${cow.rank}`}
      className="border-border cursor-pointer text-[13px]"
      style={{ backgroundColor: i % 2 === 0 ? undefined : '#0E1528' }}
      onClick={() => navigate(`/cow/${encodeURIComponent(cow.lifetime_id)}`)}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1A2A45')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? '' : '#0E1528')}
    >
      <TableCell className={`font-bold ${cow.rank <= 3 ? 'text-primary' : 'text-foreground'}`}>{cow.rank}</TableCell>
      <TableCell className="text-foreground font-medium">{cow.tag || '—'}</TableCell>
      <TableCell className="text-muted-foreground text-xs">{cow.lifetime_id}</TableCell>
      <TableCell>{cow.year_born || '—'}</TableCell>
      <TableCell>{cow.sire || '—'}</TableCell>
      <TableCell>{cow.total_calves}</TableCell>
      <TableCell>{cow.ai_conception_rate}%</TableCell>
      <TableCell>{cow.calf_survival_rate}%</TableCell>
      <TableCell>{cow.avg_bw || '—'}</TableCell>
      <TableCell><span className={`px-2 py-0.5 rounded text-xs font-semibold ${scoreColor(cow.composite_score)}`}>{cow.composite_score}</span></TableCell>
      <TableCell><Badge variant="outline" className={`text-xs ${quartileStyle(cow.quartile)}`}>{cow.quartile}</Badge></TableCell>
    </TableRow>
  );

  const renderRankingRows = () => {
    if (viewMode === 'top-bottom') {
      const top50 = ranked.slice(0, 50);
      const bottom50 = ranked.slice(-50);
      return (<>
        {top50.map((cow, i) => renderRow(cow, i))}
        <TableRow className="border-border"><TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-3 bg-secondary">— — — Top 50 ends · Bottom 50 begins — — —</TableCell></TableRow>
        {bottom50.map((cow, i) => renderRow(cow, i + 50))}
      </>);
    }
    const displayed = viewMode === 'top50' ? ranked.slice(0, 50) : viewMode === 'bottom50' ? ranked.slice(-50) : ranked;
    return displayed.map((cow, i) => renderRow(cow, i));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Rankings & Culling</h1>

      {/* Section 1: Rankings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Composite Score Rankings</CardTitle>
          <div className="flex gap-1">
            {(['top-bottom', 'top50', 'bottom50', 'all'] as ViewMode[]).map(mode => {
              const labels: Record<ViewMode, string> = { 'top-bottom': 'Top/Bottom 50', top50: 'Top 50', bottom50: 'Bottom 50', all: 'All Cows' };
              return (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                  {labels[mode]}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-auto rounded border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                  <TableHead className="text-[12px]">Rank</TableHead><TableHead className="text-[12px]">Tag</TableHead><TableHead className="text-[12px]">Lifetime ID</TableHead>
                  <TableHead className="text-[12px]">Year Born</TableHead><TableHead className="text-[12px]">Sire</TableHead><TableHead className="text-[12px]">Total Calves</TableHead>
                  <TableHead className="text-[12px]">AI Conception %</TableHead><TableHead className="text-[12px]">Survival %</TableHead><TableHead className="text-[12px]">Avg BW</TableHead>
                  <TableHead className="text-[12px]">Composite Score</TableHead><TableHead className="text-[12px]">Quartile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{renderRankingRows()}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Cull Engine */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Cull Recommendation Engine</CardTitle>
          <Button onClick={() => setShowCull(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm">
            <AlertTriangle className="h-4 w-4 mr-1" /> Generate Cull List
          </Button>
        </CardHeader>
        {showCull && (
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground font-semibold">{uniqueFlaggedIds.size}</span> cows flagged out of{' '}
                <span className="text-foreground font-semibold">{activeCowCount}</span> active ({activeCowCount > 0 ? Math.round((uniqueFlaggedIds.size / activeCowCount) * 100) : 0}%)
              </p>
              {cullFlags.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportCull} className="border-border">
                  <Download className="h-4 w-4 mr-1" /> Export CSV
                </Button>
              )}
            </div>
            {cullFlags.length === 0 ? <EmptyState message="No cows meet cull criteria." /> : (
              <div className="max-h-[500px] overflow-auto rounded border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                      <TableHead className="text-[12px]">Tag</TableHead><TableHead className="text-[12px]">Lifetime ID</TableHead><TableHead className="text-[12px]">Year Born</TableHead>
                      <TableHead className="text-[12px]">Composite Score</TableHead><TableHead className="text-[12px]">Cull Reason</TableHead><TableHead className="text-[12px]">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cullFlags.map((f, i) => (
                      <TableRow key={`${f.lifetime_id}-${f.reasonType}-${i}`} className="border-border text-[13px]" style={{ backgroundColor: '#1A0E00', borderLeft: '3px solid hsl(40, 63%, 49%)' }}>
                        <TableCell className="text-foreground font-medium">{f.tag || '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{f.lifetime_id}</TableCell>
                        <TableCell>{f.year_born || '—'}</TableCell>
                        <TableCell className="font-semibold text-destructive">{f.composite_score}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs ${cullReasonStyle(f.reasonType)}`}>{f.reasonType}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{f.details}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Section 3: Sire Comparison */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Compare Two Sires Side by Side</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Sire A</label>
              <Select value={sireA} onValueChange={setSireA}>
                <SelectTrigger className="w-[200px] bg-background border-border"><SelectValue placeholder="Select Sire A" /></SelectTrigger>
                <SelectContent>{sires.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <span className="text-muted-foreground mt-5">vs</span>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Sire B</label>
              <Select value={sireB} onValueChange={setSireB}>
                <SelectTrigger className="w-[200px] bg-background border-border"><SelectValue placeholder="Select Sire B" /></SelectTrigger>
                <SelectContent>{sires.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {sireComparison ? (
            <div className="overflow-auto rounded border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                    <TableHead className="text-[12px]">Metric</TableHead><TableHead className="text-[12px]">{sireA}</TableHead><TableHead className="text-[12px]">{sireB}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {([
                    { label: 'Total Calves', a: sireComparison.a.totalCalves, b: sireComparison.b.totalCalves, higherBetter: true },
                    { label: 'AI Conception Rate', a: `${sireComparison.a.conceptionRate}%`, b: `${sireComparison.b.conceptionRate}%`, aNum: sireComparison.a.conceptionRate, bNum: sireComparison.b.conceptionRate, higherBetter: true },
                    { label: 'Avg Gestation Days', a: sireComparison.a.avgGestation, b: sireComparison.b.avgGestation, higherBetter: false },
                    { label: 'Avg Calf BW', a: `${sireComparison.a.avgBW} lbs`, b: `${sireComparison.b.avgBW} lbs`, aNum: sireComparison.a.avgBW, bNum: sireComparison.b.avgBW, higherBetter: false },
                    { label: 'Calf Survival Rate', a: `${sireComparison.a.survivalRate}%`, b: `${sireComparison.b.survivalRate}%`, aNum: sireComparison.a.survivalRate, bNum: sireComparison.b.survivalRate, higherBetter: true },
                    { label: 'Bull Calf %', a: `${sireComparison.a.bullPct}%`, b: `${sireComparison.b.bullPct}%`, aNum: sireComparison.a.bullPct, bNum: sireComparison.b.bullPct, higherBetter: true },
                  ] as Array<{ label: string; a: string | number; b: string | number; aNum?: number; bNum?: number; higherBetter: boolean }>).map((row, i) => {
                    const aVal = row.aNum ?? (typeof row.a === 'number' ? row.a : 0);
                    const bVal = row.bNum ?? (typeof row.b === 'number' ? row.b : 0);
                    const [aColor, bColor] = betterColor(aVal, bVal, row.higherBetter);
                    return (
                      <TableRow key={row.label} className="border-border text-[13px]" style={{ backgroundColor: i % 2 === 1 ? '#0E1528' : undefined }}>
                        <TableCell className="text-muted-foreground font-medium">{row.label}</TableCell>
                        <TableCell className={`font-semibold ${aColor}`}>{row.a}</TableCell>
                        <TableCell className={`font-semibold ${bColor}`}>{row.b}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : <EmptyState message="Select two sires above to compare their performance metrics." />}
        </CardContent>
      </Card>
    </div>
  );
}
