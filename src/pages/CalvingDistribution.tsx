import { useMemo, useState } from 'react';
import { useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
  ComposedChart, Legend,
} from 'recharts';

// ── helpers ──
function getWeekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

const YEAR_COLORS = [
  'hsl(142, 71%, 45%)', 'hsl(217, 91%, 60%)', 'hsl(35, 95%, 55%)',
  'hsl(280, 65%, 60%)', 'hsl(0, 72%, 51%)', 'hsl(175, 60%, 45%)',
  'hsl(48, 96%, 53%)', 'hsl(330, 70%, 55%)',
];

interface CalvingRecord {
  date: Date;
  week: number;
  year: number;
  calfStatus: string | null;
}

function parseRecords(records: BreedingCalvingRecord[]): CalvingRecord[] {
  return records
    .filter(r => (r as any).operation === 'Blair' && r.calving_date)
    .map(r => {
      const d = new Date(r.calving_date!);
      return { date: d, week: getWeekOfYear(d), year: r.breeding_year ?? d.getFullYear(), calfStatus: r.calf_status };
    });
}

// ── Summary stats per year ──
interface YearSummary {
  year: number;
  seasonLength: number;
  pctFirst21: number;
  pctAfter42: number;
  peakWeek: number;
  totalCalves: number;
}

function computeSummaries(parsed: CalvingRecord[], years: number[]): YearSummary[] {
  return years.map(year => {
    const recs = parsed.filter(r => r.year === year);
    if (recs.length === 0) return { year, seasonLength: 0, pctFirst21: 0, pctAfter42: 0, peakWeek: 0, totalCalves: 0 };

    const dates = recs.map(r => r.date.getTime()).sort((a, b) => a - b);
    const seasonLength = Math.round((dates[dates.length - 1] - dates[0]) / 86400000);
    const firstDate = dates[0];

    let inFirst21 = 0;
    let after42 = 0;
    recs.forEach(r => {
      const dayOfSeason = (r.date.getTime() - firstDate) / 86400000;
      if (dayOfSeason <= 21) inFirst21++;
      if (dayOfSeason > 42) after42++;
    });

    // Peak week
    const weekCounts = new Map<number, number>();
    recs.forEach(r => weekCounts.set(r.week, (weekCounts.get(r.week) || 0) + 1));
    let peakWeek = 0;
    let peakCount = 0;
    weekCounts.forEach((c, w) => { if (c > peakCount) { peakCount = c; peakWeek = w; } });

    return {
      year,
      seasonLength,
      pctFirst21: Math.round((inFirst21 / recs.length) * 1000) / 10,
      pctAfter42: Math.round((after42 / recs.length) * 1000) / 10,
      peakWeek,
      totalCalves: recs.length,
    };
  }).sort((a, b) => b.year - a.year);
}

// ── Chart 1 data: calves per week-of-year, one series per year ──
function buildWeeklyByYear(parsed: CalvingRecord[], years: number[]) {
  const weekMap = new Map<number, Map<number, number>>(); // week -> year -> count
  parsed.filter(r => years.includes(r.year)).forEach(r => {
    if (!weekMap.has(r.week)) weekMap.set(r.week, new Map());
    const ym = weekMap.get(r.week)!;
    ym.set(r.year, (ym.get(r.year) || 0) + 1);
  });

  const allWeeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
  return allWeeks.map(week => {
    const row: any = { week: `W${week}` };
    years.forEach(y => { row[`y${y}`] = weekMap.get(week)?.get(y) || 0; });
    return row;
  });
}

// ── Chart 2 data: combined bars with survival coloring ──
function buildSurvivalByWeek(parsed: CalvingRecord[], selectedYear: number | 'all', years: number[]) {
  const filtered = parsed.filter(r => selectedYear === 'all' ? years.includes(r.year) : r.year === selectedYear);
  const weekMap = new Map<number, { total: number; alive: number; withStatus: number }>();
  filtered.forEach(r => {
    const e = weekMap.get(r.week) || { total: 0, alive: 0, withStatus: 0 };
    e.total++;
    if (r.calfStatus) {
      e.withStatus++;
      if (r.calfStatus.toLowerCase() === 'alive') e.alive++;
    }
    weekMap.set(r.week, e);
  });

  const allWeeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
  return allWeeks.map(week => {
    const d = weekMap.get(week)!;
    const survPct = d.withStatus >= 5 ? Math.round((d.alive / d.withStatus) * 1000) / 10 : null;
    return { week: `W${week}`, count: d.total, survivalPct: survPct };
  });
}

// ── Chart 3 data: cumulative % by normalized day ──
function buildCumulative(parsed: CalvingRecord[], years: number[]) {
  // For each year, normalize to "day of season" and compute cumulative %
  const yearData: Map<number, number[]> = new Map();
  years.forEach(year => {
    const recs = parsed.filter(r => r.year === year);
    if (recs.length === 0) return;
    const timestamps = recs.map(r => r.date.getTime()).sort((a, b) => a - b);
    const first = timestamps[0];
    const dayOffsets = timestamps.map(t => Math.round((t - first) / 86400000));
    yearData.set(year, dayOffsets);
  });

  // Find the max season length across all years
  let maxDay = 0;
  yearData.forEach(days => { const m = days[days.length - 1]; if (m > maxDay) maxDay = m; });

  // Build weekly buckets (every 7 days)
  const weeks: number[] = [];
  for (let d = 0; d <= maxDay; d += 7) weeks.push(d);
  if (weeks[weeks.length - 1] < maxDay) weeks.push(maxDay);

  return weeks.map(day => {
    const row: any = { day };
    yearData.forEach((days, year) => {
      const total = days.length;
      const born = days.filter(d => d <= day).length;
      row[`y${year}`] = Math.round((born / total) * 1000) / 10;
    });
    return row;
  });
}

const survivalColor = (survPct: number | null) => {
  if (survPct == null) return 'hsl(var(--muted-foreground))';
  if (survPct >= 100) return 'hsl(142, 71%, 45%)';
  if (survPct >= 97) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

export default function CalvingDistribution() {
  const { data: records, isLoading, error } = useBreedingCalvingRecords();

  const parsed = useMemo(() => records ? parseRecords(records) : [], [records]);
  const availableYears = useMemo(() => {
    const ys = new Set(parsed.map(r => r.year));
    return Array.from(ys).sort((a, b) => b - a);
  }, [parsed]);

  const currentYear = new Date().getFullYear();
  const defaultYears = useMemo(() => availableYears.filter(y => y >= currentYear - 5), [availableYears, currentYear]);

  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const activeYears = selectedYears.length > 0 ? selectedYears : defaultYears;

  const [survivalYear, setSurvivalYear] = useState<number | 'all'>('all');

  const summaries = useMemo(() => computeSummaries(parsed, activeYears), [parsed, activeYears]);
  const weeklyData = useMemo(() => buildWeeklyByYear(parsed, activeYears), [parsed, activeYears]);
  const survivalData = useMemo(() => buildSurvivalByWeek(parsed, survivalYear, activeYears), [parsed, survivalYear, activeYears]);
  const cumulativeData = useMemo(() => buildCumulative(parsed, activeYears), [parsed, activeYears]);

  const toggleYear = (y: number) => {
    setSelectedYears(prev => {
      const current = prev.length > 0 ? prev : defaultYears;
      return current.includes(y) ? current.filter(x => x !== y) : [...current, y].sort((a, b) => b - a);
    });
  };

  if (isLoading) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-48" />
      <ShimmerSkeleton className="h-96" />
    </div>
  );
  if (error) return <ErrorBox />;

  const yearColorMap = new Map<number, string>();
  const sortedActive = [...activeYears].sort((a, b) => a - b);
  sortedActive.forEach((y, i) => yearColorMap.set(y, YEAR_COLORS[i % YEAR_COLORS.length]));

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Calving Distribution</h1>

      {/* Year selector */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mr-1">Years:</span>
        {availableYears.map(y => (
          <button
            key={y}
            onClick={() => toggleYear(y)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
              activeYears.includes(y)
                ? 'border-primary bg-primary/20 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Summary stats table */}
      {summaries.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Season Summary by Year</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                    <TableHead className="text-[11px]">Year</TableHead>
                    <TableHead className="text-[11px]">Total Calves</TableHead>
                    <TableHead className="text-[11px]">Season Length (d)</TableHead>
                    <TableHead className="text-[11px]">% First 21 Days</TableHead>
                    <TableHead className="text-[11px]">% After Day 42</TableHead>
                    <TableHead className="text-[11px]">Peak Week</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((s, i) => (
                    <TableRow key={s.year} className="text-[12px] border-border"
                      style={{ backgroundColor: i % 2 === 1 ? 'hsl(var(--sidebar-background))' : undefined }}>
                      <TableCell className="font-medium text-foreground">{s.year}</TableCell>
                      <TableCell className="text-muted-foreground">{s.totalCalves}</TableCell>
                      <TableCell className="text-muted-foreground">{s.seasonLength}</TableCell>
                      <TableCell>
                        <span className="font-semibold" style={{ color: s.pctFirst21 >= 60 ? 'hsl(142, 71%, 45%)' : s.pctFirst21 >= 40 ? 'hsl(48, 96%, 53%)' : 'hsl(0, 72%, 51%)' }}>
                          {s.pctFirst21}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold" style={{ color: s.pctAfter42 <= 10 ? 'hsl(142, 71%, 45%)' : s.pctAfter42 <= 20 ? 'hsl(48, 96%, 53%)' : 'hsl(0, 72%, 51%)' }}>
                          {s.pctAfter42}%
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">W{s.peakWeek}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart 1 — Calving Distribution by Week of Year */}
      {weeklyData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Calving Distribution by Week of Year</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              One line per breeding year. A tight, early peak indicates a well-managed calving window.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={380}>
              <AreaChart data={weeklyData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  label={{ value: 'Calves Born', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {sortedActive.map(y => (
                  <Area key={y} type="monotone" dataKey={`y${y}`} name={`${y}`}
                    stroke={yearColorMap.get(y)} fill={yearColorMap.get(y)} fillOpacity={0.15}
                    strokeWidth={2} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Chart 2 — Calving Distribution with Survival Rate Overlay */}
      {survivalData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Calving by Week with Survival Overlay</CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Bar color = survival rate (green ≥100%, yellow 97–99%, red &lt;97%, gray = &lt;5 calves). Line = survival %.
                </p>
              </div>
              <Select value={String(survivalYear)} onValueChange={v => setSurvivalYear(v === 'all' ? 'all' : Number(v))}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {activeYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(142, 71%, 45%)' }} /> 100% Survival</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(48, 96%, 53%)' }} /> 97–99%</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(0, 72%, 51%)' }} /> &lt;97%</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(var(--muted-foreground))' }} /> &lt;5 calves</span>
            </div>
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={survivalData} margin={{ top: 10, right: 50, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <YAxis yAxisId="count" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  label={{ value: 'Calves Born', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis yAxisId="surv" orientation="right" domain={[85, 101]} tick={{ fill: 'hsl(var(--primary))', fontSize: 11 }}
                  label={{ value: 'Survival %', angle: 90, position: 'insideRight', fill: 'hsl(var(--primary))', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number | null, name: string) => {
                    if (name === 'survivalPct') return [value != null ? `${value}%` : '—', 'Survival %'];
                    return [`${value}`, 'Calves'];
                  }} />
                <Bar yAxisId="count" dataKey="count" radius={[4, 4, 0, 0]}>
                  {survivalData.map((d, i) => (
                    <Cell key={i} fill={survivalColor(d.survivalPct)} />
                  ))}
                </Bar>
                <Line yAxisId="surv" type="monotone" dataKey="survivalPct" stroke="hsl(var(--primary))" strokeWidth={2}
                  dot={{ r: 3, fill: 'hsl(var(--primary))' }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Chart 3 — Cumulative Calving Progress by Year */}
      {cumulativeData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Cumulative Calving Progress by Year</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Steeper early curves = tighter calving window. Target: 80%+ of calves within the first 21 days.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={cumulativeData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  label={{ value: 'Days from Season Start', position: 'bottom', offset: 0, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  label={{ value: 'Cumulative %', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [`${value}%`, name.replace('y', '')]} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => v.replace('y', '')} />
                <ReferenceLine y={80} stroke="hsl(var(--foreground))" strokeDasharray="5 5"
                  label={{ value: '80% Target', fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'right' }} />
                <ReferenceLine x={21} stroke="hsl(48, 96%, 53%)" strokeDasharray="5 5"
                  label={{ value: '21 Days', fill: 'hsl(48, 96%, 53%)', fontSize: 10, position: 'top' }} />
                {sortedActive.map(y => (
                  <Line key={y} type="monotone" dataKey={`y${y}`} name={`y${y}`}
                    stroke={yearColorMap.get(y)} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
