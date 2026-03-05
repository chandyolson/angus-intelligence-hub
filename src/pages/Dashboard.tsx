import { useMemo } from 'react';
import { useActiveAnimals, useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { computeCowStats, computeCompositeScores, computeCalvingIntervals, getQuartile } from '@/lib/calculations';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle } from 'lucide-react';

const CHART_COLORS = { bg: '#111E35', grid: '#1E2E4A', gold: '#CA972E' };
const QUARTILE_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-card-border rounded-md px-3 py-2 text-xs">
      <p className="text-primary font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { data: animals, isLoading: loadingAnimals, error: animalsError } = useActiveAnimals();
  const { data: records, isLoading: loadingRecords, error: recordsError } = useBreedingCalvingRecords();

  const loading = loadingAnimals || loadingRecords;

  const cowStats = useMemo(() => {
    if (!animals || !records) return [];
    const raw = animals.map(a => computeCowStats(a, records));
    return computeCompositeScores(raw);
  }, [animals, records]);

  const kpis = useMemo(() => {
    if (!animals || !records) return null;
    const activeCows = animals.length;
    const withCalves = records.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
    const conceptionRate = records.length > 0 ? (withCalves.length / records.length) * 100 : 0;
    const alive = withCalves.filter(r => !['dead', 'stillborn', 'died'].includes(r.calf_status?.toLowerCase() || ''));
    const survivalRate = withCalves.length > 0 ? (alive.length / withCalves.length) * 100 : 0;
    const gestations = records.map(r => r.gestation_days).filter((v): v is number => v != null && v > 0);
    const avgGestation = gestations.length > 0 ? gestations.reduce((a, b) => a + b, 0) / gestations.length : 0;
    const recs2024 = records.filter(r => r.breeding_year === 2024);
    const open2024 = recs2024.filter(r => r.preg_stage?.toLowerCase() === 'open').length;
    const openRate2024 = recs2024.length > 0 ? (open2024 / recs2024.length) * 100 : 0;
    return { activeCows, conceptionRate, survivalRate, avgGestation, openRate2024, totalRecords: records.length };
  }, [animals, records]);

  const calvingIntervals = useMemo(() => {
    if (!records) return null;
    return computeCalvingIntervals(records);
  }, [records]);

  const scoreDistribution = useMemo(() => {
    if (cowStats.length === 0) return [];
    const scores = cowStats.filter(s => s.composite_score > 0).map(s => s.composite_score);
    const sorted = [...scores].sort((a, b) => a - b);
    const q25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
    const q50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    const q75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
    return [
      { name: 'Bottom 25%', count: scores.filter(s => s < q25).length },
      { name: '25-50%', count: scores.filter(s => s >= q25 && s < q50).length },
      { name: '50-75%', count: scores.filter(s => s >= q50 && s < q75).length },
      { name: 'Top 25%', count: scores.filter(s => s >= q75).length },
    ];
  }, [cowStats]);

  const yoyData = useMemo(() => {
    if (!records) return [];
    const byYear = new Map<number, { total: number; open: number; conceived: number }>();
    records.forEach(r => {
      if (!r.breeding_year) return;
      const y = byYear.get(r.breeding_year) || { total: 0, open: 0, conceived: 0 };
      y.total++;
      if (r.preg_stage?.toLowerCase() === 'open' || r.calf_status?.toLowerCase() === 'open') y.open++;
      if (r.calf_status && r.calf_status.toLowerCase() !== 'open') y.conceived++;
      byYear.set(r.breeding_year, y);
    });
    return Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, d]) => ({
        year: String(year),
        openRate: Math.round((d.open / d.total) * 1000) / 10,
        conceptionRate: Math.round((d.conceived / d.total) * 1000) / 10,
      }));
  }, [records]);

  const latestOpenRate = yoyData.length > 0 ? yoyData[yoyData.length - 1].openRate : 0;

  if (animalsError || recordsError) {
    return <div className="text-destructive p-4">Error loading data: {(animalsError || recordsError)?.message}</div>;
  }

  const KPICard = ({ label, value, suffix = '' }: { label: string; value: string | number; suffix?: string }) => (
    <Card className="bg-card border-card-border">
      <CardContent className="p-4">
        <p className="text-xs text-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold text-primary">{value}{suffix}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {latestOpenRate > 12 && (
        <Alert className="bg-[hsl(30,50%,10%)] border-primary text-foreground">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <AlertDescription>
            ⚠ Open rate trending upward ({latestOpenRate}%) — investigate nutrition, heat detection, and semen handling protocols.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard label="Active Cows" value={kpis.activeCows} />
          <KPICard label="AI Conception Rate" value={kpis.conceptionRate.toFixed(1)} suffix="%" />
          <KPICard label="Calf Survival Rate" value={kpis.survivalRate.toFixed(1)} suffix="%" />
          <KPICard label="Avg Gestation" value={Math.round(kpis.avgGestation)} suffix=" days" />
          <KPICard label="2024 Open Rate" value={kpis.openRate2024.toFixed(1)} suffix="%" />
          <KPICard label="Total Records" value={kpis.totalRecords.toLocaleString()} />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="name" tick={{ fill: '#6B7FA3', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6B7FA3', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {scoreDistribution.map((_, i) => (
                      <Cell key={i} fill={QUARTILE_COLORS[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Year-over-Year Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={yoyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="year" tick={{ fill: '#6B7FA3', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6B7FA3', fontSize: 11 }} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={10} stroke="#f87171" strokeDasharray="5 5" label={{ value: '10% Concern', fill: '#f87171', fontSize: 10 }} />
                  <Line type="monotone" dataKey="openRate" stroke="#f87171" name="Open Rate" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="conceptionRate" stroke={CHART_COLORS.gold} name="Conception Rate" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calving Interval */}
      {calvingIntervals && (
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Calving Interval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-muted-foreground">Average</p><p className="text-xl font-bold text-primary">{calvingIntervals.average} days</p></div>
              <div><p className="text-xs text-muted-foreground">Median</p><p className="text-xl font-bold text-primary">{calvingIntervals.median} days</p></div>
              <div><p className="text-xs text-muted-foreground">Best</p><p className="text-xl font-bold text-success">{calvingIntervals.best} days</p></div>
              <div><p className="text-xs text-muted-foreground">Longest</p><p className="text-xl font-bold text-destructive">{calvingIntervals.longest} days</p></div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Each day beyond 365 is a lost production day.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
