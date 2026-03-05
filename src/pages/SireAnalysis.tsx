import { useMemo } from 'react';
import { useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { computeSireStats } from '@/lib/calculations';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';

const CHART_COLORS = { grid: '#1E2E4A', gold: '#CA972E' };

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-card-border rounded-md px-3 py-2 text-xs">
      <p className="text-primary font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || CHART_COLORS.gold }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

const badgeColor = (badge: string) => {
  switch (badge) {
    case 'ELITE': return 'bg-success/20 text-success border-success/30';
    case 'STRONG': return 'bg-[hsl(200,60%,50%)]/20 text-[hsl(200,60%,60%)] border-[hsl(200,60%,50%)]/30';
    case 'BELOW AVG': return 'bg-destructive/20 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

export default function SireAnalysis() {
  const { data: records, isLoading } = useBreedingCalvingRecords();

  const sireStats = useMemo(() => {
    if (!records) return [];
    return computeSireStats(records);
  }, [records]);

  const herdAvgGestation = useMemo(() => {
    if (sireStats.length === 0) return 0;
    const vals = sireStats.filter(s => s.avg_gestation_days > 0).map(s => s.avg_gestation_days);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
  }, [sireStats]);

  const topSire = sireStats[0];
  const mostUsed = [...sireStats].sort((a, b) => b.total_calves - a.total_calves)[0];
  const underperformingHighUse = mostUsed && mostUsed.ai_conception_rate < 88 ? mostUsed : null;

  const conceptionData = sireStats.map(s => ({ name: s.sire, value: s.ai_conception_rate }));
  const gestationData = sireStats.map(s => ({ name: s.sire, value: s.avg_gestation_days }));
  const bullPctData = sireStats.map(s => ({ name: s.sire, value: s.bull_calf_pct }));

  const barColor = (val: number, thresholds: [number, number]) => {
    if (val >= thresholds[1]) return '#4ade80';
    if (val >= thresholds[0]) return CHART_COLORS.gold;
    return '#f87171';
  };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Sire Analysis</h1>

      {/* Callout cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topSire && (
          <Card className="bg-card border-success/40">
            <CardContent className="p-4">
              <p className="text-xs text-success font-medium mb-1">🏆 Top Performing Sire</p>
              <p className="text-lg font-bold text-foreground">{topSire.sire}</p>
              <p className="text-sm text-muted-foreground">{topSire.ai_conception_rate}% conception · {topSire.total_calves} calves · {topSire.calf_survival_rate}% survival</p>
            </CardContent>
          </Card>
        )}
        {underperformingHighUse && (
          <Card className="bg-card border-primary/40">
            <CardContent className="p-4">
              <p className="text-xs text-primary font-medium mb-1">⚠ High-Use Sire Below 88% Conception</p>
              <p className="text-lg font-bold text-foreground">{underperformingHighUse.sire}</p>
              <p className="text-sm text-muted-foreground">{underperformingHighUse.ai_conception_rate}% conception · {underperformingHighUse.total_calves} calves</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main table */}
      <Card className="bg-card border-card-border">
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar border-card-border hover:bg-sidebar">
                  <TableHead>Sire</TableHead><TableHead>Calves</TableHead><TableHead>AI Conc %</TableHead>
                  <TableHead>Avg Gest</TableHead><TableHead>Avg BW</TableHead><TableHead>Survival %</TableHead>
                  <TableHead>Bull %</TableHead><TableHead>Badge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sireStats.map(s => (
                  <TableRow key={s.sire} className="border-card-border">
                    <TableCell className="font-medium text-foreground">{s.sire}</TableCell>
                    <TableCell>{s.total_calves}</TableCell>
                    <TableCell>{s.ai_conception_rate}%</TableCell>
                    <TableCell>{s.avg_gestation_days} d</TableCell>
                    <TableCell>{s.avg_calf_bw} lbs</TableCell>
                    <TableCell>{s.calf_survival_rate}%</TableCell>
                    <TableCell>{s.bull_calf_pct}%</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeColor(s.performance_badge)}`}>
                        {s.performance_badge}
                      </span>
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
        {[
          { title: 'AI Conception Rate by Sire', data: conceptionData, refLine: null, thresholds: [85, 92] as [number, number] },
          { title: 'Average Gestation Days by Sire', data: gestationData, refLine: herdAvgGestation, thresholds: [278, 285] as [number, number] },
          { title: 'Bull Calf % by Sire', data: bullPctData, refLine: 50, thresholds: [45, 55] as [number, number] },
        ].map(chart => (
          <Card key={chart.title} className="bg-card border-card-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{chart.title}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(sireStats.length * 35, 200)}>
                <BarChart layout="vertical" data={chart.data} margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis type="number" tick={{ fill: '#6B7FA3', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#6B7FA3', fontSize: 11 }} width={95} />
                  <Tooltip content={<CustomTooltip />} />
                  {chart.refLine != null && (
                    <ReferenceLine x={chart.refLine} stroke="#f87171" strokeDasharray="5 5"
                      label={{ value: `Avg: ${chart.refLine}`, fill: '#f87171', fontSize: 10 }} />
                  )}
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chart.data.map((d, i) => (
                      <Cell key={i} fill={barColor(d.value, chart.thresholds)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
