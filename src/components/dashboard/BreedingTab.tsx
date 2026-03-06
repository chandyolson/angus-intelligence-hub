import { useMemo, useState } from 'react';
import { useBlairCombined } from '@/hooks/useCattleData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { EmptyState } from '@/components/ui/empty-state';

const STAGE_COLORS: Record<string, string> = {
  'AI': 'hsl(142, 69%, 58%)',
  '2nd AI': 'hsl(190, 60%, 45%)',
  'Open': 'hsl(0, 86%, 71%)',
  'Bull': 'hsl(40, 63%, 49%)',
  'Late': 'hsl(270, 50%, 60%)',
  'Middle': 'hsl(30, 80%, 55%)',
};

const conceptionBarColor = (rate: number) =>
  rate >= 90 ? 'hsl(142, 69%, 58%)' : rate >= 80 ? 'hsl(40, 63%, 49%)' : 'hsl(0, 86%, 71%)';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs">
      <p className="text-primary font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>{p.name}: {typeof p.value === 'number' ? p.value : p.value}</p>
      ))}
    </div>
  );
};

const ConceptionBarLabel = ({ x, y, width, height, value, totalBred }: any) => {
  if (!totalBred) return null;
  return (
    <text x={x + width + 5} y={y + height / 2} dy={4} fontSize={10} fill="hsl(219, 23%, 53%)">
      n={totalBred}
    </text>
  );
};

interface ConceptionEntry {
  sire: string;
  ai_conception_rate: number;
  total_bred: number;
}

export default function BreedingTab() {
  const { data: combined, isLoading } = useBlairCombined();
  const records = combined ?? [];

  // Available years
  const years = useMemo(() => {
    const set = new Set<number>();
    records.forEach(r => { if (r.breeding_year) set.add(r.breeding_year); });
    return Array.from(set).sort((a, b) => b - a);
  }, [records]);

  const [selectedYear, setSelectedYear] = useState<string>('all');

  // ─── Section 1: Preg Stage by Project & Year (heatmap) ───
  const pregByProject = useMemo(() => {
    const filtered = selectedYear === 'all' ? records : records.filter(r => String(r.breeding_year) === selectedYear);
    const byProject = new Map<string, Record<string, number>>();
    const allStages = new Set<string>();

    filtered.forEach(r => {
      if (!r.project_record_id || !r.preg_stage) return;
      const proj = r.project_record_id;
      const stage = r.preg_stage;
      allStages.add(stage);
      const entry = byProject.get(proj) || {};
      entry[stage] = (entry[stage] || 0) + 1;
      byProject.set(proj, entry);
    });

    const stages = Array.from(allStages).sort();
    const data = Array.from(byProject.entries())
      .map(([project, counts]) => {
        const total = Object.values(counts).reduce((s, v) => s + v, 0);
        return { project, total, ...counts };
      })
      .sort((a, b) => b.total - a.total);

    // Find max count for intensity scaling
    let maxCount = 0;
    data.forEach(row => stages.forEach(s => { if ((row as any)[s] > maxCount) maxCount = (row as any)[s]; }));

    return { data, stages, maxCount };
  }, [records, selectedYear]);

  // ─── Section 2: AI Conception Rate by AI Sire (ai_sire_1) ───
  const conceptionByAiSire = useMemo((): ConceptionEntry[] => {
    const bySire = new Map<string, { total: number; ai: number }>();
    records.forEach(r => {
      if (!r.ai_date_1 || !r.ai_sire_1) return;
      const entry = bySire.get(r.ai_sire_1) || { total: 0, ai: 0 };
      entry.total++;
      if (r.preg_stage === 'AI') entry.ai++;
      bySire.set(r.ai_sire_1, entry);
    });
    return Array.from(bySire.entries())
      .filter(([, v]) => v.total >= 5)
      .map(([sire, d]) => ({
        sire,
        ai_conception_rate: Math.round((d.ai / d.total) * 1000) / 10,
        total_bred: d.total,
      }))
      .sort((a, b) => b.ai_conception_rate - a.ai_conception_rate);
  }, [records]);

  // ─── Section 3: AI Conception Rate by Cow Sire (cow_sire) ───
  const conceptionByCowSire = useMemo((): ConceptionEntry[] => {
    const bySire = new Map<string, { total: number; ai: number }>();
    records.forEach(r => {
      if (!r.ai_date_1 || !r.cow_sire) return;
      const entry = bySire.get(r.cow_sire) || { total: 0, ai: 0 };
      entry.total++;
      if (r.preg_stage === 'AI') entry.ai++;
      bySire.set(r.cow_sire, entry);
    });
    return Array.from(bySire.entries())
      .filter(([, v]) => v.total >= 5)
      .map(([sire, d]) => ({
        sire,
        ai_conception_rate: Math.round((d.ai / d.total) * 1000) / 10,
        total_bred: d.total,
      }))
      .sort((a, b) => b.ai_conception_rate - a.ai_conception_rate);
  }, [records]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <ShimmerSkeleton className="h-96" />
        <ShimmerSkeleton className="h-96" />
        <ShimmerSkeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Preg Stage by Project & Year — Heatmap */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            Preg Stage by Project & Year
          </CardTitle>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-sidebar border-border">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {pregByProject.data.length > 0 ? (
            <div className="overflow-x-auto">
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mb-4">
                {pregByProject.stages.map(stage => (
                  <div key={stage} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-3 h-3 rounded-sm" style={{ background: STAGE_COLORS[stage] || 'hsl(219, 23%, 53%)' }} />
                    {stage}
                  </div>
                ))}
              </div>
              {/* Heatmap grid */}
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border sticky left-0 bg-card">Project</th>
                    {pregByProject.stages.map(stage => (
                      <th key={stage} className="py-2 px-3 text-center text-muted-foreground font-medium border-b border-border min-w-[70px]">{stage}</th>
                    ))}
                    <th className="py-2 px-3 text-center text-muted-foreground font-medium border-b border-border min-w-[60px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pregByProject.data.map((row) => (
                    <tr key={row.project} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="py-2 px-3 text-foreground font-medium sticky left-0 bg-card">{row.project}</td>
                      {pregByProject.stages.map(stage => {
                        const count = (row as any)[stage] || 0;
                        const pct = row.total > 0 ? Math.round((count / row.total) * 1000) / 10 : 0;
                        const intensity = pregByProject.maxCount > 0 ? count / pregByProject.maxCount : 0;
                        const baseColor = STAGE_COLORS[stage] || 'hsl(219, 23%, 53%)';
                        return (
                          <td key={stage} className="py-2 px-3 text-center">
                            {count > 0 ? (
                              <span
                                className="inline-flex items-center justify-center rounded-md px-2.5 py-1 font-semibold text-xs min-w-[36px]"
                                style={{
                                  background: baseColor,
                                  opacity: 0.3 + intensity * 0.7,
                                  color: 'hsl(var(--card))',
                                }}
                              >
                                {pct}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">–</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-center text-foreground font-semibold">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No preg stage data with project records found." />
          )}
        </CardContent>
      </Card>

      {/* Section 2: AI Conception Rate by AI Sire */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            AI Conception Rate by AI Sire
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conceptionByAiSire.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(conceptionByAiSire.length * 30, 250)}>
              <BarChart data={conceptionByAiSire} layout="vertical" margin={{ left: 120, right: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} unit="%" />
                <YAxis dataKey="sire" type="category" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 10 }} width={115} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ai_conception_rate" name="AI Conception %" radius={[0, 4, 4, 0]}
                  label={({ x, y, width, height, index }: any) => (
                    <text x={x + width + 5} y={y + height / 2} dy={4} fontSize={10} fill="hsl(219, 23%, 53%)">
                      n={conceptionByAiSire[index]?.total_bred}
                    </text>
                  )}
                >
                  {conceptionByAiSire.map((d, i) => (
                    <Cell key={i} fill={conceptionBarColor(d.ai_conception_rate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No AI sire conception data available." />
          )}
        </CardContent>
      </Card>

      {/* Section 3: AI Conception Rate by Animal (Cow) Sire */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            AI Conception Rate by Cow Sire (Daughter Fertility)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conceptionByCowSire.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(conceptionByCowSire.length * 30, 250)}>
              <BarChart data={conceptionByCowSire} layout="vertical" margin={{ left: 120, right: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218, 42%, 20%)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 11 }} unit="%" />
                <YAxis dataKey="sire" type="category" tick={{ fill: 'hsl(219, 23%, 53%)', fontSize: 10 }} width={115} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ai_conception_rate" name="AI Conception %" radius={[0, 4, 4, 0]}
                  label={({ x, y, width, height, index }: any) => (
                    <text x={x + width + 5} y={y + height / 2} dy={4} fontSize={10} fill="hsl(219, 23%, 53%)">
                      n={conceptionByCowSire[index]?.total_bred}
                    </text>
                  )}
                >
                  {conceptionByCowSire.map((d, i) => (
                    <Cell key={i} fill={conceptionBarColor(d.ai_conception_rate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No cow sire conception data available." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
