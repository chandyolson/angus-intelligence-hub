import { useMemo, useState } from 'react';
import { useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { EmptyState } from '@/components/ui/empty-state';
import { Trophy, AlertTriangle } from 'lucide-react';
import AdvancedSireSection from '@/components/sire-analysis/AdvancedSireSection';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, LabelList, ComposedChart, Line } from 'recharts';

interface SireRow {
  sire: string;
  rate: number;
  sampleSize: number;
  avgBW: number;
  survivalRate: number;
  badge: 'ELITE' | 'STRONG' | 'AVERAGE' | 'BELOW AVG';
}

interface CombinedSireRow {
  sire: string;
  rate1st: number;
  n1st: number;
  rate2nd: number;
  n2nd: number;
  avgBW: number;
  survivalRate: number;
  badge: 'ELITE' | 'STRONG' | 'AVERAGE' | 'BELOW AVG';
}



const rateColor = (rate: number) => {
  if (rate >= 70) return 'hsl(142, 71%, 45%)';
  if (rate >= 55) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

const badgeStyle = (badge: string) => {
  switch (badge) {
    case 'ELITE': return 'bg-success/20 text-success border-success/30';
    case 'STRONG': return 'bg-lime-500/20 text-lime-400 border-lime-500/30';
    case 'AVERAGE': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'BELOW AVG': return 'bg-destructive/20 text-destructive border-destructive/30';
    default: return '';
  }
};

const getBadge = (rate: number): SireRow['badge'] => {
  if (rate >= 70) return 'ELITE';
  if (rate >= 55) return 'STRONG';
  if (rate >= 45) return 'AVERAGE';
  return 'BELOW AVG';
};

function computeServiceTable(
  records: BreedingCalvingRecord[],
  service: '1st' | '2nd',
  minRecords = 10
): SireRow[] {
  const sireMap = new Map<string, { aiDates: number; conceived: number; bws: number[]; alive: number; withCalf: number }>();
  const isCleanup = (s: string) => s.toLowerCase().includes('cleanup');

  records.forEach(r => {
    const sire = service === '1st' ? r.ai_sire_1 : r.ai_sire_2;
    const aiDate = service === '1st' ? r.ai_date_1 : r.ai_date_2;
    const targetStage = service === '1st' ? 'ai' : 'second ai';

    if (!sire || isCleanup(sire) || !aiDate) return;

    const entry = sireMap.get(sire) || { aiDates: 0, conceived: 0, bws: [], alive: 0, withCalf: 0 };
    entry.aiDates++;
    if (r.preg_stage?.toLowerCase() === targetStage) entry.conceived++;

    // Calf-side stats (only from records where this sire is the calf_sire too, or from all records of this sire)
    if (r.calf_status && r.calf_status.toLowerCase() !== 'open') {
      entry.withCalf++;
      if (r.calf_status.toLowerCase() === 'alive') entry.alive++;
      if (r.calf_bw != null && r.calf_bw > 0) entry.bws.push(r.calf_bw);
    }

    sireMap.set(sire, entry);
  });

  const rows: SireRow[] = [];
  sireMap.forEach((data, sire) => {
    if (data.aiDates < minRecords) return;
    const rate = Math.round((data.conceived / data.aiDates) * 1000) / 10;
    const avgBW = data.bws.length > 0 ? Math.round(data.bws.reduce((a, b) => a + b, 0) / data.bws.length) : 0;
    const survivalRate = data.withCalf > 0 ? Math.round((data.alive / data.withCalf) * 1000) / 10 : 0;
    rows.push({ sire, rate, sampleSize: data.aiDates, avgBW, survivalRate, badge: getBadge(rate) });
  });

  return rows;
}

type CombinedSortKey = 'rate1st' | 'rate2nd' | 'n1st' | 'avgBW';

function CombinedSireTable({
  firstRows,
  secondRows,
}: {
  firstRows: SireRow[];
  secondRows: SireRow[];
}) {
  const [sortKey, setSortKey] = useState<CombinedSortKey>('rate1st');
  const [sortAsc, setSortAsc] = useState(false);

  const combinedRows = useMemo<CombinedSireRow[]>(() => {
    const sireSet = new Set<string>();
    firstRows.forEach(r => sireSet.add(r.sire));
    secondRows.forEach(r => sireSet.add(r.sire));

    const first = new Map(firstRows.map(r => [r.sire, r]));
    const second = new Map(secondRows.map(r => [r.sire, r]));

    return [...sireSet].map(sire => {
      const f = first.get(sire);
      const s = second.get(sire);
      const primaryRate = f?.rate ?? s?.rate ?? 0;
      return {
        sire,
        rate1st: f?.rate ?? 0,
        n1st: f?.sampleSize ?? 0,
        rate2nd: s?.rate ?? 0,
        n2nd: s?.sampleSize ?? 0,
        avgBW: f?.avgBW ?? s?.avgBW ?? 0,
        survivalRate: f?.survivalRate ?? s?.survivalRate ?? 0,
        badge: getBadge(primaryRate),
      };
    });
  }, [firstRows, secondRows]);

  const sorted = useMemo(() => {
    const s = [...combinedRows];
    s.sort((a, b) => sortAsc ? (a[sortKey] as number) - (b[sortKey] as number) : (b[sortKey] as number) - (a[sortKey] as number));
    return s;
  }, [combinedRows, sortKey, sortAsc]);

  const handleSort = (key: CombinedSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const arrow = (key: CombinedSortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  if (combinedRows.length === 0) return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">AI Conception Rates by Sire</CardTitle>
      </CardHeader>
      <CardContent><EmptyState message="No sires with sufficient records." /></CardContent>
    </Card>
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">AI Conception Rates by Sire</CardTitle>
        <div className="flex gap-1">
          {[
            { key: 'rate1st' as CombinedSortKey, label: '1st Rate' },
            { key: 'rate2nd' as CombinedSortKey, label: '2nd Rate' },
            { key: 'n1st' as CombinedSortKey, label: 'Usage' },
            { key: 'avgBW' as CombinedSortKey, label: 'BW' },
          ].map(col => (
            <button
              key={col.key}
              onClick={() => handleSort(col.key)}
              className={`px-3 py-1 text-xs rounded transition-colors ${sortKey === col.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
            >
              {col.label}{arrow(col.key)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                <TableHead className="text-[12px]">Sire</TableHead>
                <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort('rate1st')}>1st Service{arrow('rate1st')}</TableHead>
                <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort('n1st')}>n (1st){arrow('n1st')}</TableHead>
                <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort('rate2nd')}>2nd Service{arrow('rate2nd')}</TableHead>
                <TableHead className="text-[12px]">n (2nd)</TableHead>
                <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort('avgBW')}>Avg BW{arrow('avgBW')}</TableHead>
                <TableHead className="text-[12px]">Survival %</TableHead>
                <TableHead className="text-[12px]">Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s, i) => (
                <TableRow key={s.sire} className="border-border text-[13px]" style={{ backgroundColor: i % 2 === 1 ? 'hsl(var(--sidebar-background))' : undefined }}>
                  <TableCell className="font-medium text-foreground">{s.sire}</TableCell>
                  <TableCell>
                    {s.n1st > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="relative w-14 h-3 rounded-full bg-muted overflow-hidden">
                          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(s.rate1st, 100)}%`, backgroundColor: rateColor(s.rate1st) }} />
                        </div>
                        <span className="font-semibold text-xs" style={{ color: rateColor(s.rate1st) }}>{s.rate1st}%</span>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.n1st || '—'}</TableCell>
                  <TableCell>
                    {s.n2nd > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="relative w-14 h-3 rounded-full bg-muted overflow-hidden">
                          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(s.rate2nd, 100)}%`, backgroundColor: rateColor(s.rate2nd) }} />
                        </div>
                        <span className="font-semibold text-xs" style={{ color: rateColor(s.rate2nd) }}>{s.rate2nd}%</span>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.n2nd || '—'}</TableCell>
                  <TableCell>{s.avgBW > 0 ? s.avgBW : '—'}</TableCell>
                  <TableCell>{s.survivalRate}%</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${badgeStyle(s.badge)}`}>{s.badge}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SireAnalysis() {
  const { data: records, isLoading, error } = useBreedingCalvingRecords();
  const firstServiceRows = useMemo(() => records ? computeServiceTable(records, '1st') : [], [records]);
  const secondServiceRows = useMemo(() => records ? computeServiceTable(records, '2nd') : [], [records]);

  // Dynamic herd average 1st service rate: COUNT(preg_stage='AI') / COUNT(ai_date_1 IS NOT NULL)
  const herdAvg1stService = useMemo(() => {
    if (!records) return 0;
    const withAiDate1 = records.filter(r => r.ai_date_1 != null);
    if (withAiDate1.length === 0) return 0;
    const aiConceived = withAiDate1.filter(r => r.preg_stage?.toLowerCase() === 'ai').length;
    return Math.round((aiConceived / withAiDate1.length) * 1000) / 10;
  }, [records]);

  const topPerformer = useMemo(() => {
    const eligible = firstServiceRows.filter(s => s.sampleSize >= 25);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => a.rate > b.rate ? a : b);
  }, [firstServiceRows]);

  const mostUsedBelowAvg = useMemo(() => {
    const eligible = firstServiceRows.filter(s => s.rate < 55);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => a.sampleSize > b.sampleSize ? a : b);
  }, [firstServiceRows]);

  // Gestation by calf_sire (with avg BW overlay)
  const gestationData = useMemo(() => {
    if (!records) return [];
    const sireMap = new Map<string, { gests: number[]; bws: number[] }>();
    records.forEach(r => {
      if (!r.calf_sire || r.calf_sire.toLowerCase().includes('cleanup')) return;
      let gd = r.gestation_days;
      if (gd == null || gd < 250 || gd > 310) {
        if (r.calving_date && r.ai_date_1 && (r.preg_stage?.toLowerCase() === 'ai')) {
          const diff = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_1).getTime()) / 86400000);
          if (diff >= 250 && diff <= 310) gd = diff; else return;
        } else if (r.calving_date && r.ai_date_2 && (r.preg_stage?.toLowerCase() === 'second ai')) {
          const diff = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_2).getTime()) / 86400000);
          if (diff >= 250 && diff <= 310) gd = diff; else return;
        } else return;
      }
      const entry = sireMap.get(r.calf_sire) || { gests: [], bws: [] };
      entry.gests.push(gd);
      if (r.calf_bw != null && r.calf_bw > 0) entry.bws.push(r.calf_bw);
      sireMap.set(r.calf_sire, entry);
    });
    const rows: { name: string; avg: number; count: number; avgBW: number | null }[] = [];
    sireMap.forEach((d, sire) => {
      if (d.gests.length < 10) return;
      rows.push({
        name: sire,
        avg: Math.round((d.gests.reduce((a, b) => a + b, 0) / d.gests.length) * 10) / 10,
        count: d.gests.length,
        avgBW: d.bws.length > 0 ? Math.round((d.bws.reduce((a, b) => a + b, 0) / d.bws.length) * 10) / 10 : null,
      });
    });
    return rows.sort((a, b) => a.avg - b.avg);
  }, [records]);

  const herdAvgGestation = useMemo(() => {
    if (gestationData.length === 0) return 0;
    const total = gestationData.reduce((s, d) => s + d.avg * d.count, 0);
    const n = gestationData.reduce((s, d) => s + d.count, 0);
    return n > 0 ? Math.round((total / n) * 10) / 10 : 0;
  }, [gestationData]);

  // BW by ai_sire_1
  const bwData = useMemo(() => {
    if (!records) return [];
    const sireMap = new Map<string, number[]>();
    records.forEach(r => {
      if (!r.ai_sire_1 || r.ai_sire_1.toLowerCase().includes('cleanup')) return;
      if (r.calf_bw == null || r.calf_bw <= 0) return;
      const arr = sireMap.get(r.ai_sire_1) || [];
      arr.push(r.calf_bw);
      sireMap.set(r.ai_sire_1, arr);
    });
    const rows: { name: string; avg: number; count: number }[] = [];
    sireMap.forEach((vals, sire) => {
      if (vals.length < 10) return;
      rows.push({ name: sire, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, count: vals.length });
    });
    return rows.sort((a, b) => a.avg - b.avg);
  }, [records]);

  const herdAvgBW = useMemo(() => {
    if (bwData.length === 0) return 0;
    const total = bwData.reduce((s, d) => s + d.avg * d.count, 0);
    const n = bwData.reduce((s, d) => s + d.count, 0);
    return n > 0 ? Math.round((total / n) * 10) / 10 : 0;
  }, [bwData]);

  // Scatter: gestation vs BW (Blair only, calf_sire, 260-295 gestation range)
  const scatterData = useMemo(() => {
    if (!records) return { points: [], herdAvgGest: 0, herdAvgBW: 0 };
    const sireMap = new Map<string, { gests: number[]; bws: number[] }>();
    records.forEach(r => {
      if ((r as any).operation !== 'Blair') return;
      const sire = r.calf_sire;
      if (!sire) return;
      const gd = r.gestation_days;
      if (gd == null || gd < 260 || gd > 295) return;
      if (r.calf_bw == null || r.calf_bw <= 0) return;
      const entry = sireMap.get(sire) || { gests: [], bws: [] };
      entry.gests.push(gd);
      entry.bws.push(r.calf_bw);
      sireMap.set(sire, entry);
    });
    const points: { name: string; gestation: number; bw: number; count: number }[] = [];
    let allGest = 0, allBW = 0, allN = 0;
    sireMap.forEach((data, sire) => {
      if (data.gests.length < 10) return;
      const avgG = Math.round((data.gests.reduce((a, b) => a + b, 0) / data.gests.length) * 10) / 10;
      const avgB = Math.round((data.bws.reduce((a, b) => a + b, 0) / data.bws.length) * 10) / 10;
      points.push({ name: sire, gestation: avgG, bw: avgB, count: data.gests.length });
      allGest += avgG * data.gests.length;
      allBW += avgB * data.bws.length;
      allN += data.gests.length;
    });
    const herdAvgGest = allN > 0 ? Math.round((allGest / allN) * 10) / 10 : 0;
    const herdAvgBW = allN > 0 ? Math.round((allBW / allN) * 10) / 10 : 0;
    return { points, herdAvgGest, herdAvgBW };
  }, [records]);

  if (isLoading) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-48" />
      <ShimmerSkeleton className="h-96" />
    </div>
  );

  if (error) return <ErrorBox />;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Sire Analysis</h1>

      {/* Highlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topPerformer && (
          <Card className="bg-card border-success/40">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="h-5 w-5 text-success" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Top Performer (25+ records)</span>
              </div>
              <p className="text-xl font-bold text-foreground">{topPerformer.sire}</p>
              <p className="text-3xl font-bold mt-1" style={{ color: rateColor(topPerformer.rate) }}>{topPerformer.rate}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">1st Service AI Rate</p>
              <p className="text-sm text-muted-foreground mt-3">
                {topPerformer.sampleSize} units · {topPerformer.avgBW > 0 ? `${topPerformer.avgBW} lbs avg BW · ` : ''}{topPerformer.survivalRate}% survival
              </p>
            </CardContent>
          </Card>
        )}
        {mostUsedBelowAvg && (
          <Card className="bg-card border-destructive/40">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Most Used Below Average (&lt;55%)</span>
              </div>
              <p className="text-xl font-bold text-foreground">{mostUsedBelowAvg.sire}</p>
              <p className="text-3xl font-bold mt-1" style={{ color: rateColor(mostUsedBelowAvg.rate) }}>{mostUsedBelowAvg.rate}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">1st Service AI Rate</p>
              <p className="text-sm text-muted-foreground mt-3">
                {mostUsedBelowAvg.sampleSize} units · {mostUsedBelowAvg.avgBW > 0 ? `${mostUsedBelowAvg.avgBW} lbs avg BW · ` : ''}{mostUsedBelowAvg.survivalRate}% survival
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Combined Service Table */}
      <CombinedSireTable firstRows={firstServiceRows} secondRows={secondServiceRows} />
      <p className="text-xs text-muted-foreground -mt-4 px-1">
        💡 Herd average first service rate: {herdAvg1stService}%. Thresholds reflect Blair Bros historical performance.
      </p>

      {/* Gestation Length by Sire */}
      {gestationData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Gestation Length by Sire</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Bars = avg gestation days · ◆ markers = avg birth weight (lbs, top axis)
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(gestationData.length * 36, 200)}>
              <ComposedChart layout="vertical" data={gestationData} margin={{ left: 110, right: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis xAxisId="gest" type="number" domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <XAxis xAxisId="bw" type="number" orientation="top" tick={{ fill: 'hsl(var(--primary))', fontSize: 10 }} tickFormatter={(v: number) => `${v} lbs`} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={105} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string, entry: any) => {
                    if (name === 'avgBW') return [`${value} lbs`, 'Avg Birth Weight'];
                    return [`${value} days (n=${entry.payload.count})`, 'Avg Gestation'];
                  }} />
                <ReferenceLine xAxisId="gest" x={herdAvgGestation} stroke="hsl(var(--foreground))" strokeDasharray="5 5"
                  label={{ value: `Herd Avg: ${herdAvgGestation}d`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'top' }} />
                <Bar xAxisId="gest" dataKey="avg" radius={[0, 4, 4, 0]}>
                  {gestationData.map((d, i) => (
                    <Cell key={i} fill={d.avg <= 275.5 ? 'hsl(142, 71%, 45%)' : d.avg <= 278 ? 'hsl(48, 96%, 53%)' : 'hsl(0, 72%, 51%)'} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} formatter={(v: number) => `n=${v}`} />
                </Bar>
                <Line xAxisId="bw" dataKey="avgBW" stroke="hsl(var(--primary))" strokeWidth={0} dot={{ r: 5, fill: 'hsl(var(--primary))', strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Birth Weight by Sire */}
      {bwData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Birth Weight by Sire</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(bwData.length * 36, 200)}>
              <BarChart layout="vertical" data={bwData} margin={{ left: 110, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={105} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, _: string, entry: any) => [`${value} lbs (n=${entry.payload.count})`, 'Avg BW']} />
                <ReferenceLine x={herdAvgBW} stroke="hsl(var(--foreground))" strokeDasharray="5 5"
                  label={{ value: `Herd Avg: ${herdAvgBW} lbs`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'top' }} />
                <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                  {bwData.map((d, i) => (
                    <Cell key={i} fill={d.avg > 90 ? 'hsl(0, 72%, 51%)' : 'hsl(142, 71%, 45%)'} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} formatter={(v: number) => `n=${v}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Gestation vs Birth Weight Scatter */}
      {scatterData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Gestation vs Birth Weight by Sire</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={{ left: 10, right: 30, bottom: 30, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="gestation" name="Gestation (d)" type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  label={{ value: 'Avg Gestation (days)', position: 'bottom', offset: 15, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis dataKey="bw" name="Birth Weight (lbs)" type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  label={{ value: 'Avg BW (lbs)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <ZAxis dataKey="count" range={[60, 500]} name="Sample Size" />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
                        <p className="text-primary font-medium">{d.name}</p>
                        <p className="text-muted-foreground">Gestation: {d.gestation} days</p>
                        <p className="text-muted-foreground">Avg BW: {d.bw} lbs</p>
                        <p className="text-muted-foreground">Sample: {d.count} records</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} fill="hsl(var(--primary))">
                  <LabelList dataKey="name" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}


      {/* Advanced Section */}
      {records && records.length > 0 && <AdvancedSireSection records={records} />}
    </div>
  );
}
