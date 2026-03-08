import { useMemo } from 'react';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';

interface Props {
  records: BreedingCalvingRecord[];
  sireName: string;
}

const BW_BUCKETS = [
  { label: '50–60', min: 50, max: 60 },
  { label: '60–70', min: 60, max: 70 },
  { label: '70–80', min: 70, max: 80 },
  { label: '80–90', min: 80, max: 90 },
  { label: '90–100', min: 90, max: 100 },
  { label: '100+', min: 100, max: Infinity },
];

function bwBucketColor(min: number): string {
  if (min >= 70 && min < 90) return 'hsl(142, 71%, 45%)'; // target
  if (min === 60 || min === 90) return 'hsl(48, 96%, 53%)'; // marginal
  return 'hsl(0, 72%, 51%)'; // outside
}

export default function CalfOutcomes({ records, sireName }: Props) {
  const calfRecords = useMemo(
    () => records.filter(r => r.calf_sire === sireName),
    [records, sireName]
  );

  const stats = useMemo(() => {
    const total = calfRecords.length;
    const withStatus = calfRecords.filter(r => r.calf_status != null);
    const alive = withStatus.filter(r => r.calf_status!.toLowerCase() === 'alive').length;
    const survivalRate = withStatus.length > 0 ? Math.round((alive / withStatus.length) * 1000) / 10 : 0;

    const withSex = calfRecords.filter(r => r.calf_sex != null);
    const bulls = withSex.filter(r => {
      const s = r.calf_sex!.toLowerCase();
      return s === 'bull' || s === 'b' || s === 'm' || s === 'male';
    }).length;
    const bullPct = withSex.length > 0 ? Math.round((bulls / withSex.length) * 1000) / 10 : 0;
    const heiferPct = withSex.length > 0 ? Math.round(((withSex.length - bulls) / withSex.length) * 1000) / 10 : 0;

    const bws = calfRecords.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
    const avgBw = bws.length > 0 ? Math.round((bws.reduce((a, b) => a + b, 0) / bws.length) * 10) / 10 : 0;

    return { total, survivalRate, alive, withStatus: withStatus.length, bullPct, heiferPct, avgBw, bws };
  }, [calfRecords]);

  const bwHistogram = useMemo(() => {
    return BW_BUCKETS.map(b => {
      const count = stats.bws.filter(w => w >= b.min && w < b.max).length;
      return { ...b, count };
    }).filter(b => b.count > 0 || b.min >= 60); // always show relevant range
  }, [stats.bws]);

  if (calfRecords.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Calf Outcomes</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState message="No confirmed calves found for this sire." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Confirmed Calves</p>
            <p className="text-[24px] font-bold text-primary">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Calf Survival</p>
            <p className="text-[24px] font-bold" style={{ color: stats.survivalRate >= 95 ? 'hsl(142, 71%, 45%)' : stats.survivalRate >= 90 ? 'hsl(48, 96%, 53%)' : 'hsl(0, 72%, 51%)' }}>
              {stats.survivalRate}%
            </p>
            <p className="text-[10px] text-muted-foreground">{stats.alive}/{stats.withStatus}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sex Ratio</p>
            <p className="text-[16px] font-bold text-foreground">
              <span style={{ color: 'hsl(217, 91%, 60%)' }}>{stats.bullPct}%</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span style={{ color: 'hsl(330, 60%, 55%)' }}>{stats.heiferPct}%</span>
            </p>
            <p className="text-[10px] text-muted-foreground">Bull / Heifer</p>
          </CardContent>
        </Card>
      </div>

      {/* BW Histogram */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            Birth Weight Distribution
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Green = 70–90 lbs target · Vertical line = sire avg ({stats.avgBw} lbs)
          </p>
        </CardHeader>
        <CardContent>
          {stats.bws.length < 3 ? <EmptyState message="Not enough birth weight data." /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={bwHistogram} margin={{ left: 10, right: 20, bottom: 5, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} label={{ value: 'Calves', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [value, 'Calves']}
                />
                <ReferenceLine
                  x={BW_BUCKETS.findIndex(b => stats.avgBw >= b.min && stats.avgBw < b.max) >= 0
                    ? BW_BUCKETS.find(b => stats.avgBw >= b.min && stats.avgBw < b.max)!.label
                    : undefined}
                  stroke="hsl(var(--foreground))"
                  strokeDasharray="5 5"
                  label={{ value: `Avg: ${stats.avgBw}`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'top' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={50}>
                  {bwHistogram.map((b, i) => (
                    <Cell key={i} fill={bwBucketColor(b.min)} />
                  ))}
                  <LabelList dataKey="count" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
