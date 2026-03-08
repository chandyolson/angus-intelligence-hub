import { useMemo } from 'react';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

interface Props {
  records: BreedingCalvingRecord[];
  sireName: string;
}

interface YearRow {
  year: number;
  first: number;
  second: number;
  conceived: number;
  total: number;
  rate: number;
}

export default function ServicesOverTime({ records, sireName }: Props) {
  const data = useMemo(() => {
    const yearMap = new Map<number, { first: number; second: number; conceived1: number; conceived2: number }>();

    records.forEach(r => {
      if (r.breeding_year == null) return;
      const entry = yearMap.get(r.breeding_year) || { first: 0, second: 0, conceived1: 0, conceived2: 0 };

      if (r.ai_sire_1 === sireName && r.ai_date_1 != null) {
        entry.first++;
        if (r.preg_stage?.toLowerCase() === 'ai') entry.conceived1++;
      }
      if (r.ai_sire_2 === sireName && r.ai_date_2 != null) {
        entry.second++;
        if (r.preg_stage?.toLowerCase() === 'second ai') entry.conceived2++;
      }

      yearMap.set(r.breeding_year, entry);
    });

    const rows: YearRow[] = [];
    yearMap.forEach((d, year) => {
      const total = d.first + d.second;
      if (total === 0) return;
      const conceived = d.conceived1 + d.conceived2;
      rows.push({
        year,
        first: d.first,
        second: d.second,
        conceived,
        total,
        rate: Math.round((conceived / total) * 1000) / 10,
      });
    });

    return rows.sort((a, b) => a.year - b.year);
  }, [records, sireName]);

  if (data.length === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
          Services Over Time
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Stacked bars = service count (1st / 2nd) · Line = conception rate (right axis)
        </p>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? <EmptyState message="Not enough yearly data to chart." /> : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={data} margin={{ left: 10, right: 20, bottom: 5, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="year"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                label={{ value: 'Services', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
                label={{ value: 'Conception %', angle: 90, position: 'insideRight', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => {
                  if (name === 'rate') return [`${value}%`, 'Conception Rate'];
                  return [value, name === 'first' ? '1st Service' : '2nd Service'];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}
                formatter={(value: string) => value === 'first' ? '1st Service' : value === 'second' ? '2nd Service' : 'Conception Rate'}
              />
              <Bar yAxisId="left" dataKey="first" stackId="services" fill="hsl(217, 91%, 60%)" radius={[0, 0, 0, 0]} />
              <Bar yAxisId="left" dataKey="second" stackId="services" fill="hsl(280, 60%, 55%)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="rate" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 4, fill: 'hsl(142, 71%, 45%)' }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
