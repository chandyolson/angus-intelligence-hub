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
  herdAvgGestation: number;
}

const GEST_BUCKETS = [
  { label: '260–265', min: 260, max: 265 },
  { label: '265–270', min: 265, max: 270 },
  { label: '270–275', min: 270, max: 275 },
  { label: '275–280', min: 275, max: 280 },
  { label: '280–285', min: 280, max: 285 },
  { label: '285–290', min: 285, max: 290 },
  { label: '290–295', min: 290, max: 295 },
];

function gestBucketColor(min: number): string {
  if (min >= 270 && min < 290) return 'hsl(142, 71%, 45%)';
  if (min === 265 || min === 290) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
}

export default function GestationDistribution({ records, sireName, herdAvgGestation }: Props) {
  const gestValues = useMemo(() => {
    const vals: number[] = [];
    records.forEach(r => {
      if (r.calf_sire !== sireName) return;
      let gd = r.gestation_days;
      if (gd == null || gd < 250 || gd > 310) {
        // Fallback: compute from dates
        if (r.calving_date && r.ai_date_1 && r.preg_stage?.toLowerCase() === 'ai') {
          const diff = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_1).getTime()) / 86400000);
          if (diff >= 250 && diff <= 310) gd = diff; else return;
        } else if (r.calving_date && r.ai_date_2 && r.preg_stage?.toLowerCase() === 'second ai') {
          const diff = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_2).getTime()) / 86400000);
          if (diff >= 250 && diff <= 310) gd = diff; else return;
        } else return;
      }
      vals.push(gd);
    });
    return vals;
  }, [records, sireName]);

  const sireAvg = useMemo(() => {
    if (gestValues.length === 0) return 0;
    return Math.round((gestValues.reduce((a, b) => a + b, 0) / gestValues.length) * 10) / 10;
  }, [gestValues]);

  const histogram = useMemo(() => {
    return GEST_BUCKETS.map(b => ({
      ...b,
      count: gestValues.filter(v => v >= b.min && v < b.max).length,
    }));
  }, [gestValues]);

  if (gestValues.length < 3) return null;

  // Find which bucket label corresponds to each average for ReferenceLine
  const findBucketLabel = (avg: number) => {
    const b = GEST_BUCKETS.find(b => avg >= b.min && avg < b.max);
    return b?.label;
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
          Gestation Distribution
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Green = 270–290 days target · Sire avg: {sireAvg} days · Herd avg: {herdAvgGestation} days · n={gestValues.length}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={histogram} margin={{ left: 10, right: 20, bottom: 5, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} label={{ value: 'Calves', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              formatter={(value: number) => [value, 'Calves']}
            />
            <ReferenceLine
              x={findBucketLabel(sireAvg)}
              stroke="hsl(var(--primary))"
              strokeDasharray="5 5"
              label={{ value: `Sire: ${sireAvg}d`, fill: 'hsl(var(--primary))', fontSize: 10, position: 'top' }}
            />
            <ReferenceLine
              x={findBucketLabel(herdAvgGestation)}
              stroke="hsl(var(--foreground))"
              strokeDasharray="3 3"
              label={{ value: `Herd: ${herdAvgGestation}d`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'top' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={50}>
              {histogram.map((b, i) => (
                <Cell key={i} fill={gestBucketColor(b.min)} />
              ))}
              <LabelList dataKey="count" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
