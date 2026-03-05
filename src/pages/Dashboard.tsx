import { useMemo, useState, useEffect } from 'react';
import { useActiveAnimals, useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { computeCalvingIntervals, computeCompositeFromRecords } from '@/lib/calculations';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ShimmerSkeleton, ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';

const QUARTILE_COLORS = ['#134e4a', '#0d9488', '#2dd4bf', '#5eead4'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs">
      <p className="text-primary font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</p>
      ))}
    </div>
  );
};

function computeKPIs(records: BreedingCalvingRecord[], activeCowCount: number) {
  const byCow = new Map<string, { settled: number; total: number }>();
  records.forEach(r => {
    if (!r.lifetime_id) return;
    const entry = byCow.get(r.lifetime_id) || { settled: 0, total: 0 };
    entry.total++;
    if (r.calf_status && r.calf_status.toLowerCase() !== 'open' && r.calf_status.toLowerCase() !== 'dead') entry.settled++;
    byCow.set(r.lifetime_id, entry);
  });
  const cowRates = Array.from(byCow.values()).filter(c => c.total > 0).map(c => (c.settled / c.total) * 100);
  const avgConception = cowRates.length > 0 ? cowRates.reduce((a, b) => a + b, 0) / cowRates.length : 0;
  const withStatus = records.filter(r => r.calf_status != null);
  const alive = withStatus.filter(r => r.calf_status!.toLowerCase() === 'alive');
  const survivalRate = withStatus.length > 0 ? (alive.length / withStatus.length) * 100 : 0;
  const gestations = records.map(r => r.gestation_days).filter((v): v is number => v != null && v >= 250 && v <= 310);
  const avgGestation = gestations.length > 0 ? gestations.reduce((a, b) => a + b, 0) / gestations.length : 0;
  const recs2024 = records.filter(r => r.breeding_year === 2024);
  const open2024 = recs2024.filter(r => r.preg_stage?.toLowerCase() === 'open').length;
  const openRate2024 = recs2024.length > 0 ? (open2024 / recs2024.length) * 100 : 0;
  return { activeCows: activeCowCount, avgConception, survivalRate, avgGestation, openRate2024, totalRecords: records.length };
}

function computeScoreDistribution(records: BreedingCalvingRecord[]) {
  const byCow = new Map<string, BreedingCalvingRecord[]>();
  records.forEach(r => { if (r.lifetime_id) { const a = byCow.get(r.lifetime_id) || []; a.push(r); byCow.set(r.lifetime_id, a); } });
  const scores: number[] = [];
  byCow.forEach(recs => { const c = computeCompositeFromRecords(recs); if (c > 0) scores.push(c); });
  if (scores.length === 0) return [];
  const sorted = [...scores].sort((a, b) => a - b);
  const q25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const q50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const q75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  return [
    { name: 'Bottom 25%', count: scores.filter(s => s < q25).length },
    { name: '25–50%', count: scores.filter(s => s >= q25 && s < q50).length },
    { name: '50–75%', count: scores.filter(s => s >= q50 && s < q75).length },
    { name: 'Top 25%', count: scores.filter(s => s >= q75).length },
  ];
}

function computeYoY(records: BreedingCalvingRecord[]) {
  const byYear = new Map<number, { total: number; open: number; conceived: number }>();
  records.forEach(r => {
    if (!r.breeding_year) return;
    const y = byYear.get(r.breeding_year) || { total: 0, open: 0, conceived: 0 };
    y.total++;
    if (r.preg_stage?.toLowerCase() === 'open') y.open++;
    if (r.calf_status && r.calf_status.toLowerCase() !== 'open') y.conceived++;
    byYear.set(r.breeding_year, y);
  });
  return Array.from(byYear.entries()).sort(([a], [b]) => a - b).map(([year, d]) => ({
    year: String(year),
    openRate: Math.round((d.open / d.total) * 1000) / 10,
    conceptionRate: Math.round((d.conceived / d.total) * 1000) / 10,
  }));
}

function computeCalvingIntervalsFull(records: BreedingCalvingRecord[]) {
  const byCow = new Map<string, string[]>();
  records.forEach(r => { if (r.lifetime_id && r.calving_date) { const dates = byCow.get(r.lifetime_id) || []; dates.push(r.calving_date); byCow.set(r.lifetime_id, dates); } });
  const intervals: number[] = [];
  let cowCount = 0;
  byCow.forEach(dates => {
    if (dates.length < 2) return;
    cowCount++;
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
  return { average: avg, median, best: intervals[0], longest: intervals[intervals.length - 1], cowCount };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: animals, isLoading: loadingAnimals, error: animalsError } = useActiveAnimals('Blair');
  const { data: records, isLoading: loadingRecords, error: recordsError } = useBreedingCalvingRecords();
  const loading = loadingAnimals || loadingRecords;

  const kpis = useMemo(() => {
    if (!animals || !records) return null;
    return computeKPIs(records, animals.length);
  }, [animals, records]);

  const scoreDistribution = useMemo(() => records ? computeScoreDistribution(records) : [], [records]);
  const yoyData = useMemo(() => records ? computeYoY(records) : [], [records]);
  const calvingIntervals = useMemo(() => records ? computeCalvingIntervalsFull(records) : null, [records]);

  if (animalsError || recordsError) return <ErrorBox />;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Dashboard</h1>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ShimmerCard key={i} />)}
        </div>
      ) : kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Active Cows', value: kpis.activeCows, suffix: '' },
            { label: 'Avg AI Conception Rate', value: kpis.avgConception.toFixed(1), suffix: '%' },
            { label: 'Avg Calf Survival Rate', value: kpis.survivalRate.toFixed(1), suffix: '%' },
            { label: 'Avg Gestation Length', value: Math.round(kpis.avgGestation), suffix: ' days' },
            { label: '2024 Open Rate', value: kpis.openRate2024.toFixed(1), suffix: '%', alert: kpis.openRate2024 > 12 },
            { label: 'Total Calving Records', value: kpis.totalRecords.toLocaleString(), suffix: '' },
          ].map(k => (
            <Card
              key={k.label}
              className={`bg-card border-border ${k.label === 'Active Cows' ? 'cursor-pointer hover:border-primary transition-colors' : ''}`}
              onClick={k.label === 'Active Cows' ? () => navigate('/roster') : undefined}
            >
              <CardContent className="p-4">
                <p className={`text-[24px] font-bold ${'alert' in k && k.alert ? 'text-destructive' : 'text-primary'}`}>{k.value}{k.suffix}</p>
                <p className="text-[13px] text-foreground mt-1">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Alert Banner */}
      {kpis && kpis.openRate2024 > 12 && (
        <div className="w-full rounded-md px-4 py-3 flex items-start gap-3" style={{ backgroundColor: '#1A0E00', borderLeft: '3px solid hsl(var(--primary))' }}>
          <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">⚠ Open rate is trending upward. Investigate nutrition, body condition score at breeding time, heat detection accuracy, and semen handling protocols.</p>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Score Distribution</CardTitle></CardHeader>
          <CardContent>
            {loading ? <ShimmerSkeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {scoreDistribution.map((_, i) => <Cell key={i} fill={QUARTILE_COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Year-over-Year Trends</CardTitle></CardHeader>
          <CardContent>
            {loading ? <ShimmerSkeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={yoyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                  <XAxis dataKey="year" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={10} stroke="hsl(0, 86%, 71%)" strokeDasharray="5 5" label={{ value: '10% concern threshold', fill: 'hsl(0, 86%, 71%)', fontSize: 10 }} />
                  <Line type="monotone" dataKey="openRate" stroke="hsl(0, 86%, 71%)" name="Open Rate" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="conceptionRate" stroke="hsl(142, 69%, 58%)" name="AI Conception Rate" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calving Interval */}
      {calvingIntervals && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Calving Interval</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Average', value: `${calvingIntervals.average} days`, alert: calvingIntervals.average > 370 },
                { label: 'Median', value: `${calvingIntervals.median} days` },
                { label: 'Best (Shortest)', value: `${calvingIntervals.best} days`, success: true },
                { label: 'Longest', value: `${calvingIntervals.longest} days`, alert: calvingIntervals.longest > 370 },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className={`text-[22px] font-bold ${'alert' in s && s.alert ? 'text-destructive' : 'success' in s ? 'text-success' : 'text-primary'}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {calvingIntervals.average > 365
                ? `Each extra day beyond 365 is one lost production day. At ${calvingIntervals.average} days average, that's ${calvingIntervals.average - 365} days × ${calvingIntervals.cowCount} cows = ${(calvingIntervals.average - 365) * calvingIntervals.cowCount} lost production days annually.`
                : `Your herd average of ${calvingIntervals.average} days is within the optimal range.`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
