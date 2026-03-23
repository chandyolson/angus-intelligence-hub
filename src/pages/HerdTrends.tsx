import { useMemo } from 'react';
import { useAnimals, useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { anonymizeSire } from '@/utils/anonymize';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, Line, ComposedChart, Legend, LineChart } from 'recharts';


export default function HerdTrends() {
  const { data: animals, isLoading: la, error: re } = useAnimals();
  const { data: records, isLoading: lr, error: rr } = useBreedingCalvingRecords();

  // ── Cow Sire (Dam Line) Distribution ──
  const damSireData = useMemo(() => {
    if (!animals) return [];
    const currentYear = new Date().getFullYear();
    const blairActive = animals.filter(a => a.operation === 'Blair' && a.status?.toLowerCase() === 'active');
    const countMap = new Map<string, { count: number; totalAge: number; ageCount: number }>();
    let otherCount = 0;
    let otherTotalAge = 0;
    let otherAgeCount = 0;

    blairActive.forEach(a => {
      const ds = a.sire?.trim();
      if (!ds) return;
      const entry = countMap.get(ds) || { count: 0, totalAge: 0, ageCount: 0 };
      entry.count++;
      if (a.year_born) { entry.totalAge += currentYear - a.year_born; entry.ageCount++; }
      countMap.set(ds, entry);
    });

    const rows: { name: string; count: number; avgAge: number }[] = [];
    countMap.forEach((entry, name) => {
      if (entry.count >= 5) {
        rows.push({ name, count: entry.count, avgAge: entry.ageCount > 0 ? Math.round((entry.totalAge / entry.ageCount) * 10) / 10 : 0 });
      } else {
        otherCount += entry.count;
        otherTotalAge += entry.totalAge;
        otherAgeCount += entry.ageCount;
      }
    });

    rows.sort((a, b) => b.count - a.count);
    if (otherCount > 0) rows.push({ name: 'Other', count: otherCount, avgAge: otherAgeCount > 0 ? Math.round((otherTotalAge / otherAgeCount) * 10) / 10 : 0 });
    return rows;
  }, [animals]);

  // ── Cow Age Distribution ──
  const { ageBuckets, avgAge, agedPct } = useMemo(() => {
    if (!animals) return { ageBuckets: [], avgAge: 0, agedPct: 0 };
    const currentYear = new Date().getFullYear();
    const blairActive = animals.filter(a => a.operation === 'Blair' && a.status?.toLowerCase() === 'active' && a.year_born);

    const ages = blairActive.map(a => currentYear - a.year_born!);
    if (ages.length === 0) return { ageBuckets: [], avgAge: 0, agedPct: 0 };

    const avg = Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10;

    const bucketDefs = [
      { label: '2 (1st Calf)', min: 0, max: 2, color: 'hsl(48, 96%, 53%)' },
      { label: '3–4 (Young)', min: 3, max: 4, color: 'hsl(142, 71%, 45%)' },
      { label: '5–7 (Prime)', min: 5, max: 7, color: 'hsl(142, 71%, 45%)' },
      { label: '8–10 (Mature)', min: 8, max: 10, color: 'hsl(48, 96%, 53%)' },
      { label: '11+ (Aged)', min: 11, max: 999, color: 'hsl(0, 72%, 51%)' },
    ];

    const data = bucketDefs.map(b => ({
      name: b.label,
      count: ages.filter(a => a >= b.min && a <= b.max).length,
      color: b.color,
    }));

    const aged = data.find(d => d.name.startsWith('11+'))?.count ?? 0;
    const pct = Math.round((aged / ages.length) * 1000) / 10;

    return { ageBuckets: data, avgAge: avg, agedPct: pct };
  }, [animals]);

  // ── Birth Weight & Gestation by Year ──
  const bwGestByYear = useMemo(() => {
    if (!records) return [];
    const yearMap = new Map<number, { bws: number[]; gests: number[] }>();
    records.forEach(r => {
      if (!r.breeding_year) return;
      const entry = yearMap.get(r.breeding_year) || { bws: [], gests: [] };
      if (r.calf_bw != null && r.calf_bw > 0) entry.bws.push(r.calf_bw);
      if (r.gestation_days != null && r.gestation_days >= 250 && r.gestation_days <= 310) entry.gests.push(r.gestation_days);
      yearMap.set(r.breeding_year, entry);
    });
    const rows: { year: number; avgBW: number | null; avgGest: number | null }[] = [];
    yearMap.forEach((d, year) => {
      rows.push({
        year,
        avgBW: d.bws.length >= 5 ? Math.round((d.bws.reduce((a, b) => a + b, 0) / d.bws.length) * 10) / 10 : null,
        avgGest: d.gests.length >= 5 ? Math.round((d.gests.reduce((a, b) => a + b, 0) / d.gests.length) * 10) / 10 : null,
      });
    });
    return rows.sort((a, b) => a.year - b.year);
  }, [records]);

  const CHART_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#eab308', '#ec4899', '#14b8a6', '#f43f5e'];

  if (la || lr) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-48" />
      <ShimmerSkeleton className="h-96" />
    </div>
  );
  if (re || rr) return <ErrorBox />;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Herd Trends</h1>

      {/* ── Cow Age Distribution ── */}
      <h2 className="text-[15px] font-semibold text-foreground">Cow Age Distribution</h2>
      {ageBuckets.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
              Active Herd Age Breakdown
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Age = {new Date().getFullYear()} − year_born. Herd average: {avgAge} years.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ageBuckets} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [`${value} cows`, 'Count']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={48}>
                  {ageBuckets.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                  <LabelList dataKey="count" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {agedPct > 15 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mt-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Replacement Warning</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {agedPct}% of the active herd is 11+ years old. A herd skewed this heavily toward aged cows signals a replacement crisis — consider accelerating heifer retention.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Cow Sire (Dam Line) Distribution ── */}
      <h2 className="text-[15px] font-semibold text-foreground">Cow Sire Distribution</h2>
      {damSireData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
              Active Herd by Sire
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Genetic makeup of active cows by sire. Minimum 5 active cows per sire; smaller groups combined into "Other." Diamond markers show average productive life (years) per sire group.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(damSireData.length * 40, 200)}>
              <ComposedChart layout="vertical" data={damSireData} margin={{ left: 110, right: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={105} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [name === 'avgAge' ? `${value} yrs` : `${value} cows`, name === 'avgAge' ? 'Avg Productive Life' : 'Count']}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value: string) => value === 'avgAge' ? 'Avg Productive Life (yrs)' : 'Cow Count'} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                  {damSireData.map((d, i) => (
                    <Cell key={i} fill={d.name === 'Other' ? 'hsl(var(--muted-foreground))' : CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                </Bar>
                <Line dataKey="avgAge" stroke="hsl(var(--foreground))" strokeWidth={0} dot={{ r: 4, fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--foreground))' }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Birth Weight & Gestation by Year ── */}
      {bwGestByYear.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold text-foreground">Birth Weight & Gestation by Year</h2>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
                Avg Birth Weight & Gestation Length by Breeding Year
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">
                Left axis = avg birth weight (lbs) · Right axis = avg gestation length (days). Min 5 records per year.
              </p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={bwGestByYear} margin={{ top: 10, right: 50, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis yAxisId="bw" tick={{ fill: 'hsl(142, 71%, 45%)', fontSize: 11 }}
                    label={{ value: 'Avg BW (lbs)', angle: -90, position: 'insideLeft', fill: 'hsl(142, 71%, 45%)', fontSize: 11 }} />
                  <YAxis yAxisId="gest" orientation="right" tick={{ fill: 'hsl(var(--primary))', fontSize: 11 }}
                    label={{ value: 'Avg Gestation (days)', angle: 90, position: 'insideRight', fill: 'hsl(var(--primary))', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number | null, name: string) => {
                      if (value == null) return ['—', name];
                      return name === 'avgBW' ? [`${value} lbs`, 'Avg Birth Weight'] : [`${value} days`, 'Avg Gestation'];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => v === 'avgBW' ? 'Avg Birth Weight (lbs)' : 'Avg Gestation (days)'} />
                  <Line yAxisId="bw" type="monotone" dataKey="avgBW" stroke="hsl(142, 71%, 45%)" strokeWidth={2}
                    dot={{ r: 4, fill: 'hsl(142, 71%, 45%)' }} connectNulls />
                  <Line yAxisId="gest" type="monotone" dataKey="avgGest" stroke="hsl(var(--primary))" strokeWidth={2}
                    dot={{ r: 4, fill: 'hsl(var(--primary))' }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

    </div>
  );
}
