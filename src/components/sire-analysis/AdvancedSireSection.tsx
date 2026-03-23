import { useMemo } from 'react';
import { anonymizeSire } from '@/utils/anonymize';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface CowSireRow {
  name: string;
  rate: number;
  n: number;
}

interface HeatmapCell {
  aiSire: string;
  cowSire: string;
  rate: number;
  n: number;
}

function computeCowSireRates(records: BreedingCalvingRecord[], minN = 15): CowSireRow[] {
  const map = new Map<string, { total: number; conceived: number }>();
  records.forEach(r => {
    if (!r.cow_sire || !r.ai_date_1) return;
    const entry = map.get(r.cow_sire) || { total: 0, conceived: 0 };
    entry.total++;
    if (r.preg_stage?.toLowerCase() === 'ai') entry.conceived++;
    map.set(r.cow_sire, entry);
  });
  const rows: CowSireRow[] = [];
  map.forEach((d, name) => {
    if (d.total < minN) return;
    rows.push({ name, rate: Math.round((d.conceived / d.total) * 1000) / 10, n: d.total });
  });
  return rows.sort((a, b) => b.rate - a.rate);
}

function computeHeatmap(records: BreedingCalvingRecord[]): {
  aiSires: string[];
  cowSires: string[];
  cells: HeatmapCell[];
  herdAvg: number;
} {
  // Count usage for top 10
  const aiUsage = new Map<string, number>();
  const cowUsage = new Map<string, number>();
  records.forEach(r => {
    if (!r.ai_sire_1 || r.ai_sire_1.toLowerCase().includes('cleanup') || !r.ai_date_1) return;
    aiUsage.set(r.ai_sire_1, (aiUsage.get(r.ai_sire_1) || 0) + 1);
    if (r.cow_sire) cowUsage.set(r.cow_sire, (cowUsage.get(r.cow_sire) || 0) + 1);
  });

  const topAi = [...aiUsage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
  const topCow = [...cowUsage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);

  const aiSet = new Set(topAi);
  const cowSet = new Set(topCow);

  // Build intersection map
  const pairMap = new Map<string, { total: number; conceived: number }>();
  let herdTotal = 0, herdConceived = 0;

  records.forEach(r => {
    if (!r.ai_sire_1 || r.ai_sire_1.toLowerCase().includes('cleanup') || !r.ai_date_1) return;
    herdTotal++;
    if (r.preg_stage?.toLowerCase() === 'ai') herdConceived++;

    if (!aiSet.has(r.ai_sire_1) || !r.cow_sire || !cowSet.has(r.cow_sire)) return;
    const key = `${r.ai_sire_1}|${r.cow_sire}`;
    const entry = pairMap.get(key) || { total: 0, conceived: 0 };
    entry.total++;
    if (r.preg_stage?.toLowerCase() === 'ai') entry.conceived++;
    pairMap.set(key, entry);
  });

  const cells: HeatmapCell[] = [];
  topAi.forEach(ai => {
    topCow.forEach(cow => {
      const d = pairMap.get(`${ai}|${cow}`);
      cells.push({
        aiSire: ai,
        cowSire: cow,
        rate: d && d.total >= 5 ? Math.round((d.conceived / d.total) * 1000) / 10 : -1,
        n: d?.total || 0,
      });
    });
  });

  return {
    aiSires: topAi,
    cowSires: topCow,
    cells,
    herdAvg: herdTotal > 0 ? Math.round((herdConceived / herdTotal) * 1000) / 10 : 0,
  };
}

const cellColor = (rate: number) => {
  if (rate < 0) return 'bg-muted/40 text-muted-foreground';
  if (rate > 90) return 'bg-success/25 text-success';
  if (rate >= 75) return 'bg-yellow-500/25 text-yellow-400';
  return 'bg-destructive/25 text-destructive';
};

const barColor = (rate: number) => {
  if (rate >= 70) return 'hsl(142, 71%, 45%)';
  if (rate >= 55) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

export default function AdvancedSireSection({ records }: { records: BreedingCalvingRecord[] }) {
  const cowSireData = useMemo(() => computeCowSireRates(records), [records]);
  const heatmap = useMemo(() => computeHeatmap(records), [records]);

  const herdAvgCowSire = useMemo(() => {
    if (cowSireData.length === 0) return 0;
    const t = cowSireData.reduce((s, d) => s + d.rate * d.n, 0);
    const n = cowSireData.reduce((s, d) => s + d.n, 0);
    return n > 0 ? Math.round((t / n) * 10) / 10 : 0;
  }, [cowSireData]);

  return (
    <div className="space-y-6">
      <h2 className="text-[15px] font-semibold text-foreground border-b border-border pb-2">Advanced Analysis</h2>

      {/* AI Conception Rate by Cow Sire */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            AI Conception Rate by Cow Sire (Dam Line)
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Shows which dam lines settle best on first-service AI. Minimum 15 records per cow sire.
          </p>
        </CardHeader>
        <CardContent>
          {cowSireData.length === 0 ? (
            <EmptyState message="No cow sires with 15+ records." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(cowSireData.length * 36, 200)}>
              <BarChart layout="vertical" data={cowSireData} margin={{ left: 110, right: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  tickFormatter={v => `${v}%`} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={105} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, _: string, entry: any) => [`${value}% (n=${entry.payload.n})`, '1st Service AI Rate']}
                />
                <ReferenceLine x={herdAvgCowSire} stroke="hsl(var(--foreground))" strokeDasharray="5 5"
                  label={{ value: `Herd: ${herdAvgCowSire}%`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'top' }} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {cowSireData.map((d, i) => (
                    <Cell key={i} fill={barColor(d.rate)} />
                  ))}
                  <LabelList dataKey="n" position="right" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} formatter={(v: number) => `n=${v}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* AI Sire x Cow Sire Heatmap */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            AI Sire × Cow Sire Heatmap
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            First-service AI conception rate for top 10 AI sires vs top 10 cow sires by usage.
            Green &gt; 90%, yellow 75–90%, red &lt; 75%, gray = fewer than 5 records.
          </p>
        </CardHeader>
        <CardContent>
          {heatmap.aiSires.length === 0 || heatmap.cowSires.length === 0 ? (
            <EmptyState message="Not enough data for heatmap." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left p-2 text-muted-foreground font-medium sticky left-0 bg-card z-10">
                      AI Sire ↓ / Cow Sire →
                    </th>
                    {heatmap.cowSires.map(cs => (
                      <th key={cs} className="p-2 text-center text-muted-foreground font-medium min-w-[72px]">
                        {cs}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.aiSires.map(ai => (
                    <tr key={ai} className="border-t border-border">
                      <td className="p-2 font-medium text-foreground sticky left-0 bg-card z-10 whitespace-nowrap">
                        {ai}
                      </td>
                      {heatmap.cowSires.map(cow => {
                        const cell = heatmap.cells.find(c => c.aiSire === ai && c.cowSire === cow)!;
                        return (
                          <td key={cow} className={`p-2 text-center font-semibold rounded-sm ${cellColor(cell.rate)}`}>
                            {cell.rate < 0 ? (
                              <span className="text-[10px]">{cell.n > 0 ? `n=${cell.n}` : '—'}</span>
                            ) : (
                              <div>
                                <span>{cell.rate}%</span>
                                <div className="text-[9px] font-normal opacity-70">n={cell.n}</div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-3 italic">
                This identifies sire combinations that work particularly well or poorly in this herd specifically.
                Herd avg 1st service AI rate: {heatmap.herdAvg}%.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
