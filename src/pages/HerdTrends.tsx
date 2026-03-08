import { useMemo } from 'react';
import { useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { useAnimals } from '@/hooks/useCattleData';
import { exportToCSV } from '@/lib/calculations';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, AlertTriangle } from 'lucide-react';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, Line, ComposedChart, Legend, ReferenceLine } from 'recharts';

function normalize(sex: string | null): string | null {
  if (!sex) return null;
  const s = sex.trim().toLowerCase();
  if (['bull', 'male', 'b', 'm', 'steer'].some(k => s.includes(k))) return 'bull';
  if (['heifer', 'female', 'h', 'f'].some(k => s.includes(k))) return 'heifer';
  if (s === 'unknown' || s === '') return null;
  return s;
}

interface MismatchRow {
  lifetime_id: string;
  tag: string | null;
  breeding_year: number | null;
  ultrasound_group: string | null;
  fetal_sex: string;
  calf_sex: string;
  dog: number | null;
}

export default function HerdTrends() {
  const { data: records, isLoading: lr, error: re } = useBreedingCalvingRecords();
  const { data: animals, isLoading: la } = useAnimals();

  const tagMap = useMemo(() => {
    const m = new Map<string, string | null>();
    animals?.forEach(a => { if (a.lifetime_id) m.set(a.lifetime_id, a.tag); });
    return m;
  }, [animals]);

  const { comparable, mismatches } = useMemo(() => {
    if (!records) return { comparable: [] as BreedingCalvingRecord[], mismatches: [] as MismatchRow[] };
    const comp: BreedingCalvingRecord[] = [];
    const mis: MismatchRow[] = [];

    records.forEach(r => {
      const nFetal = normalize(r.fetal_sex);
      const nCalf = normalize(r.calf_sex);
      if (!nFetal || !nCalf) return;
      comp.push(r);
      if (nFetal !== nCalf) {
        mis.push({
          lifetime_id: r.lifetime_id ?? '',
          tag: tagMap.get(r.lifetime_id ?? '') ?? null,
          breeding_year: r.breeding_year,
          ultrasound_group: (r as any).ultrasound_group ?? null,
          fetal_sex: r.fetal_sex!,
          calf_sex: r.calf_sex!,
          dog: r.dog,
        });
      }
    });
    return { comparable: comp, mismatches: mis };
  }, [records, tagMap]);

  const overallRate = comparable.length > 0 ? Math.round((mismatches.length / comparable.length) * 1000) / 10 : 0;

  const byYear = useMemo(() => {
    const map = new Map<number, { total: number; mis: number }>();
    comparable.forEach(r => {
      if (!r.breeding_year) return;
      const e = map.get(r.breeding_year) || { total: 0, mis: 0 };
      e.total++;
      const nF = normalize(r.fetal_sex);
      const nC = normalize(r.calf_sex);
      if (nF && nC && nF !== nC) e.mis++;
      map.set(r.breeding_year, e);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, d]) => ({ year: String(year), rate: Math.round((d.mis / d.total) * 1000) / 10, count: d.total }));
  }, [comparable]);

  const byGroup = useMemo(() => {
    const map = new Map<string, { total: number; mis: number }>();
    comparable.forEach(r => {
      const group = (r as any).ultrasound_group || 'Unknown';
      const e = map.get(group) || { total: 0, mis: 0 };
      e.total++;
      const nF = normalize(r.fetal_sex);
      const nC = normalize(r.calf_sex);
      if (nF && nC && nF !== nC) e.mis++;
      map.set(group, e);
    });
    return [...map.entries()]
      .map(([group, d]) => ({ group, rate: Math.round((d.mis / d.total) * 1000) / 10, count: d.total }))
      .sort((a, b) => b.rate - a.rate);
  }, [comparable]);

  const handleExport = () => {
    exportToCSV(
      mismatches.map(m => ({
        Lifetime_ID: m.lifetime_id,
        Tag: m.tag ?? '',
        Breeding_Year: m.breeding_year ?? '',
        Ultrasound_Group: m.ultrasound_group ?? '',
        Fetal_Sex: m.fetal_sex,
        Actual_Calf_Sex: m.calf_sex,
        Days_Of_Gestation: m.dog ?? '',
      })),
      `fetal_sex_mismatches_${new Date().toISOString().split('T')[0]}.csv`
    );
  };

  const kpiColor = overallRate < 1 ? 'text-success' : overallRate <= 2 ? 'text-yellow-400' : 'text-destructive';


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

  const CHART_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#eab308', '#ec4899', '#14b8a6', '#f43f5e'];

  if (lr || la) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-48" />
      <ShimmerSkeleton className="h-96" />
    </div>
  );
  if (re) return <ErrorBox />;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Herd Trends</h1>


      {/* ── Cow Sire (Dam Line) Distribution ── */}
      <h2 className="text-[15px] font-semibold text-foreground">Cow Sire Distribution</h2>
      {damSireData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
              Active Herd by Sire
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Genetic makeup of active Blair cows by sire. Minimum 5 active cows per sire; smaller groups combined into "Other." Diamond markers show average productive life (years) per sire group.
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

      {/* Section: Fetal Sex Accuracy */}
      <h2 className="text-[15px] font-semibold text-foreground">Fetal Sex Accuracy</h2>

      {/* KPI + Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Overall Mismatch KPI */}
        <Card className="bg-card border-border flex flex-col items-center justify-center">
          <CardContent className="pt-6 text-center">
            <div className={`text-5xl font-bold ${kpiColor}`}>{overallRate}%</div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-2">Overall Mismatch Rate</p>
            <p className="text-xs text-muted-foreground mt-1">
              {mismatches.length} mismatches / {comparable.length} comparable records
            </p>
          </CardContent>
        </Card>

        {/* By Year */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Mismatch Rate by Year</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={byYear}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [name === 'rate' ? `${value}%` : value, name === 'rate' ? 'Mismatch Rate' : 'Trend']} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={32}>
                  {byYear.map((d, i) => (
                    <Cell key={i} fill={d.rate < 1 ? 'hsl(142, 71%, 45%)' : d.rate <= 2 ? 'hsl(48, 96%, 53%)' : 'hsl(0, 72%, 51%)'} />
                  ))}
                  <LabelList dataKey="count" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} formatter={(v: number) => `n=${v}`} />
                </Bar>
                <Line type="monotone" dataKey="rate" stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By Group */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Mismatch Rate by Ultrasound Group</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byGroup}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="group" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [`${value}%`, 'Mismatch Rate']} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={32}>
                  {byGroup.map((d, i) => (
                    <Cell key={i} fill={d.rate > 5 ? 'hsl(0, 72%, 51%)' : 'hsl(142, 71%, 45%)'} />
                  ))}
                  <LabelList dataKey="count" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} formatter={(v: number) => `n=${v}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Mismatch Records Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            Individual Mismatched Records ({mismatches.length})
          </CardTitle>
          {mismatches.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExport} className="border-border">
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {mismatches.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No mismatched records found.</div>
          ) : (
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                    <TableHead className="text-[12px]">Lifetime ID</TableHead>
                    <TableHead className="text-[12px]">Tag</TableHead>
                    <TableHead className="text-[12px]">Breeding Year</TableHead>
                    <TableHead className="text-[12px]">Ultrasound Group</TableHead>
                    <TableHead className="text-[12px]">Fetal Sex</TableHead>
                    <TableHead className="text-[12px]">Actual Calf Sex</TableHead>
                    <TableHead className="text-[12px]">DOG at Scan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mismatches.map((m, i) => (
                    <TableRow key={`${m.lifetime_id}-${m.breeding_year}-${i}`} className="border-border text-[13px]"
                      style={{ backgroundColor: i % 2 === 1 ? '#0E1528' : undefined }}>
                      <TableCell className="text-muted-foreground text-xs">{m.lifetime_id}</TableCell>
                      <TableCell className="font-medium text-foreground">{m.tag || '—'}</TableCell>
                      <TableCell>{m.breeding_year ?? '—'}</TableCell>
                      <TableCell>{m.ultrasound_group || '—'}</TableCell>
                      <TableCell className="text-destructive font-medium">{m.fetal_sex}</TableCell>
                      <TableCell className="text-success font-medium">{m.calf_sex}</TableCell>
                      <TableCell>{m.dog ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
