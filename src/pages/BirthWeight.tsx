import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Weight, Download } from 'lucide-react';
import { useBlairCombined, useAnimals } from '@/hooks/useCattleData';
import { exportToCSV } from '@/lib/calculations';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Cell, LabelList, LineChart, Line, ReferenceLine,
} from 'recharts';

export default function BirthWeight() {
  const { data: records, isLoading } = useBlairCombined();
  const { data: animals } = useAnimals();
  const navigate = useNavigate();

  const tagMap = useMemo(() => {
    const m = new Map<string, string>();
    animals?.forEach(a => { if (a.lifetime_id) m.set(a.lifetime_id, a.tag ?? ''); });
    return m;
  }, [animals]);

  // Section 1: BW by AI Sire
  const aiSireData = useMemo(() => {
    if (!records) return [];
    const map = new Map<string, number[]>();
    records.forEach(r => {
      if (!r.ai_sire_1 || r.calf_bw == null || r.calf_bw <= 0) return;
      if (r.ai_sire_1.toLowerCase().includes('cleanup')) return;
      const arr = map.get(r.ai_sire_1) || [];
      arr.push(r.calf_bw);
      map.set(r.ai_sire_1, arr);
    });
    return [...map.entries()]
      .filter(([, bws]) => bws.length >= 10)
      .map(([sire, bws]) => ({
        sire,
        avg: Math.round((bws.reduce((a, b) => a + b, 0) / bws.length) * 10) / 10,
        n: bws.length,
      }))
      .sort((a, b) => a.avg - b.avg);
  }, [records]);

  // Section 2: BW by Cow Sire
  const cowSireData = useMemo(() => {
    if (!records) return [];
    const map = new Map<string, number[]>();
    records.forEach(r => {
      if (!r.cow_sire || r.calf_bw == null || r.calf_bw <= 0) return;
      const arr = map.get(r.cow_sire) || [];
      arr.push(r.calf_bw);
      map.set(r.cow_sire, arr);
    });
    return [...map.entries()]
      .filter(([, bws]) => bws.length >= 10)
      .map(([sire, bws]) => ({
        sire,
        avg: Math.round((bws.reduce((a, b) => a + b, 0) / bws.length) * 10) / 10,
        n: bws.length,
      }))
      .sort((a, b) => a.avg - b.avg);
  }, [records]);

  // Section 3: Flag reports
  const { heavyCalves, lightCalves } = useMemo(() => {
    if (!records) return { heavyCalves: [], lightCalves: [] };
    const heavy: any[] = [];
    const light: any[] = [];
    records.forEach(r => {
      if (r.calf_bw == null) return;
      const row = {
        lifetime_id: r.lifetime_id ?? '',
        tag: tagMap.get(r.lifetime_id ?? '') ?? '',
        calf_sire: r.calf_sire ?? '',
        ai_sire_1: r.ai_sire_1 ?? '',
        calving_date: r.calving_date ?? '',
        bw: r.calf_bw,
      };
      if (r.calf_bw > 90) heavy.push(row);
      if (r.calf_bw > 0 && r.calf_bw < 60) light.push(row);
    });
    return {
      heavyCalves: heavy.sort((a, b) => b.bw - a.bw),
      lightCalves: light.sort((a, b) => a.bw - b.bw),
    };
  }, [records, tagMap]);

  // Section 4: BW by Year
  const yearData = useMemo(() => {
    if (!records) return [];
    const map = new Map<number, number[]>();
    records.forEach(r => {
      if (!r.breeding_year || r.calf_bw == null || r.calf_bw <= 0) return;
      const arr = map.get(r.breeding_year) || [];
      arr.push(r.calf_bw);
      map.set(r.breeding_year, arr);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, bws]) => ({
        year,
        avg: Math.round((bws.reduce((a, b) => a + b, 0) / bws.length) * 10) / 10,
        n: bws.length,
      }));
  }, [records]);

  const herdAvgBW = useMemo(() => {
    if (!records) return 0;
    const bws = records.filter(r => r.calf_bw != null && r.calf_bw > 0).map(r => r.calf_bw!);
    return bws.length > 0 ? Math.round((bws.reduce((a, b) => a + b, 0) / bws.length) * 10) / 10 : 0;
  }, [records]);

  if (isLoading) return <p className="text-muted-foreground p-8">Loading…</p>;

  const heaviestAI = aiSireData.length ? aiSireData[aiSireData.length - 1] : null;
  const lightestAI = aiSireData.length ? aiSireData[0] : null;
  const heaviestCow = cowSireData.length ? cowSireData[cowSireData.length - 1] : null;
  const lightestCow = cowSireData.length ? cowSireData[0] : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Birth Weight Analysis</h1>

      {/* Leader Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {heaviestAI && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Heaviest AI Sire</p>
              <p className="text-lg font-bold text-foreground truncate">{heaviestAI.sire}</p>
              <p className="text-sm text-red-400 font-semibold">{heaviestAI.avg} lbs <span className="text-muted-foreground font-normal">· n={heaviestAI.n}</span></p>
            </CardContent>
          </Card>
        )}
        {lightestAI && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lightest AI Sire</p>
              <p className="text-lg font-bold text-foreground truncate">{lightestAI.sire}</p>
              <p className="text-sm text-emerald-400 font-semibold">{lightestAI.avg} lbs <span className="text-muted-foreground font-normal">· n={lightestAI.n}</span></p>
            </CardContent>
          </Card>
        )}
        {heaviestCow && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Heaviest Cow Sire</p>
              <p className="text-lg font-bold text-foreground truncate">{heaviestCow.sire}</p>
              <p className="text-sm text-red-400 font-semibold">{heaviestCow.avg} lbs <span className="text-muted-foreground font-normal">· n={heaviestCow.n}</span></p>
            </CardContent>
          </Card>
        )}
        {lightestCow && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lightest Cow Sire</p>
              <p className="text-lg font-bold text-foreground truncate">{lightestCow.sire}</p>
              <p className="text-sm text-emerald-400 font-semibold">{lightestCow.avg} lbs <span className="text-muted-foreground font-normal">· n={lightestCow.n}</span></p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* BW by Year */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Weight className="h-5 w-5 text-primary" /> Birth Weight by Year
          </CardTitle>
          <p className="text-sm text-muted-foreground">Herd average calf birth weight trend over time.</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={yearData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} label={{ value: 'Avg BW (lbs)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }} />
              <RTooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                formatter={(v: any) => [`${v} lbs`, 'Avg BW']}
              />
              <ReferenceLine y={herdAvgBW} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: `Herd Avg: ${herdAvgBW}`, fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
              <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(var(--primary))' }}>
                <LabelList dataKey="n" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} formatter={(v: number) => `n=${v}`} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* BW by AI Sire */}
      <SireBarChart title="Birth Weight by AI Sire" data={aiSireData} herdAvg={herdAvgBW} />

      {/* BW by Cow Sire */}
      <SireBarChart title="Birth Weight by Cow Sire (Dam Genetics)" data={cowSireData} herdAvg={herdAvgBW} />
    </div>
  );
}

function SireBarChart({ title, data, herdAvg }: { title: string; data: { sire: string; avg: number; n: number }[]; herdAvg: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Weight className="h-5 w-5 text-primary" /> {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">Min 10 records. Sires &gt; 90 lbs flagged red. Dashed line = herd average.</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(350, data.length * 30)}>
          <BarChart layout="vertical" data={data} margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} label={{ value: 'Avg BW (lbs)', position: 'insideBottom', offset: -2, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis dataKey="sire" type="category" width={130} tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }} />
            <RTooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              formatter={(v: any) => [`${v} lbs`, 'Avg BW']}
            />
            <ReferenceLine x={herdAvg} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: `Avg: ${herdAvg}`, fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
            <Bar dataKey="avg" barSize={18} radius={[0, 4, 4, 0]}
              label={({ x, y, width, value, index }: any) => (
                <text x={(x ?? 0) + (width ?? 0) + 4} y={(y ?? 0) + 13} fill="hsl(var(--muted-foreground))" fontSize={10}>
                  {value} lbs (n={data[index]?.n})
                </text>
              )}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.avg > 90 ? '#ef4444' : 'hsl(var(--primary))'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function FlagTable({ rows, colorFn, filename, navigate }: {
  rows: { lifetime_id: string; tag: string; calf_sire: string; ai_sire_1: string; calving_date: string; bw: number }[];
  colorFn: (bw: number) => string;
  filename: string;
  navigate: (path: string) => void;
}) {
  const handleExport = () => exportToCSV(rows.map(r => ({
    tag: r.tag, lifetime_id: r.lifetime_id, calf_sire: r.calf_sire,
    ai_sire_1: r.ai_sire_1, calving_date: r.calving_date, birth_weight: r.bw,
  })), filename);

  return (
    <div className="space-y-2 mt-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">No records.</p>
      ) : (
        <div className="max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Lifetime ID</TableHead>
                <TableHead>Calf Sire</TableHead>
                <TableHead>AI Sire</TableHead>
                <TableHead>Calving Date</TableHead>
                <TableHead>Birth Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.lifetime_id}-${r.calving_date}-${i}`}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/cow/${r.lifetime_id}`)}
                >
                  <TableCell className="font-medium">{r.tag || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{r.lifetime_id}</TableCell>
                  <TableCell>{r.calf_sire || '—'}</TableCell>
                  <TableCell>{r.ai_sire_1 || '—'}</TableCell>
                  <TableCell>{r.calving_date || '—'}</TableCell>
                  <TableCell className={colorFn(r.bw)}>{r.bw} lbs</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
