import { useMemo } from 'react';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Legend,
} from 'recharts';

interface Props {
  records: BreedingCalvingRecord[];
  sireName: string;
  herdAvg1stService: number;
}

interface YearRow {
  year: number;
  firstRate: number | null;
  secondRate: number | null;
  overallRate: number | null;
  firstDrop: boolean;
}

export default function ConceptionByYear({ records, sireName, herdAvg1stService }: Props) {
  const data = useMemo(() => {
    const yearMap = new Map<number, { s1: number; c1: number; s2: number; c2: number }>();

    records.forEach(r => {
      if (r.breeding_year == null) return;
      const entry = yearMap.get(r.breeding_year) || { s1: 0, c1: 0, s2: 0, c2: 0 };

      if (r.ai_sire_1 === sireName && r.ai_date_1 != null) {
        entry.s1++;
        if (r.preg_stage?.toLowerCase() === 'ai') entry.c1++;
      }
      if (r.ai_sire_2 === sireName && r.ai_date_2 != null) {
        entry.s2++;
        if (r.preg_stage?.toLowerCase() === 'second ai') entry.c2++;
      }

      yearMap.set(r.breeding_year, entry);
    });

    const rows: YearRow[] = [];
    const years = [...yearMap.keys()].sort((a, b) => a - b);

    years.forEach(year => {
      const d = yearMap.get(year)!;
      const total = d.s1 + d.s2;
      if (total === 0) return;

      rows.push({
        year,
        firstRate: d.s1 >= 3 ? Math.round((d.c1 / d.s1) * 1000) / 10 : null,
        secondRate: d.s2 >= 3 ? Math.round((d.c2 / d.s2) * 1000) / 10 : null,
        overallRate: Math.round(((d.c1 + d.c2) / total) * 1000) / 10,
        firstDrop: false,
      });
    });

    // Mark YoY drops > 5pp on first service rate
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].firstRate;
      const curr = rows[i].firstRate;
      if (prev != null && curr != null && prev - curr > 5) {
        rows[i].firstDrop = true;
      }
    }

    return rows;
  }, [records, sireName]);

  if (data.length < 2) return null;

  const CustomDot = (props: any) => {
    const { cx, cy, payload, dataKey } = props;
    if (dataKey === 'firstRate' && payload.firstDrop) {
      return <circle cx={cx} cy={cy} r={6} fill="hsl(0, 72%, 51%)" stroke="hsl(var(--card))" strokeWidth={2} />;
    }
    return <circle cx={cx} cy={cy} r={3} fill={props.stroke} />;
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
          Conception Rate by Year
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Red dots = year-over-year drop &gt;5 pp · Dashed line = herd average 1st service rate ({herdAvg1stService}%)
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ left: 10, right: 20, bottom: 5, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              formatter={(value: number | null, name: string) => [
                value != null ? `${value}%` : '—',
                name === 'firstRate' ? '1st Service' : name === 'secondRate' ? '2nd Service' : 'Overall',
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v: string) => v === 'firstRate' ? '1st Service' : v === 'secondRate' ? '2nd Service' : 'Overall'}
            />
            <ReferenceLine
              y={herdAvg1stService}
              stroke="hsl(var(--foreground))"
              strokeDasharray="5 5"
              label={{ value: `Herd Avg: ${herdAvg1stService}%`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'right' }}
            />
            <Line
              type="monotone"
              dataKey="firstRate"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              dot={<CustomDot />}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="secondRate"
              stroke="hsl(280, 60%, 55%)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="overallRate"
              stroke="hsl(142, 71%, 45%)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
