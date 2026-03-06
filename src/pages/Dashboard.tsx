import { useMemo } from 'react';
import { useAnimals, useBlairCombined } from '@/hooks/useCattleData';
import { computeCompositeFromRecords } from '@/lib/calculations';
import { BlairCombinedRecord, BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ReferenceLine, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ShimmerSkeleton, ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import BreedingTab from '@/components/dashboard/BreedingTab';

const QUARTILE_COLORS = ['#134e4a', '#0d9488', '#2dd4bf', '#5eead4'];
const SIRE_COLORS = ['hsl(40, 63%, 49%)', 'hsl(190, 60%, 45%)', 'hsl(0, 86%, 71%)', 'hsl(142, 69%, 58%)', 'hsl(270, 50%, 60%)', 'hsl(30, 80%, 55%)', 'hsl(200, 70%, 50%)', 'hsl(340, 60%, 55%)'];

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

/* ─── KPI computation from blair_combined ─── */
function computeKPIs(records: BlairCombinedRecord[], activeCowCount: number) {
  const withStatus = records.filter(r => r.calf_status != null);
  const alive = withStatus.filter(r => r.calf_status!.toLowerCase() === 'alive');
  const survivalRate = withStatus.length > 0 ? (alive.length / withStatus.length) * 100 : 0;

  // Conception: records with a calf (not open/dead) vs total
  const byCow = new Map<string, { settled: number; total: number }>();
  records.forEach(r => {
    if (!r.lifetime_id) return;
    const entry = byCow.get(r.lifetime_id) || { settled: 0, total: 0 };
    entry.total++;
    if (r.calf_status && !['open', 'dead'].includes(r.calf_status.toLowerCase())) entry.settled++;
    byCow.set(r.lifetime_id, entry);
  });
  const cowRates = Array.from(byCow.values()).filter(c => c.total > 0).map(c => (c.settled / c.total) * 100);
  const avgConception = cowRates.length > 0 ? cowRates.reduce((a, b) => a + b, 0) / cowRates.length : 0;

  // Gestation: compute from ai_date_1 → calving_date
  const gestations: number[] = [];
  records.forEach(r => {
    if (r.ai_date_1 && r.calving_date) {
      const days = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_1).getTime()) / 86400000);
      if (days >= 250 && days <= 310) gestations.push(days);
    }
  });
  const avgGestation = gestations.length > 0 ? gestations.reduce((a, b) => a + b, 0) / gestations.length : 0;

  const recs2024 = records.filter(r => r.breeding_year === 2024);
  const open2024 = recs2024.filter(r => r.preg_stage?.toLowerCase() === 'open').length;
  const openRate2024 = recs2024.length > 0 ? (open2024 / recs2024.length) * 100 : 0;

  return { activeCows: activeCowCount, avgConception, survivalRate, avgGestation, openRate2024, totalRecords: records.length };
}

/* ─── Score distribution (uses blair_combined as BreedingCalvingRecord-like) ─── */
function computeScoreDistribution(records: BlairCombinedRecord[]) {
  const byCow = new Map<string, BlairCombinedRecord[]>();
  records.forEach(r => { if (r.lifetime_id) { const a = byCow.get(r.lifetime_id) || []; a.push(r); byCow.set(r.lifetime_id, a); } });
  const scores: number[] = [];
  byCow.forEach(recs => {
    // Map to BreedingCalvingRecord shape for computeCompositeFromRecords
    const mapped: BreedingCalvingRecord[] = recs.map(r => ({
      lifetime_id: r.lifetime_id, breeding_year: r.breeding_year, ai_date_1: r.ai_date_1, ai_date_2: r.ai_date_2,
      ultrasound_date: r.ultrasound_date, preg_stage: r.preg_stage, fetal_sex: r.fetal_sex,
      calving_date: r.calving_date, calf_sire: r.calf_sire,
      calf_sex: r.calf_sex, calf_status: r.calf_status, calf_bw: r.calf_bw,
      ai_sire_1: r.ai_sire_1, ai_sire_2: r.ai_sire_2, dog: r.dog,
      cow_sire: r.cow_sire, project_record_id: r.project_record_id,
      group: r.group, memo: r.memo, ultrasound_notes: r.ultrasound_notes,
    }));
    const c = computeCompositeFromRecords(mapped);
    if (c > 0) scores.push(c);
  });
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

/* ─── Year-over-Year Trends ─── */
function computeYoY(records: BlairCombinedRecord[]) {
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

/* ─── Calving Interval ─── */
function computeCalvingIntervalsFull(records: BlairCombinedRecord[]) {
  const byCow = new Map<string, string[]>();
  records.forEach(r => { if (r.lifetime_id && r.calving_date) { const dates = byCow.get(r.lifetime_id) || []; dates.push(r.calving_date); byCow.set(r.lifetime_id, dates); } });
  const intervals: number[] = [];
  let cowCount = 0;
  byCow.forEach(dates => {
    if (dates.length < 2) return;
    cowCount++;
    const sorted = dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round((new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000);
      if (days > 200 && days < 800) intervals.push(days);
    }
  });
  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a - b);
  const avg = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
  const median = intervals[Math.floor(intervals.length / 2)];
  return { average: avg, median, best: intervals[0], longest: intervals[intervals.length - 1], cowCount };
}

/* ─── Sire Gestation Chart: GROUP BY calf_sire, AVG gestation ─── */
function computeSireGestation(records: BlairCombinedRecord[]) {
  const bySire = new Map<string, number[]>();
  records.forEach(r => {
    if (!r.calf_sire || !r.ai_date_1 || !r.calving_date) return;
    const days = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_1).getTime()) / 86400000);
    if (days < 250 || days > 310) return;
    const arr = bySire.get(r.calf_sire) || [];
    arr.push(days);
    bySire.set(r.calf_sire, arr);
  });
  return Array.from(bySire.entries())
    .filter(([, v]) => v.length >= 5)
    .map(([sire, vals]) => ({ sire, avgGestation: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, count: vals.length }))
    .sort((a, b) => a.avgGestation - b.avgGestation)
    .slice(0, 15);
}

/* ─── Sire AI Conception Chart: GROUP BY ai_sire_1, conception rate ─── */
function computeSireConception(records: BlairCombinedRecord[]) {
  const bySire = new Map<string, { total: number; conceived: number }>();
  records.forEach(r => {
    if (!r.ai_sire_1) return;
    const entry = bySire.get(r.ai_sire_1) || { total: 0, conceived: 0 };
    entry.total++;
    if (r.preg_stage && r.preg_stage.toLowerCase() !== 'open') entry.conceived++;
    bySire.set(r.ai_sire_1, entry);
  });
  return Array.from(bySire.entries())
    .filter(([, v]) => v.total >= 5)
    .map(([sire, d]) => ({ sire, conceptionRate: Math.round((d.conceived / d.total) * 1000) / 10, count: d.total }))
    .sort((a, b) => b.conceptionRate - a.conceptionRate)
    .slice(0, 15);
}

/* ─── Calf Sex Ratios: GROUP BY ai_sire_1 and calf_sex ─── */
function computeCalfSexRatios(records: BlairCombinedRecord[]) {
  const bySire = new Map<string, { bull: number; heifer: number; total: number }>();
  records.forEach(r => {
    if (!r.ai_sire_1 || !r.calf_sex) return;
    const entry = bySire.get(r.ai_sire_1) || { bull: 0, heifer: 0, total: 0 };
    const sex = r.calf_sex.toLowerCase();
    if (['bull', 'male', 'b', 'm', 'steer'].some(s => sex.includes(s))) entry.bull++;
    else if (['heifer', 'female', 'h', 'f'].some(s => sex.includes(s))) entry.heifer++;
    entry.total++;
    bySire.set(r.ai_sire_1, entry);
  });
  return Array.from(bySire.entries())
    .filter(([, v]) => v.total >= 5)
    .map(([sire, d]) => ({
      sire,
      bullPct: Math.round((d.bull / d.total) * 1000) / 10,
      heiferPct: Math.round((d.heifer / d.total) * 1000) / 10,
      total: d.total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: animals, isLoading: loadingAnimals, error: animalsError } = useAnimals();
  const { data: combined, isLoading: loadingCombined, error: combinedError } = useBlairCombined();
  const loading = loadingAnimals || loadingCombined;

  const blairAnimals = useMemo(() => animals?.filter(a => a.operation === 'Blair') ?? [], [animals]);
  const activeBlairAnimals = useMemo(() => blairAnimals.filter(a => a.status?.toLowerCase() === 'active'), [blairAnimals]);

  const records = combined ?? [];

  const kpis = useMemo(() => {
    if (!animals || !combined) return null;
    return computeKPIs(records, activeBlairAnimals.length);
  }, [animals, combined, records, activeBlairAnimals.length]);

  const scoreDistribution = useMemo(() => records.length > 0 ? computeScoreDistribution(records) : [], [records]);
  const yoyData = useMemo(() => records.length > 0 ? computeYoY(records) : [], [records]);
  const calvingIntervals = useMemo(() => records.length > 0 ? computeCalvingIntervalsFull(records) : null, [records]);
  const sireGestation = useMemo(() => records.length > 0 ? computeSireGestation(records) : [], [records]);
  const sireConception = useMemo(() => records.length > 0 ? computeSireConception(records) : [], [records]);
  const calfSexRatios = useMemo(() => records.length > 0 ? computeCalfSexRatios(records) : [], [records]);

  if (animalsError || combinedError) return <ErrorBox />;

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <div className="-mx-6 -mt-6 lg:-mt-6 px-6 pt-6 pb-4 mb-2" style={{ background: 'linear-gradient(180deg, hsl(224, 52%, 14%) 0%, hsl(224, 48%, 11%) 100%)' }}>
        <h1 className="text-[20px] font-semibold text-foreground mb-4">Dashboard</h1>
        <TabsList className="bg-sidebar border border-border">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Overview</TabsTrigger>
          <TabsTrigger value="breeding" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Breeding</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-0 space-y-6">

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ShimmerCard key={i} />)}
        </div>
      ) : kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Active Cows', value: kpis.activeCows, suffix: '', link: '/roster', gradient: 'linear-gradient(135deg, hsl(224, 52%, 14%) 0%, hsl(190, 40%, 18%) 100%)' },
            { label: 'Avg AI Conception Rate', value: kpis.avgConception.toFixed(1), suffix: '%', link: '/rankings', gradient: 'linear-gradient(135deg, hsl(224, 52%, 14%) 0%, hsl(40, 40%, 16%) 100%)' },
            { label: 'Avg Calf Survival Rate', value: kpis.survivalRate.toFixed(1), suffix: '%', link: '/rankings', gradient: 'linear-gradient(135deg, hsl(224, 52%, 14%) 0%, hsl(190, 40%, 18%) 100%)' },
            { label: 'Avg Gestation Length', value: Math.round(kpis.avgGestation), suffix: ' days', link: '/sire-analysis', gradient: 'linear-gradient(135deg, hsl(224, 52%, 14%) 0%, hsl(40, 40%, 16%) 100%)' },
            { label: '2024 Open Rate', value: kpis.openRate2024.toFixed(1), suffix: '%', alert: kpis.openRate2024 > 12, link: '/rankings', gradient: 'linear-gradient(135deg, hsl(224, 52%, 14%) 0%, hsl(190, 40%, 18%) 100%)' },
            { label: 'Total Records', value: kpis.totalRecords.toLocaleString(), suffix: '', link: '/roster', gradient: 'linear-gradient(135deg, hsl(224, 52%, 14%) 0%, hsl(40, 40%, 16%) 100%)' },
          ].map(k => (
            <Card
              key={k.label}
              className="border-border cursor-pointer hover:border-primary transition-colors"
              style={{ background: k.gradient }}
              onClick={() => navigate(k.link)}
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

      {/* Row 1: Score Distribution + Year-over-Year */}
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
                  <ReferenceLine y={10} stroke="hsl(0, 86%, 71%)" strokeDasharray="5 5" label={{ value: '10% threshold', fill: 'hsl(0, 86%, 71%)', fontSize: 10 }} />
                  <Line type="monotone" dataKey="openRate" stroke="hsl(0, 86%, 71%)" name="Open Rate" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="conceptionRate" stroke="hsl(142, 69%, 58%)" name="AI Conception Rate" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Sire Gestation + Sire AI Conception */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Avg Gestation by Calf Sire</CardTitle></CardHeader>
          <CardContent>
            {loading ? <ShimmerSkeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sireGestation} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                  <XAxis type="number" domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} unit=" d" />
                  <YAxis type="category" dataKey="sire" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 10 }} width={75} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avgGestation" name="Avg Gestation" radius={[0, 4, 4, 0]} fill="hsl(190, 60%, 45%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">AI Conception Rate by Sire</CardTitle></CardHeader>
          <CardContent>
            {loading ? <ShimmerSkeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sireConception} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="sire" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 10 }} width={75} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="conceptionRate" name="Conception Rate" radius={[0, 4, 4, 0]} fill="hsl(40, 63%, 49%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Calf Sex Ratios */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Calf Sex Ratio by AI Sire</CardTitle></CardHeader>
        <CardContent>
          {loading ? <ShimmerSkeleton className="h-64" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={calfSexRatios}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                <XAxis dataKey="sire" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="bullPct" name="Bull %" stackId="sex" fill="hsl(190, 60%, 45%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="heiferPct" name="Heifer %" stackId="sex" fill="hsl(40, 63%, 49%)" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(219, 23%, 53%)' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

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
      </TabsContent>

      <TabsContent value="breeding" className="mt-0">
        <BreedingTab />
      </TabsContent>
    </Tabs>
  );
}
