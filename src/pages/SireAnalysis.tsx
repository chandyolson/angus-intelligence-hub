import { useMemo, useState } from 'react'; // v2
import { useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { computeSireStats } from '@/lib/calculations';
import { SireStats } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { EmptyState } from '@/components/ui/empty-state';

type SortKey = 'overall_ai_rate' | 'first_service_rate' | 'total_calves' | 'avg_calf_bw' | 'avg_gestation_days';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'overall_ai_rate', label: 'Overall AI Rate' },
  { key: 'first_service_rate', label: '1st Service Rate' },
  { key: 'total_calves', label: 'Total Calves' },
  { key: 'avg_calf_bw', label: 'Birth Weight' },
  { key: 'avg_gestation_days', label: 'Gestation' },
];

const badgeStyle = (badge: string) => {
  switch (badge) {
    case 'ELITE': return 'bg-success/20 text-success border-success/30';
    case 'STRONG': return 'bg-[hsl(200,60%,50%)]/20 text-[hsl(200,60%,60%)] border-[hsl(200,60%,50%)]/30';
    case 'BELOW AVG': return 'bg-destructive/20 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const rateColor = (rate: number) => rate >= 70 ? 'hsl(142, 69%, 58%)' : rate >= 55 ? 'hsl(40, 63%, 49%)' : 'hsl(0, 86%, 71%)';
const rateBarColor = (rate: number) => rate >= 70 ? 'hsl(142, 69%, 58%)' : rate >= 60 ? 'hsl(100, 50%, 50%)' : rate >= 50 ? 'hsl(40, 63%, 49%)' : 'hsl(0, 86%, 71%)';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs">
      <p className="text-primary font-medium">{label}</p>
      {payload.map((p: any, i: number) => <p key={i} style={{ color: p.color || 'hsl(40, 63%, 49%)' }}>{p.name}: {p.value}</p>)}
    </div>
  );
};

export default function SireAnalysis() {
  const { data: records, isLoading, error } = useBreedingCalvingRecords();
  const [sortKey, setSortKey] = useState<SortKey>('overall_ai_rate');
  const [tableSortKey, setTableSortKey] = useState<string>('overall_ai_rate');
  const [tableSortAsc, setTableSortAsc] = useState(false);

  const sireStats = useMemo(() => records ? computeSireStats(records) : [], [records]);

  const sorted = useMemo(() => {
    const s = [...sireStats];
    s.sort((a, b) => { const aV = (a as any)[tableSortKey] ?? 0; const bV = (b as any)[tableSortKey] ?? 0; return tableSortAsc ? aV - bV : bV - aV; });
    return s;
  }, [sireStats, tableSortKey, tableSortAsc]);

  const herdAvgGestation = useMemo(() => {
    const vals = sireStats.filter(s => s.avg_gestation_days > 0).map(s => s.avg_gestation_days);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
  }, [sireStats]);

  // Chart data
  const conceptionData = useMemo(() =>
    [...sireStats].filter(s => s.units_used_1st > 0).sort((a, b) => b.first_service_rate - a.first_service_rate)
      .map(s => ({ name: s.sire, '1st Service': s.first_service_rate, '2nd Service': s.second_service_rate, 'Overall AI': s.overall_ai_rate })),
    [sireStats]
  );

  const gestationData = useMemo(() =>
    [...sireStats].filter(s => s.avg_gestation_days > 0).sort((a, b) => a.avg_gestation_days - b.avg_gestation_days)
      .map(s => ({ name: s.sire, value: s.avg_gestation_days })),
    [sireStats]
  );

  const gestVsBwData = useMemo(() =>
    sireStats.filter(s => s.avg_gestation_days > 0 && s.avg_calf_bw > 0)
      .map(s => ({ name: s.sire, gestation: s.avg_gestation_days, bw: s.avg_calf_bw, calves: s.total_calves })),
    [sireStats]
  );

  const bullPctData = useMemo(() => {
    return sireStats.filter(s => s.total_calves >= 30)
      .sort((a, b) => b.bull_calf_pct - a.bull_calf_pct)
      .map(s => ({ name: s.sire, value: s.bull_calf_pct }));
  }, [sireStats]);

  // Dynamic leader cards based on sortKey
  const leaderCards = useMemo(() => {
    if (sireStats.length === 0) return [];

    // Base pool: only sires with 10+ calves
    const eligible = sireStats.filter(s => s.total_calves >= 10);
    if (eligible.length === 0) return [];

    const cards: { emoji: string; label: string; sire: SireStats; value: string; sublabel: string; detail: string; borderClass: string }[] = [];

    const best = (key: keyof SireStats, min = 0, filter?: (s: SireStats) => boolean) => {
      const pool = filter ? eligible.filter(filter) : eligible;
      const valid = pool.filter(s => (s[key] as number) > min);
      return valid.length > 0 ? valid.reduce((a, b) => (a[key] as number) > (b[key] as number) ? a : b, valid[0]) : null;
    };
    const worst = (key: keyof SireStats, filter?: (s: SireStats) => boolean) => {
      const pool = filter ? eligible.filter(filter) : eligible;
      const valid = pool.filter(s => (s[key] as number) > 0);
      return valid.length > 0 ? valid.reduce((a, b) => (a[key] as number) < (b[key] as number) ? a : b, valid[0]) : null;
    };

    const detailLine = (s: SireStats) =>
      `${s.units_used_1st} units · ${s.total_calves} calves · ${s.calf_survival_rate}% survival${s.avg_calf_bw > 0 ? ` · ${s.avg_calf_bw} lbs` : ''}`;

    switch (sortKey) {
      case 'overall_ai_rate': {
        const top = best('overall_ai_rate', 0, s => s.units_used_1st >= 25);
        const low = worst('overall_ai_rate', s => s.units_used_1st >= 25);
        if (top) cards.push({ emoji: '🏆', label: 'Best Overall AI Rate (25+ units)', sire: top, value: `${top.overall_ai_rate}%`, sublabel: 'Overall AI Conception', detail: detailLine(top), borderClass: 'border-success/40' });
        if (low && low.sire !== top?.sire) cards.push({ emoji: '⚠', label: 'Lowest Overall AI Rate (25+ units)', sire: low, value: `${low.overall_ai_rate}%`, sublabel: 'Overall AI Conception', detail: detailLine(low), borderClass: 'border-destructive/40' });
        break;
      }
      case 'first_service_rate': {
        const top = best('first_service_rate', 0, s => s.units_used_1st >= 25);
        const low = worst('first_service_rate', s => s.units_used_1st >= 25);
        if (top) cards.push({ emoji: '🏆', label: 'Best 1st Service Rate (25+ units)', sire: top, value: `${top.first_service_rate}%`, sublabel: '1st Service AI Rate', detail: detailLine(top), borderClass: 'border-success/40' });
        if (low && low.sire !== top?.sire) cards.push({ emoji: '⚠', label: 'Lowest 1st Service Rate (25+ units)', sire: low, value: `${low.first_service_rate}%`, sublabel: '1st Service AI Rate', detail: detailLine(low), borderClass: 'border-destructive/40' });
        break;
      }
      case 'total_calves': {
        const top = best('total_calves');
        const topSurvivor = best('calf_survival_rate', 0, s => s.total_calves >= 20);
        if (top) cards.push({ emoji: '👑', label: 'Most Calves Born', sire: top, value: `${top.total_calves}`, sublabel: 'Total Calves', detail: `${top.calf_survival_rate}% survival · ${top.avg_calf_bw > 0 ? `${top.avg_calf_bw} lbs avg BW` : ''}`, borderClass: 'border-primary/40' });
        if (topSurvivor && topSurvivor.sire !== top?.sire) cards.push({ emoji: '💪', label: 'Best Survival Rate (20+ calves)', sire: topSurvivor, value: `${topSurvivor.calf_survival_rate}%`, sublabel: 'Calf Survival', detail: `${topSurvivor.total_calves} calves born`, borderClass: 'border-success/40' });
        break;
      }
      case 'avg_calf_bw': {
        const lightest = worst('avg_calf_bw');
        const heaviest = best('avg_calf_bw');
        if (lightest) cards.push({ emoji: '🪶', label: 'Lightest Avg Birth Weight (10+ calves)', sire: lightest, value: `${lightest.avg_calf_bw} lbs`, sublabel: 'Avg Birth Weight', detail: `${lightest.total_calves} calves · ${lightest.calf_survival_rate}% survival`, borderClass: 'border-success/40' });
        if (heaviest && heaviest.sire !== lightest?.sire) cards.push({ emoji: '🐂', label: 'Heaviest Avg Birth Weight (10+ calves)', sire: heaviest, value: `${heaviest.avg_calf_bw} lbs`, sublabel: 'Avg Birth Weight', detail: `${heaviest.total_calves} calves · ${heaviest.calf_survival_rate}% survival`, borderClass: 'border-primary/40' });
        break;
      }
      case 'avg_gestation_days': {
        const shortest = worst('avg_gestation_days');
        const longest = best('avg_gestation_days');
        if (shortest) cards.push({ emoji: '⚡', label: 'Shortest Avg Gestation (10+ calves)', sire: shortest, value: `${shortest.avg_gestation_days} d`, sublabel: 'Avg Gestation Length', detail: `${shortest.total_calves} calves · ${shortest.avg_calf_bw > 0 ? `${shortest.avg_calf_bw} lbs avg BW` : ''}`, borderClass: 'border-success/40' });
        if (longest && longest.sire !== shortest?.sire) cards.push({ emoji: '🐢', label: 'Longest Avg Gestation (10+ calves)', sire: longest, value: `${longest.avg_gestation_days} d`, sublabel: 'Avg Gestation Length', detail: `${longest.total_calves} calves · ${longest.avg_calf_bw > 0 ? `${longest.avg_calf_bw} lbs avg BW` : ''}`, borderClass: 'border-primary/40' });
        break;
      }
    }
    return cards;
  }, [sireStats, sortKey]);

  const handleTableSort = (key: string) => {
    if (tableSortKey === key) setTableSortAsc(!tableSortAsc);
    else { setTableSortKey(key); setTableSortAsc(false); }
  };
  const sortArrow = (key: string) => tableSortKey === key ? (tableSortAsc ? ' ↑' : ' ↓') : '';

  if (isLoading) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-48" />
      <div className="flex gap-2">{Array.from({ length: 5 }).map((_, i) => <ShimmerSkeleton key={i} className="h-9 w-36" />)}</div>
      <ShimmerSkeleton className="h-96" />
    </div>
  );

  if (error) return <ErrorBox />;
  if (sireStats.length === 0) return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-semibold text-foreground">Sire Analysis</h1>
      <EmptyState message="No sires with sufficient records found." />
    </div>
  );

  const TABLE_COLS = [
    { key: 'sire', label: 'Sire' },
    { key: 'units_used_1st', label: 'Units (1st)' },
    { key: 'units_used_2nd', label: 'Units (2nd)' },
    { key: 'first_service_rate', label: '1st Svc %' },
    { key: 'second_service_rate', label: '2nd Svc %' },
    { key: 'overall_ai_rate', label: 'Overall AI %' },
    { key: 'total_calves', label: 'Calves Born' },
    { key: 'avg_gestation_days', label: 'Avg Gest (d)' },
    { key: 'avg_calf_bw', label: 'Avg BW (lbs)' },
    { key: 'calf_survival_rate', label: 'Survival %' },
    { key: 'bull_calf_pct', label: 'Bull %' },
    { key: 'performance_badge', label: 'Grade' },
    { key: 'composite_bar', label: 'Score' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Sire Analysis</h1>

      {/* Dynamic callout cards */}
      {leaderCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {leaderCards.map((card, i) => (
            <Card key={i} className={`bg-card ${card.borderClass}`}>
              <CardContent className="p-5">
                <p className="text-[10px] font-medium uppercase tracking-wider mb-1 text-muted-foreground">{card.emoji} {card.label}</p>
                <p className="text-xl font-bold text-foreground">{card.sire.sire}</p>
                <p className="text-[28px] font-bold mt-1" style={{ color: card.borderClass.includes('success') ? 'hsl(142, 69%, 58%)' : card.borderClass.includes('destructive') ? 'hsl(0, 86%, 71%)' : 'hsl(var(--primary))' }}>{card.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{card.sublabel}</p>
                <p className="text-sm text-muted-foreground mt-3">{card.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {SORT_OPTIONS.map(opt => (
          <Button key={opt.key} size="sm" variant={sortKey === opt.key ? 'default' : 'outline'}
            className={sortKey === opt.key ? 'bg-primary text-primary-foreground' : ''}
            onClick={() => { setSortKey(opt.key); setTableSortKey(opt.key); setTableSortAsc(false); }}>
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Sire Summary Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Sire Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                  {TABLE_COLS.map(col => (
                    <TableHead key={col.key} className="cursor-pointer select-none hover:text-foreground text-[12px] transition-colors whitespace-nowrap" onClick={() => handleTableSort(col.key)}>
                      {col.label}{sortArrow(col.key)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s, i) => (
                  <TableRow key={s.sire} className="border-border text-[13px]" style={{ backgroundColor: i % 2 === 1 ? '#0E1528' : undefined }}>
                    <TableCell className="font-medium text-foreground whitespace-nowrap">{s.sire}</TableCell>
                    <TableCell>{s.units_used_1st}</TableCell>
                    <TableCell>{s.units_used_2nd}</TableCell>
                    <TableCell>
                      <span style={{ color: rateColor(s.first_service_rate) }}>{s.first_service_rate}%</span>
                    </TableCell>
                    <TableCell>
                      <span style={{ color: s.units_used_2nd > 0 ? rateColor(s.second_service_rate) : undefined }}>
                        {s.units_used_2nd > 0 ? `${s.second_service_rate}%` : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="relative w-14 h-3 rounded-full bg-muted overflow-hidden">
                          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(s.overall_ai_rate, 100)}%`, backgroundColor: rateColor(s.overall_ai_rate) }} />
                        </div>
                        <span style={{ color: rateColor(s.overall_ai_rate) }}>{s.overall_ai_rate}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{s.total_calves}</TableCell>
                    <TableCell>{s.avg_gestation_days > 0 ? `${s.avg_gestation_days}` : '—'}</TableCell>
                    <TableCell>{s.avg_calf_bw > 0 ? `${s.avg_calf_bw}` : '—'}</TableCell>
                    <TableCell>{s.calf_survival_rate}%</TableCell>
                    <TableCell>{s.bull_calf_pct}%</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeStyle(s.performance_badge)}`}>{s.performance_badge}</span>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const conception = (s.first_service_rate / 100) * 33.3;
                        const survival = (s.calf_survival_rate / 100) * 33.3;
                        const gestation = s.avg_gestation_days > 0 ? Math.max(0, Math.min(33.3, ((285 - s.avg_gestation_days) / 15) * 33.3)) : 0;
                        const total = Math.round((conception + survival + gestation) * 10) / 10;
                        return (
                          <div className="flex items-center gap-2 group relative">
                            <div className="relative w-24 h-4 rounded bg-muted overflow-hidden flex">
                              <div style={{ width: `${(conception / 100) * 100}%`, backgroundColor: 'hsl(200, 60%, 45%)' }} />
                              <div style={{ width: `${(survival / 100) * 100}%`, backgroundColor: 'hsl(142, 55%, 42%)' }} />
                              <div style={{ width: `${(gestation / 100) * 100}%`, backgroundColor: 'hsl(40, 63%, 49%)' }} />
                            </div>
                            <span className="text-xs font-semibold text-foreground tabular-nums">{total}</span>
                            <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50">
                              <div className="bg-card border border-border rounded-md px-3 py-2 text-xs whitespace-nowrap shadow-lg">
                                <span style={{ color: 'hsl(200, 60%, 55%)' }}>Conception: {conception.toFixed(1)}</span>
                                <span className="text-muted-foreground"> | </span>
                                <span style={{ color: 'hsl(142, 55%, 52%)' }}>Survival: {survival.toFixed(1)}</span>
                                <span className="text-muted-foreground"> | </span>
                                <span style={{ color: 'hsl(40, 63%, 55%)' }}>Gestation: {gestation.toFixed(1)}</span>
                                <span className="text-muted-foreground"> | </span>
                                <span className="text-foreground font-semibold">Total: {total}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1st Service AI Rate */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">1st Service AI Rate by Sire</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(conceptionData.length * 32, 200)}>
              <BarChart layout="vertical" data={conceptionData} margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} width={95} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="1st Service" radius={[0, 4, 4, 0]}>
                  {conceptionData.map((d, i) => <Cell key={i} fill={rateBarColor(d['1st Service'])} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Avg Gestation by Sire — Radar Chart */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Avg Gestation Days by Sire</CardTitle></CardHeader>
          <CardContent>
            {gestationData.length > 0 ? (
              <ResponsiveContainer width="100%" height={380}>
                <RadarChart data={gestationData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="hsl(218, 42%, 25%)" />
                  <PolarAngleAxis dataKey="name" tick={{ fill: 'hsl(219, 23%, 63%)', fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[Math.min(...gestationData.map(d => d.value)) - 3, Math.max(...gestationData.map(d => d.value)) + 1]} tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 9 }} />
                  <Radar name="Gestation (d)" dataKey="value" stroke="hsl(40, 63%, 49%)" fill="hsl(40, 63%, 49%)" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    const diff = Math.round((d.value - herdAvgGestation) * 10) / 10;
                    return (
                      <div className="bg-card border border-border rounded-md px-3 py-2 text-xs">
                        <p className="text-primary font-medium">{d.name}</p>
                        <p className="text-muted-foreground">Avg Gestation: {d.value} days</p>
                        <p style={{ color: diff > 0 ? 'hsl(0, 86%, 71%)' : 'hsl(142, 69%, 58%)' }}>
                          {diff > 0 ? '+' : ''}{diff}d vs herd avg ({herdAvgGestation}d)
                        </p>
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(219, 23%, 53%)' }} />
                </RadarChart>
              </ResponsiveContainer>
            ) : <EmptyState message="No gestation data available." />}
          </CardContent>
        </Card>

        {/* Gestation vs Birth Weight Scatter */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Gestation vs Birth Weight by Sire</CardTitle></CardHeader>
          <CardContent>
            {gestVsBwData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ left: 10, right: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                  <XAxis dataKey="gestation" name="Gestation (d)" type="number" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} label={{ value: 'Avg Gestation (days)', position: 'bottom', fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                  <YAxis dataKey="bw" name="Birth Weight (lbs)" type="number" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} label={{ value: 'Avg BW (lbs)', angle: -90, position: 'insideLeft', fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                  <ZAxis dataKey="calves" range={[40, 400]} name="Calves" />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-md px-3 py-2 text-xs">
                        <p className="text-primary font-medium">{d.name}</p>
                        <p className="text-muted-foreground">Gestation: {d.gestation}d</p>
                        <p className="text-muted-foreground">Avg BW: {d.bw} lbs</p>
                        <p className="text-muted-foreground">Calves: {d.calves}</p>
                      </div>
                    );
                  }} />
                  <Scatter data={gestVsBwData} fill="hsl(40, 63%, 49%)" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : <EmptyState message="Insufficient data for scatter plot." />}
          </CardContent>
        </Card>

        {/* Bull Calf % */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Bull Calf % by Sire (30+ calves)</CardTitle></CardHeader>
          <CardContent>
            {bullPctData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(bullPctData.length * 32, 200)}>
                <BarChart layout="vertical" data={bullPctData} margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                  <XAxis type="number" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} width={95} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={50} stroke="hsl(0, 86%, 71%)" strokeDasharray="5 5" label={{ value: '50/50', fill: 'hsl(0, 86%, 71%)', fontSize: 10 }} />
                  <Bar dataKey="value" name="Bull %" radius={[0, 4, 4, 0]}>
                    {bullPctData.map((d, i) => <Cell key={i} fill={d.value > 60 ? '#60a5fa' : 'hsl(142, 69%, 58%)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState message="Not enough data for bull calf % chart." />}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
