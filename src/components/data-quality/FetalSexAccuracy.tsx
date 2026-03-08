import { useMemo } from 'react';
import { useBreedingCalvingRecords, useAnimals } from '@/hooks/useCattleData';
import { exportToCSV } from '@/lib/calculations';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, Line, ComposedChart } from 'recharts';

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

export function FetalSexAccuracy() {
  const { data: records } = useBreedingCalvingRecords();
  const { data: animals } = useAnimals();

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

  return (
    <>
      <h2 className="text-[15px] font-semibold text-foreground">Fetal Sex Accuracy</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-card border-border flex flex-col items-center justify-center">
          <CardContent className="pt-6 text-center">
            <div className={`text-5xl font-bold ${kpiColor}`}>{overallRate}%</div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-2">Overall Mismatch Rate</p>
            <p className="text-xs text-muted-foreground mt-1">
              {mismatches.length} mismatches / {comparable.length} comparable records
            </p>
          </CardContent>
        </Card>

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
    </>
  );
}
