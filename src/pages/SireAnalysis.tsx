import { useMemo, useState } from 'react';
import { useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { Trophy, AlertTriangle, TrendingUp } from 'lucide-react';
import AdvancedSireSection from '@/components/sire-analysis/AdvancedSireSection';
import SireOverviewTable from '@/components/sire-analysis/SireOverviewTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, LabelList, ComposedChart, Line } from 'recharts';

interface SireRow {
  sire: string;
  rate: number;
  sampleSize: number;
  avgBW: number;
  survivalRate: number;
}

const rateColor = (rate: number) => {
  if (rate >= 70) return 'hsl(142, 71%, 45%)';
  if (rate >= 55) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

function computeSimpleServiceRows(records: BreedingCalvingRecord[]): SireRow[] {
  const sireMap = new Map<string, { aiDates: number; conceived: number; bws: number[]; alive: number; withCalf: number }>();
  records.forEach(r => {
    const sire = r.ai_sire_1;
    if (!sire || !r.ai_date_1) return;
    const entry = sireMap.get(sire) || { aiDates: 0, conceived: 0, bws: [], alive: 0, withCalf: 0 };
    entry.aiDates++;
    if (r.preg_stage?.toLowerCase() === 'ai') entry.conceived++;
    if (r.calf_status && r.calf_status.toLowerCase() !== 'open') {
      entry.withCalf++;
      if (r.calf_status.toLowerCase() === 'alive') entry.alive++;
      if (r.calf_bw != null && r.calf_bw > 0) entry.bws.push(r.calf_bw);
    }
    sireMap.set(sire, entry);
  });
  const rows: SireRow[] = [];
  sireMap.forEach((data, sire) => {
    if (data.aiDates < 10) return;
    const rate = Math.round((data.conceived / data.aiDates) * 1000) / 10;
    const avgBW = data.bws.length > 0 ? Math.round(data.bws.reduce((a, b) => a + b, 0) / data.bws.length) : 0;
    const survivalRate = data.withCalf > 0 ? Math.round((data.alive / data.withCalf) * 1000) / 10 : 0;
    rows.push({ sire, rate, sampleSize: data.aiDates, avgBW, survivalRate });
  });
  return rows;
}

export default function SireAnalysis() {
  const { data: records, isLoading, error } = useBreedingCalvingRecords();
  const firstServiceRows = useMemo(() => records ? computeSimpleServiceRows(records) : [], [records]);

  // Dynamic herd average 1st service rate: COUNT(preg_stage='AI') / COUNT(ai_date_1 IS NOT NULL)
  const herdAvg1stService = useMemo(() => {
    if (!records) return 0;
    const blair = records.filter(r => (r as any).operation === 'Blair');
    const withAiDate1 = blair.filter(r => r.ai_date_1 != null);
    if (withAiDate1.length === 0) return 0;
    const aiConceived = withAiDate1.filter(r => r.preg_stage?.toLowerCase() === 'ai').length;
    return Math.round((aiConceived / withAiDate1.length) * 1000) / 10;
  }, [records]);

  // Dynamic herd average 2nd service rate
  const herdAvg2ndService = useMemo(() => {
    if (!records) return { rate: 0, count: 0 };
    const blair = records.filter(r => (r as any).operation === 'Blair');
    const withAiDate2 = blair.filter(r => r.ai_date_2 != null);
    if (withAiDate2.length === 0) return { rate: 0, count: 0 };
    const conceived = withAiDate2.filter(r => r.preg_stage?.toLowerCase() === 'second ai').length;
    return { rate: Math.round((conceived / withAiDate2.length) * 1000) / 10, count: withAiDate2.length };
  }, [records]);

  const topPerformer = useMemo(() => {
    const eligible = firstServiceRows.filter(s => s.sampleSize >= 25);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => a.rate > b.rate ? a : b);
  }, [firstServiceRows]);

  const mostUsedBelowAvg = useMemo(() => {
    const eligible = firstServiceRows.filter(s => s.rate < 55);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => a.sampleSize > b.sampleSize ? a : b);
  }, [firstServiceRows]);

  // Gestation by calf_sire (with avg BW overlay)
  const gestationData = useMemo(() => {
    if (!records) return [];
    const sireMap = new Map<string, { gests: number[]; bws: number[] }>();
    records.forEach(r => {
      if (!r.calf_sire || r.calf_sire.toLowerCase().includes('cleanup')) return;
      let gd = r.gestation_days;
      if (gd == null || gd < 250 || gd > 310) {
        if (r.calving_date && r.ai_date_1 && (r.preg_stage?.toLowerCase() === 'ai')) {
          const diff = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_1).getTime()) / 86400000);
          if (diff >= 250 && diff <= 310) gd = diff; else return;
        } else if (r.calving_date && r.ai_date_2 && (r.preg_stage?.toLowerCase() === 'second ai')) {
          const diff = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_2).getTime()) / 86400000);
          if (diff >= 250 && diff <= 310) gd = diff; else return;
        } else return;
      }
      const entry = sireMap.get(r.calf_sire) || { gests: [], bws: [] };
      entry.gests.push(gd);
      if (r.calf_bw != null && r.calf_bw > 0) entry.bws.push(r.calf_bw);
      sireMap.set(r.calf_sire, entry);
    });
    const rows: { name: string; avg: number; count: number; avgBW: number | null }[] = [];
    sireMap.forEach((d, sire) => {
      if (d.gests.length < 10) return;
      rows.push({
        name: sire,
        avg: Math.round((d.gests.reduce((a, b) => a + b, 0) / d.gests.length) * 10) / 10,
        count: d.gests.length,
        avgBW: d.bws.length > 0 ? Math.round((d.bws.reduce((a, b) => a + b, 0) / d.bws.length) * 10) / 10 : null,
      });
    });
    return rows.sort((a, b) => a.avg - b.avg);
  }, [records]);

  const herdAvgGestation = useMemo(() => {
    if (gestationData.length === 0) return 0;
    const total = gestationData.reduce((s, d) => s + d.avg * d.count, 0);
    const n = gestationData.reduce((s, d) => s + d.count, 0);
    return n > 0 ? Math.round((total / n) * 10) / 10 : 0;
  }, [gestationData]);

  // BW by ai_sire_1
  const bwData = useMemo(() => {
    if (!records) return [];
    const sireMap = new Map<string, number[]>();
    records.forEach(r => {
      if (!r.ai_sire_1 || r.ai_sire_1.toLowerCase().includes('cleanup')) return;
      if (r.calf_bw == null || r.calf_bw <= 0) return;
      const arr = sireMap.get(r.ai_sire_1) || [];
      arr.push(r.calf_bw);
      sireMap.set(r.ai_sire_1, arr);
    });
    const rows: { name: string; avg: number; count: number }[] = [];
    sireMap.forEach((vals, sire) => {
      if (vals.length < 10) return;
      rows.push({ name: sire, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, count: vals.length });
    });
    return rows.sort((a, b) => a.avg - b.avg);
  }, [records]);

  const herdAvgBW = useMemo(() => {
    if (bwData.length === 0) return 0;
    const total = bwData.reduce((s, d) => s + d.avg * d.count, 0);
    const n = bwData.reduce((s, d) => s + d.count, 0);
    return n > 0 ? Math.round((total / n) * 10) / 10 : 0;
  }, [bwData]);

  // Scatter: gestation vs BW with survival coloring (Blair only, calf_sire, 260-295 gestation range)
  const scatterData = useMemo(() => {
    if (!records) return { points: [], herdAvgGest: 0, herdAvgBW: 0 };
    // First pass: collect gestation & BW data
    const sireMap = new Map<string, { gests: number[]; bws: number[] }>();
    records.forEach(r => {
      if ((r as any).operation !== 'Blair') return;
      const sire = r.calf_sire;
      if (!sire) return;
      const gd = r.gestation_days;
      if (gd == null || gd < 260 || gd > 295) return;
      if (r.calf_bw == null || r.calf_bw <= 0) return;
      const entry = sireMap.get(sire) || { gests: [], bws: [] };
      entry.gests.push(gd);
      entry.bws.push(r.calf_bw);
      sireMap.set(sire, entry);
    });
    // Second pass: collect survival data by calf_sire
    const survivalMap = new Map<string, { alive: number; total: number }>();
    records.forEach(r => {
      if ((r as any).operation !== 'Blair') return;
      const sire = r.calf_sire;
      if (!sire || !r.calf_status) return;
      const entry = survivalMap.get(sire) || { alive: 0, total: 0 };
      entry.total++;
      if (r.calf_status.toLowerCase() === 'alive') entry.alive++;
      survivalMap.set(sire, entry);
    });
    const points: { name: string; gestation: number; bw: number; count: number; survivalPct: number | null; survivalCount: number }[] = [];
    let allGest = 0, allBW = 0, allN = 0;
    sireMap.forEach((data, sire) => {
      if (data.gests.length < 10) return;
      const avgG = Math.round((data.gests.reduce((a, b) => a + b, 0) / data.gests.length) * 10) / 10;
      const avgB = Math.round((data.bws.reduce((a, b) => a + b, 0) / data.bws.length) * 10) / 10;
      const surv = survivalMap.get(sire);
      const survivalPct = surv && surv.total >= 5 ? Math.round((surv.alive / surv.total) * 1000) / 10 : null;
      const survivalCount = surv?.total ?? 0;
      points.push({ name: sire, gestation: avgG, bw: avgB, count: data.gests.length, survivalPct, survivalCount });
      allGest += avgG * data.gests.length;
      allBW += avgB * data.bws.length;
      allN += data.gests.length;
    });
    const herdAvgGest = allN > 0 ? Math.round((allGest / allN) * 10) / 10 : 0;
    const herdAvgBW = allN > 0 ? Math.round((allBW / allN) * 10) / 10 : 0;
    return { points, herdAvgGest, herdAvgBW };
  }, [records]);

  if (isLoading) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-48" />
      <ShimmerSkeleton className="h-96" />
    </div>
  );

  if (error) return <ErrorBox />;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Sire Analysis</h1>

      {/* Herd Average Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Herd 1st Service Rate</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: rateColor(herdAvg1stService) }}>{herdAvg1stService}%</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Herd 2nd Service Rate</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: rateColor(herdAvg2ndService.rate) }}>
              {herdAvg2ndService.count >= 5 ? `${herdAvg2ndService.rate}%` : '—'}
            </p>
          </CardContent>
        </Card>
        {topPerformer && (
          <Card className="bg-card border-success/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-4 w-4 text-success" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Top Performer</span>
              </div>
              <p className="text-lg font-bold text-foreground">{topPerformer.sire}</p>
              <p className="text-2xl font-bold" style={{ color: rateColor(topPerformer.rate) }}>{topPerformer.rate}%</p>
            </CardContent>
          </Card>
        )}
        {mostUsedBelowAvg && (
          <Card className="bg-card border-destructive/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Most Used &lt;55%</span>
              </div>
              <p className="text-lg font-bold text-foreground">{mostUsedBelowAvg.sire}</p>
              <p className="text-2xl font-bold" style={{ color: rateColor(mostUsedBelowAvg.rate) }}>{mostUsedBelowAvg.rate}%</p>
            </CardContent>
          </Card>
        )}
      </div>

      {records && <SireOverviewTable records={records} />}

      {/* Gestation Length by Sire */}
      {gestationData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Gestation Length by Sire</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Bars = avg gestation days · ◆ markers = avg birth weight (lbs, top axis)
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(gestationData.length * 36, 200)}>
              <ComposedChart layout="vertical" data={gestationData} margin={{ left: 110, right: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis xAxisId="gest" type="number" domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <XAxis xAxisId="bw" type="number" orientation="top" tick={{ fill: 'hsl(var(--primary))', fontSize: 10 }} tickFormatter={(v: number) => `${v} lbs`} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={105} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string, entry: any) => {
                    if (name === 'avgBW') return [`${value} lbs`, 'Avg Birth Weight'];
                    return [`${value} days (n=${entry.payload.count})`, 'Avg Gestation'];
                  }} />
                <ReferenceLine xAxisId="gest" x={herdAvgGestation} stroke="hsl(var(--foreground))" strokeDasharray="5 5"
                  label={{ value: `Herd Avg: ${herdAvgGestation}d`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'top' }} />
                <Bar xAxisId="gest" dataKey="avg" radius={[0, 4, 4, 0]}>
                  {gestationData.map((d, i) => (
                    <Cell key={i} fill={d.avg <= 275.5 ? 'hsl(142, 71%, 45%)' : d.avg <= 278 ? 'hsl(48, 96%, 53%)' : 'hsl(0, 72%, 51%)'} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} formatter={(v: number) => `n=${v}`} />
                </Bar>
                <Line xAxisId="bw" dataKey="avgBW" stroke="hsl(var(--primary))" strokeWidth={0} dot={{ r: 5, fill: 'hsl(var(--primary))', strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Birth Weight by Sire */}
      {bwData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Birth Weight by Sire</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(bwData.length * 36, 200)}>
              <BarChart layout="vertical" data={bwData} margin={{ left: 110, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={105} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, _: string, entry: any) => [`${value} lbs (n=${entry.payload.count})`, 'Avg BW']} />
                <ReferenceLine x={herdAvgBW} stroke="hsl(var(--foreground))" strokeDasharray="5 5"
                  label={{ value: `Herd Avg: ${herdAvgBW} lbs`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'top' }} />
                <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                  {bwData.map((d, i) => (
                    <Cell key={i} fill={d.avg > 90 ? 'hsl(0, 72%, 51%)' : 'hsl(142, 71%, 45%)'} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} formatter={(v: number) => `n=${v}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Gestation vs Birth Weight Quadrant Scatter */}
      {scatterData.points.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Gestation vs Birth Weight by Sire</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Dot size = sample size · Quadrants based on herd averages ({scatterData.herdAvgGest}d / {scatterData.herdAvgBW} lbs). Blair operation only.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(142, 71%, 45%)' }} /> 100% Survival</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(48, 96%, 53%)' }} /> 97–99% Survival</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(0, 72%, 51%)' }} /> &lt;97% Survival</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: 'hsl(var(--muted-foreground))' }} /> Insufficient Data</span>
            </div>
            <ResponsiveContainer width="100%" height={440}>
              <ScatterChart margin={{ left: 10, right: 30, bottom: 30, top: 10 }}>
                {/* Quadrant background rectangles */}
                <defs>
                  <linearGradient id="qGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(142,71%,45%)" stopOpacity={0.08} /><stop offset="100%" stopColor="hsl(142,71%,45%)" stopOpacity={0.08} /></linearGradient>
                  <linearGradient id="qYellow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(48,96%,53%)" stopOpacity={0.08} /><stop offset="100%" stopColor="hsl(48,96%,53%)" stopOpacity={0.08} /></linearGradient>
                  <linearGradient id="qRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(0,72%,51%)" stopOpacity={0.08} /><stop offset="100%" stopColor="hsl(0,72%,51%)" stopOpacity={0.08} /></linearGradient>
                </defs>
                {/* Quadrant labels rendered via ReferenceArea */}
                <ReferenceArea x1={scatterData.herdAvgGest} x2={295} y1={scatterData.herdAvgBW} y2={120} fill="url(#qRed)" fillOpacity={1}
                  label={{ value: 'High Dystocia Risk', fill: 'hsl(0, 72%, 51%)', fontSize: 10, position: 'insideTopRight' }} />
                <ReferenceArea x1={260} x2={scatterData.herdAvgGest} y1={scatterData.herdAvgBW} y2={120} fill="url(#qYellow)" fillOpacity={1}
                  label={{ value: 'Monitor', fill: 'hsl(48, 96%, 53%)', fontSize: 10, position: 'insideTopLeft' }} />
                <ReferenceArea x1={scatterData.herdAvgGest} x2={295} y1={50} y2={scatterData.herdAvgBW} fill="url(#qYellow)" fillOpacity={1}
                  label={{ value: 'Monitor', fill: 'hsl(48, 96%, 53%)', fontSize: 10, position: 'insideBottomRight' }} />
                <ReferenceArea x1={260} x2={scatterData.herdAvgGest} y1={50} y2={scatterData.herdAvgBW} fill="url(#qGreen)" fillOpacity={1}
                  label={{ value: 'Ideal Range', fill: 'hsl(142, 71%, 45%)', fontSize: 10, position: 'insideBottomLeft' }} />
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="gestation" name="Gestation (d)" type="number" domain={[260, 295]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  label={{ value: 'Avg Gestation (days)', position: 'bottom', offset: 15, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis dataKey="bw" name="Birth Weight (lbs)" type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  label={{ value: 'Avg BW (lbs)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <ZAxis dataKey="count" range={[80, 600]} name="Sample Size" />
                <ReferenceLine x={scatterData.herdAvgGest} stroke="hsl(var(--foreground))" strokeDasharray="5 5"
                  label={{ value: `${scatterData.herdAvgGest}d`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'top' }} />
                <ReferenceLine y={scatterData.herdAvgBW} stroke="hsl(var(--foreground))" strokeDasharray="5 5"
                  label={{ value: `${scatterData.herdAvgBW} lbs`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'right' }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
                        <p className="text-primary font-medium">{d.name}</p>
                        <p className="text-muted-foreground">Gestation: {d.gestation} days</p>
                        <p className="text-muted-foreground">Avg BW: {d.bw} lbs</p>
                        <p className="text-muted-foreground">Survival: {d.survivalPct != null ? `${d.survivalPct}%` : '—'}</p>
                        <p className="text-muted-foreground">Calves: {d.count}</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData.points} fill="hsl(var(--primary))">
                  {scatterData.points.map((p, i) => {
                    const fill = p.survivalPct == null
                      ? 'hsl(var(--muted-foreground))'
                      : p.survivalPct >= 100 ? 'hsl(142, 71%, 45%)'
                      : p.survivalPct >= 97 ? 'hsl(48, 96%, 53%)'
                      : 'hsl(0, 72%, 51%)';
                    return <Cell key={i} fill={fill} />;
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}


      {/* Advanced Section */}
      {records && records.length > 0 && <AdvancedSireSection records={records} />}
    </div>
  );
}
