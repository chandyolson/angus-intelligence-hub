import { useMemo } from 'react';
import { useAnimals, useBlairCombined } from '@/hooks/useCattleData';
import { computeCowStats, computeCalvingIntervals, computeCompositeFromRecords } from '@/lib/calculations';
import { BlairCombinedRecord, BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { AlertTriangle, Users, Crosshair, HeartPulse, Clock, Baby, Ban } from 'lucide-react';
import { ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { cn } from '@/lib/utils';

const QUARTILE_COLORS = ['hsl(0,86%,71%)', 'hsl(25,95%,53%)', 'hsl(45,93%,47%)', 'hsl(142,69%,58%)'];
const QUARTILE_LABELS = ['Bottom 25%', '25–50%', '50–75%', 'Top 25%'];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs">
      <p className="text-primary font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{p.unit ?? ''}</p>
      ))}
    </div>
  );
};

export default function Overview() {
  const { data: animals, isLoading: loadingAnimals, error: animalsError } = useAnimals();
  const { data: combined, isLoading: loadingCombined, error: combinedError } = useBlairCombined();
  const loading = loadingAnimals || loadingCombined;

  const blairActive = useMemo(() =>
    (animals ?? []).filter(a => a.operation === 'Blair' && a.status?.toLowerCase() === 'active'),
    [animals]
  );

  // Cast combined for BreedingCalvingRecord compatibility
  const records = combined as unknown as BreedingCalvingRecord[] | undefined;

  // ─── KPIs ───
  const kpis = useMemo(() => {
    if (!records || !blairActive.length) return null;
    const currentYear = new Date().getFullYear();

    const activeCowCount = blairActive.length;

    // First Service AI Rate: preg_stage=AI / total with ai_date_1
    const withAi1 = records.filter(r => r.ai_date_1 != null);
    const firstConceived = withAi1.filter(r => r.preg_stage?.toLowerCase() === 'ai').length;
    const firstServiceRate = withAi1.length > 0 ? (firstConceived / withAi1.length) * 100 : 0;

    // Calf Survival Rate (canonical: exclude cleanup, require calving_date + calf_status)
    const validCalves = records.filter(r =>
      r.calving_date != null && r.calf_status != null &&
      !(r.calf_sire && r.calf_sire.toLowerCase().includes('cleanup'))
    );
    const alive = validCalves.filter(r => r.calf_status?.toLowerCase() === 'alive').length;
    const survivalRate = validCalves.length > 0 ? (alive / validCalves.length) * 100 : 0;

    // Calving Interval
    const interval = computeCalvingIntervals(records);

    // Avg Gestation
    const gestations: number[] = [];
    records.forEach(r => {
      if (r.gestation_days != null && r.gestation_days >= 250 && r.gestation_days <= 310) {
        gestations.push(r.gestation_days);
      } else if (r.ai_date_1 && r.calving_date) {
        const d = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_1).getTime()) / 86400000);
        if (d >= 250 && d <= 310) gestations.push(d);
      }
    });
    const avgGestation = gestations.length > 0 ? gestations.reduce((a, b) => a + b, 0) / gestations.length : 0;

    // Current Season Open Rate
    const currentRecs = records.filter(r => r.breeding_year === currentYear || r.breeding_year === currentYear - 1);
    const latestYear = currentRecs.some(r => r.breeding_year === currentYear) ? currentYear : currentYear - 1;
    const seasonRecs = records.filter(r => r.breeding_year === latestYear);
    const openCount = seasonRecs.filter(r => r.preg_stage?.toLowerCase() === 'open').length;
    const openRate = seasonRecs.length > 0 ? (openCount / seasonRecs.length) * 100 : 0;

    return {
      activeCowCount,
      firstServiceRate: Math.round(firstServiceRate * 10) / 10,
      survivalRate: Math.round(survivalRate * 10) / 10,
      avgInterval: interval?.average ?? 0,
      medianInterval: interval?.median ?? 0,
      bestInterval: interval?.best ?? 0,
      longestInterval: interval?.longest ?? 0,
      avgGestation: Math.round(avgGestation * 10) / 10,
      openRate: Math.round(openRate * 10) / 10,
      openSeason: latestYear,
    };
  }, [records, blairActive]);

  // ─── Composite Score Distribution ───
  const quartileData = useMemo(() => {
    if (!records || !blairActive.length) return [];

    const scores: number[] = [];
    blairActive.forEach(a => {
      if (!a.lifetime_id) return;
      const cowRecs = records.filter(r => r.lifetime_id === a.lifetime_id);
      const score = computeCompositeFromRecords(cowRecs, a.year_born);
      if (score > 0) scores.push(score);
    });

    if (scores.length === 0) return [];

    const sorted = [...scores].sort((a, b) => a - b);
    const q25 = sorted[Math.floor(sorted.length * 0.25)];
    const q50 = sorted[Math.floor(sorted.length * 0.5)];
    const q75 = sorted[Math.floor(sorted.length * 0.75)];

    const buckets = [0, 0, 0, 0];
    scores.forEach(s => {
      if (s >= q75) buckets[3]++;
      else if (s >= q50) buckets[2]++;
      else if (s >= q25) buckets[1]++;
      else buckets[0]++;
    });

    return QUARTILE_LABELS.map((label, i) => ({ name: label, count: buckets[i], fill: QUARTILE_COLORS[i] }));
  }, [records, blairActive]);

  // ─── Year-over-Year Trends ───
  const yoyData = useMemo(() => {
    if (!records) return [];
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = 2021; y <= currentYear; y++) years.push(y);

    return years.map(yr => {
      const yearRecs = records.filter(r => r.breeding_year === yr);
      const withAi = yearRecs.filter(r => r.ai_date_1 != null);
      const aiConceived = withAi.filter(r => r.preg_stage?.toLowerCase() === 'ai').length;
      const firstServiceRate = withAi.length > 0 ? (aiConceived / withAi.length) * 100 : 0;

      const openCount = yearRecs.filter(r => r.preg_stage?.toLowerCase() === 'open').length;
      const openRate = yearRecs.length > 0 ? (openCount / yearRecs.length) * 100 : 0;

      return {
        year: String(yr),
        firstServiceRate: Math.round(firstServiceRate * 10) / 10,
        openRate: Math.round(openRate * 10) / 10,
      };
    });
  }, [records]);

  if (animalsError || combinedError) return <ErrorBox />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="-mx-6 -mt-6 px-6 pt-6 pb-4 mb-2" style={{ background: 'linear-gradient(180deg, hsl(224, 52%, 14%) 0%, hsl(224, 48%, 11%) 100%)' }}>
        <h1 className="text-[20px] font-semibold text-foreground">Herd Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Blair Bros Angus — live analytics from Supabase</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ShimmerCard key={i} />)}
        </div>
      ) : kpis ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard icon={Users} label="Active Cows" value={kpis.activeCowCount.toLocaleString()} />
            <KPICard icon={Crosshair} label="Avg 1st Service AI Rate" value={`${kpis.firstServiceRate}%`} />
            <KPICard icon={Baby} label="Avg Calf Survival Rate" value={`${kpis.survivalRate}%`} />
            <KPICard
              icon={Clock} label="Avg Calving Interval"
              value={`${kpis.avgInterval} days`}
              flagRed={kpis.avgInterval > 365}
              flagText={kpis.avgInterval > 365 ? `${kpis.avgInterval - 365} days over target` : undefined}
            />
            <KPICard icon={HeartPulse} label="Avg Gestation" value={`${kpis.avgGestation} days`} />
            <KPICard
              icon={Ban} label={`${kpis.openSeason} Open Rate`}
              value={`${kpis.openRate}%`}
              flagRed={kpis.openRate > 10}
              flagText={kpis.openRate > 10 ? 'Above 10% threshold' : undefined}
            />
          </div>

          {/* Two side-by-side cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Composite Score Distribution */}
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">Composite Score Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {quartileData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={quartileData} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(218,42%,20%)" />
                      <XAxis dataKey="name" tick={{ fill: 'hsl(219,23%,53%)', fontSize: 11 }} />
                      <YAxis tick={{ fill: 'hsl(219,23%,53%)', fontSize: 11 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Cows" radius={[4, 4, 0, 0]}>
                        {quartileData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-10">Insufficient data</p>
                )}
              </CardContent>
            </Card>

            {/* Calving Interval Summary */}
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">Calving Interval Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatBlock label="Average" value={`${kpis.avgInterval} days`} highlight={kpis.avgInterval > 365} />
                  <StatBlock label="Median" value={`${kpis.medianInterval} days`} />
                  <StatBlock label="Best" value={`${kpis.bestInterval} days`} accent />
                  <StatBlock label="Longest" value={`${kpis.longestInterval} days`} highlight />
                </div>

                {kpis.avgInterval > 365 && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-destructive">Lost Production Days</p>
                        <p className="text-2xl font-bold text-destructive mt-1">
                          {((kpis.avgInterval - 365) * kpis.activeCowCount).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          ({kpis.avgInterval - 365} days × {kpis.activeCowCount} active cows)
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {kpis.avgInterval <= 365 && (
                  <div className="bg-success/10 border border-success/30 rounded-lg p-4 text-center">
                    <p className="text-sm font-medium text-success">✓ Avg interval within 365-day target</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Year-Over-Year Trends */}
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-medium">Year-Over-Year Trends (2021–Present)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={yoyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218,42%,20%)" />
                  <XAxis dataKey="year" tick={{ fill: 'hsl(219,23%,53%)', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: 'hsl(219,23%,53%)', fontSize: 11 }}
                    domain={[0, 'auto']}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine
                    y={10}
                    stroke="hsl(0,86%,71%)"
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{ value: '10% Warning', position: 'right', fill: 'hsl(0,86%,71%)', fontSize: 10 }}
                  />
                  <Line
                    type="monotone" dataKey="firstServiceRate" name="1st Service AI Rate"
                    stroke="hsl(142,69%,58%)" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(142,69%,58%)' }}
                  />
                  <Line
                    type="monotone" dataKey="openRate" name="Open Rate"
                    stroke="hsl(0,86%,71%)" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(0,86%,71%)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

/* ─── Sub-components ─── */

function KPICard({ icon: Icon, label, value, flagRed, flagText }: {
  icon: React.ElementType; label: string; value: string;
  flagRed?: boolean; flagText?: string;
}) {
  return (
    <Card className={cn('bg-card border-l-4', flagRed ? 'border-destructive/60' : 'border-primary/40')}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={cn('h-4 w-4', flagRed ? 'text-destructive' : 'text-primary')} />
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
        </div>
        <p className={cn('text-2xl font-bold', flagRed ? 'text-destructive' : 'text-foreground')}>{value}</p>
        {flagText && (
          <div className="flex items-center gap-1 mt-1">
            <AlertTriangle className="h-3 w-3 text-destructive" />
            <span className="text-[10px] text-destructive font-medium">{flagText}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBlock({ label, value, highlight, accent }: {
  label: string; value: string; highlight?: boolean; accent?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-lg p-3 text-center',
      highlight ? 'bg-destructive/10' : accent ? 'bg-success/10' : 'bg-muted/30',
    )}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={cn(
        'text-lg font-bold',
        highlight ? 'text-destructive' : accent ? 'text-success' : 'text-foreground',
      )}>{value}</p>
    </div>
  );
}
