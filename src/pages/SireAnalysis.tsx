import { useMemo, useState } from 'react';
import { useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { computeSireStats } from '@/lib/calculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { ShimmerSkeleton, ShimmerCard, ShimmerTableRows } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { EmptyState } from '@/components/ui/empty-state';

type SortKey = 'ai_conception_rate' | 'total_calves' | 'avg_calf_bw' | 'avg_gestation_days';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'ai_conception_rate', label: 'Sort by Conception Rate' },
  { key: 'total_calves', label: 'Sort by Usage' },
  { key: 'avg_calf_bw', label: 'Sort by Birth Weight' },
  { key: 'avg_gestation_days', label: 'Sort by Gestation' },
];

const badgeStyle = (badge: string) => {
  switch (badge) {
    case 'ELITE': return 'bg-success/20 text-success border-success/30';
    case 'STRONG': return 'bg-[hsl(200,60%,50%)]/20 text-[hsl(200,60%,60%)] border-[hsl(200,60%,50%)]/30';
    case 'BELOW AVG': return 'bg-destructive/20 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const conceptionColor = (rate: number) => rate >= 95 ? 'hsl(142, 69%, 58%)' : rate >= 80 ? 'hsl(40, 63%, 49%)' : 'hsl(0, 86%, 71%)';
const conceptionBarColor = (rate: number) => rate >= 95 ? 'hsl(142, 69%, 58%)' : rate >= 88 ? 'hsl(100, 50%, 50%)' : rate >= 80 ? 'hsl(40, 63%, 49%)' : 'hsl(0, 86%, 71%)';

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
  const [sortKey, setSortKey] = useState<SortKey>('ai_conception_rate');
  const [tableSortKey, setTableSortKey] = useState<string>('ai_conception_rate');
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

  const conceptionData = useMemo(() => [...sireStats].sort((a, b) => b.ai_conception_rate - a.ai_conception_rate).map(s => ({ name: s.sire, value: s.ai_conception_rate })), [sireStats]);
  const gestationData = useMemo(() => [...sireStats].filter(s => s.avg_gestation_days > 0).sort((a, b) => a.avg_gestation_days - b.avg_gestation_days).map(s => ({ name: s.sire, value: s.avg_gestation_days })), [sireStats]);

  const bullPctData = useMemo(() => {
    if (!records) return [];
    const bySire = new Map<string, { bull: number; total: number }>();
    records.forEach(r => {
      const sire = r.calf_sire || r.ai_sire_1;
      if (!sire || !r.calf_sex || r.calf_sex.trim() === '') return;
      const entry = bySire.get(sire) || { bull: 0, total: 0 };
      entry.total++;
      if (['bull', 'male', 'b', 'm', 'steer'].some(s => r.calf_sex!.toLowerCase().includes(s))) entry.bull++;
      bySire.set(sire, entry);
    });
    return Array.from(bySire.entries()).filter(([_, v]) => v.total >= 30)
      .map(([name, v]) => ({ name, value: Math.round((v.bull / v.total) * 1000) / 10 })).sort((a, b) => b.value - a.value);
  }, [records]);

  const topSire = useMemo(() => {
    const eligible = sireStats.filter(s => s.total_calves >= 25);
    return eligible.length > 0 ? eligible.reduce((best, s) => s.ai_conception_rate > best.ai_conception_rate ? s : best, eligible[0]) : null;
  }, [sireStats]);

  const mostUsed = useMemo(() => sireStats.length > 0 ? [...sireStats].sort((a, b) => b.total_calves - a.total_calves)[0] : null, [sireStats]);

  const handleTableSort = (key: string) => {
    if (tableSortKey === key) setTableSortAsc(!tableSortAsc);
    else { setTableSortKey(key); setTableSortAsc(false); }
  };
  const sortArrow = (key: string) => tableSortKey === key ? (tableSortAsc ? ' ↑' : ' ↓') : '';

  if (isLoading) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-48" />
      <div className="flex gap-2">{Array.from({ length: 4 }).map((_, i) => <ShimmerSkeleton key={i} className="h-9 w-40" />)}</div>
      <ShimmerSkeleton className="h-96" />
    </div>
  );

  if (error) return <ErrorBox />;
  if (sireStats.length === 0) return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-semibold text-foreground">Sire Analysis</h1>
      <EmptyState message="No sires with 20+ calves on record." />
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Sire Analysis</h1>

      <div className="flex flex-wrap gap-2">
        {SORT_OPTIONS.map(opt => (
          <Button key={opt.key} size="sm" variant={sortKey === opt.key ? 'default' : 'outline'}
            className={sortKey === opt.key ? 'bg-primary text-primary-foreground' : ''}
            onClick={() => { setSortKey(opt.key); setTableSortKey(opt.key); setTableSortAsc(false); }}>
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Main table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                  {[
                    { key: 'sire', label: 'Sire' }, { key: 'total_calves', label: 'Total Calves' },
                    { key: 'ai_conception_rate', label: 'Overall AI %' }, { key: 'first_service_rate', label: '1st Service %' },
                    { key: 'second_service_rate', label: '2nd Service %' }, { key: 'avg_gestation_days', label: 'Avg Gestation (days)' },
                    { key: 'avg_calf_bw', label: 'Avg BW (lbs)' }, { key: 'calf_survival_rate', label: 'Survival %' },
                    { key: 'bull_calf_pct', label: 'Bull Calf %' }, { key: 'performance_badge', label: 'Performance' },
                  ].map(col => (
                    <TableHead key={col.key} className="cursor-pointer select-none hover:text-foreground text-[12px] transition-colors" onClick={() => handleTableSort(col.key)}>
                      {col.label}{sortArrow(col.key)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s, i) => (
                  <TableRow key={s.sire} className="border-border text-[13px]" style={{ backgroundColor: i % 2 === 1 ? '#0E1528' : undefined }}>
                    <TableCell className="font-medium text-foreground">{s.sire}</TableCell>
                    <TableCell>{s.total_calves}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="relative w-16 h-3 rounded-full bg-muted overflow-hidden">
                          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(s.ai_conception_rate, 100)}%`, backgroundColor: conceptionColor(s.ai_conception_rate) }} />
                        </div>
                        <span style={{ color: conceptionColor(s.ai_conception_rate) }}>{s.ai_conception_rate}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{s.first_service_rate}%</TableCell>
                    <TableCell>{s.second_service_rate}%</TableCell>
                    <TableCell>{s.avg_gestation_days > 0 ? `${s.avg_gestation_days} d` : '—'}</TableCell>
                    <TableCell>{s.avg_calf_bw > 0 ? `${s.avg_calf_bw} lbs` : '—'}</TableCell>
                    <TableCell>{s.calf_survival_rate}%</TableCell>
                    <TableCell>{s.bull_calf_pct}%</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeStyle(s.performance_badge)}`}>{s.performance_badge}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="space-y-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">AI Conception Rate by Sire</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(conceptionData.length * 35, 200)}>
              <BarChart layout="vertical" data={conceptionData} margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                <XAxis type="number" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} width={95} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>{conceptionData.map((d, i) => <Cell key={i} fill={conceptionBarColor(d.value)} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Avg Gestation Days by Sire</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(gestationData.length * 35, 200)}>
              <BarChart layout="vertical" data={gestationData} margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                <XAxis type="number" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} width={95} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine x={herdAvgGestation} stroke="hsl(0, 86%, 71%)" strokeDasharray="5 5" label={{ value: `Avg: ${herdAvgGestation}`, fill: 'hsl(0, 86%, 71%)', fontSize: 10 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>{gestationData.map((d, i) => <Cell key={i} fill={d.value > herdAvgGestation + 2 ? 'hsl(0, 86%, 71%)' : 'hsl(40, 63%, 49%)'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Bull Calf % by Sire (30+ calves)</CardTitle></CardHeader>
          <CardContent>
            {bullPctData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(bullPctData.length * 35, 200)}>
                <BarChart layout="vertical" data={bullPctData} margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                  <XAxis type="number" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} width={95} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={50} stroke="hsl(0, 86%, 71%)" strokeDasharray="5 5" label={{ value: 'Expected 50/50', fill: 'hsl(0, 86%, 71%)', fontSize: 10 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>{bullPctData.map((d, i) => <Cell key={i} fill={d.value > 60 ? '#60a5fa' : 'hsl(142, 69%, 58%)'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState message="Not enough data for bull calf % chart." />}
          </CardContent>
        </Card>
      </div>

      {/* Callout cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topSire && (
          <Card className="bg-card border-success/40">
            <CardContent className="p-5">
              <p className="text-[10px] text-success font-medium uppercase tracking-wider mb-1">🏆 Top Performer</p>
              <p className="text-xl font-bold text-foreground">{topSire.sire}</p>
              <p className="text-[28px] font-bold text-success mt-1">{topSire.ai_conception_rate}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">AI Conception Rate</p>
              <p className="text-sm text-muted-foreground mt-3">{topSire.total_calves} calves · {topSire.calf_survival_rate}% survival · {topSire.avg_calf_bw} lbs avg BW</p>
              {topSire.total_calves < 50 && <p className="text-primary text-xs mt-2 italic">Small sample — monitor with additional breedings before drawing firm conclusions.</p>}
            </CardContent>
          </Card>
        )}
        {mostUsed && (
          <Card className={`bg-card ${mostUsed.ai_conception_rate < 88 ? 'border-primary/40' : 'border-success/40'}`}>
            <CardContent className="p-5">
              {mostUsed.ai_conception_rate < 88 ? (<>
                <p className="text-[10px] text-primary font-medium uppercase tracking-wider mb-1">⚠ Most Used · Below Average</p>
                <p className="text-xl font-bold text-foreground">{mostUsed.sire}</p>
                <p className="text-[28px] font-bold text-destructive mt-1">{mostUsed.ai_conception_rate}%</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">AI Conception Rate</p>
                <p className="text-sm text-muted-foreground mt-3">{mostUsed.total_calves} calves recorded</p>
                <p className="text-primary text-xs mt-2 italic">Highest usage sire with below-average conception rate. This sire represents the single highest-impact sire change opportunity.</p>
              </>) : (<>
                <p className="text-[10px] text-success font-medium uppercase tracking-wider mb-1">✓ Most Used · Strong Performer</p>
                <p className="text-xl font-bold text-foreground">{mostUsed.sire}</p>
                <p className="text-[28px] font-bold text-success mt-1">{mostUsed.ai_conception_rate}%</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">AI Conception Rate</p>
                <p className="text-sm text-muted-foreground mt-3">{mostUsed.total_calves} calves · {mostUsed.calf_survival_rate}% survival</p>
              </>)}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
