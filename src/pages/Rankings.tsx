import { useMemo, useState } from 'react';
import { useActiveAnimals, useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { computeCowStats, computeCompositeScores, getQuartile, generateCullList, exportToCSV } from '@/lib/calculations';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, AlertTriangle } from 'lucide-react';

export default function Rankings() {
  const { data: animals, isLoading: la } = useActiveAnimals();
  const { data: records, isLoading: lr } = useBreedingCalvingRecords();
  const [showAll, setShowAll] = useState(false);
  const [showCull, setShowCull] = useState(false);
  const [sire1, setSire1] = useState('');
  const [sire2, setSire2] = useState('');

  const cowStats = useMemo(() => {
    if (!animals || !records) return [];
    const raw = animals.map(a => computeCowStats(a, records));
    return computeCompositeScores(raw).sort((a, b) => b.composite_score - a.composite_score);
  }, [animals, records]);

  const allScores = useMemo(() => cowStats.filter(s => s.composite_score > 0).map(s => s.composite_score), [cowStats]);

  const cullList = useMemo(() => {
    if (!records) return [];
    return generateCullList(cowStats, records, new Date().getFullYear());
  }, [cowStats, records]);

  const displayed = showAll ? cowStats : [...cowStats.slice(0, 50), ...cowStats.slice(-50)];

  const sires = useMemo(() => [...new Set(cowStats.map(c => c.sire).filter(Boolean) as string[])].sort(), [cowStats]);

  const sireComparison = useMemo(() => {
    if (!sire1 || !sire2 || !records) return null;
    const calc = (sire: string) => {
      const recs = records.filter(r => r.calf_sire === sire || r.sire === sire);
      const withCalves = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
      const bws = withCalves.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
      const gests = recs.map(r => r.gestation_days).filter((v): v is number => v != null && v > 0);
      const alive = withCalves.filter(r => !['dead', 'stillborn', 'died'].includes(r.calf_status?.toLowerCase() || ''));
      return {
        conceptionRate: recs.length ? Math.round((withCalves.length / recs.length) * 1000) / 10 : 0,
        avgGestation: gests.length ? Math.round(gests.reduce((a, b) => a + b, 0) / gests.length * 10) / 10 : 0,
        avgBW: bws.length ? Math.round(bws.reduce((a, b) => a + b, 0) / bws.length) : 0,
        survival: withCalves.length ? Math.round((alive.length / withCalves.length) * 1000) / 10 : 0,
        total: withCalves.length,
      };
    };
    return { s1: calc(sire1), s2: calc(sire2) };
  }, [sire1, sire2, records]);

  const quartileBadge = (score: number) => {
    const q = getQuartile(score, allScores);
    const colors: Record<string, string> = { top: 'bg-success/20 text-success', upper: 'bg-[hsl(50,80%,50%)]/20 text-[hsl(50,80%,50%)]', lower: 'bg-[hsl(35,80%,50%)]/20 text-[hsl(35,80%,50%)]', bottom: 'bg-destructive/20 text-destructive' };
    const labels: Record<string, string> = { top: 'Top 25%', upper: '50-75%', lower: '25-50%', bottom: 'Bottom 25%' };
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[q]}`}>{labels[q]}</span>;
  };

  if (la || lr) return <div className="space-y-4"><Skeleton className="h-10" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Rankings & Culling</h1>

      {/* Rankings Table */}
      <Card className="bg-card border-card-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Composite Score Rankings</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowAll(p => !p)} className="text-xs text-primary">
            {showAll ? 'Show Top/Bottom 50' : 'Show All'}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-auto rounded border border-card-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar border-card-border hover:bg-sidebar">
                  <TableHead>Rank</TableHead><TableHead>Tag</TableHead><TableHead>Lifetime ID</TableHead>
                  <TableHead>Year Born</TableHead><TableHead>Sire</TableHead><TableHead>Calves</TableHead>
                  <TableHead>AI %</TableHead><TableHead>Surv %</TableHead><TableHead>Avg BW</TableHead>
                  <TableHead>Score</TableHead><TableHead>Quartile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayed.map((cow, i) => (
                  <TableRow key={cow.lifetime_id} className="border-card-border">
                    <TableCell className="font-medium text-primary">{cowStats.indexOf(cow) + 1}</TableCell>
                    <TableCell>{cow.tag || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{cow.lifetime_id}</TableCell>
                    <TableCell>{cow.year_born || '—'}</TableCell>
                    <TableCell>{cow.sire || '—'}</TableCell>
                    <TableCell>{cow.total_calves}</TableCell>
                    <TableCell>{cow.ai_conception_rate}%</TableCell>
                    <TableCell>{cow.calf_survival_rate}%</TableCell>
                    <TableCell>{cow.avg_bw || '—'}</TableCell>
                    <TableCell className="font-semibold">{cow.composite_score}</TableCell>
                    <TableCell>{quartileBadge(cow.composite_score)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Cull Engine */}
      <Card className="bg-card border-card-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Cull Recommendation Engine</CardTitle>
          <div className="flex gap-2">
            <Button onClick={() => setShowCull(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm">
              <AlertTriangle className="h-4 w-4 mr-1" /> Generate Cull List
            </Button>
            {showCull && cullList.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => exportToCSV(cullList.map(c => ({ ...c, reasons: c.reasons.join('; ') })), 'cull_list.csv')}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            )}
          </div>
        </CardHeader>
        {showCull && (
          <CardContent>
            {cullList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cows meet cull criteria.</p>
            ) : (
              <div className="max-h-[400px] overflow-auto rounded border border-primary/30">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[hsl(20,40%,8%)] border-primary/30 hover:bg-[hsl(20,40%,8%)]">
                      <TableHead>Tag</TableHead><TableHead>Lifetime ID</TableHead><TableHead>Year Born</TableHead>
                      <TableHead>Score</TableHead><TableHead>Reason for Cull Flag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cullList.map(c => (
                      <TableRow key={c.lifetime_id} className="bg-[hsl(20,40%,6%)] border-primary/20">
                        <TableCell className="text-foreground">{c.tag || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.lifetime_id}</TableCell>
                        <TableCell>{c.year_born || '—'}</TableCell>
                        <TableCell className="text-destructive font-semibold">{c.composite_score}</TableCell>
                        <TableCell className="text-sm">
                          {c.reasons.map((r, i) => <span key={i} className="block text-primary text-xs">• {r}</span>)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Sire Comparison */}
      <Card className="bg-card border-card-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Sire Comparison</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <Select value={sire1} onValueChange={setSire1}>
              <SelectTrigger className="w-[200px] bg-background border-card-border"><SelectValue placeholder="Select Sire 1" /></SelectTrigger>
              <SelectContent>{sires.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-muted-foreground self-center">vs</span>
            <Select value={sire2} onValueChange={setSire2}>
              <SelectTrigger className="w-[200px] bg-background border-card-border"><SelectValue placeholder="Select Sire 2" /></SelectTrigger>
              <SelectContent>{sires.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {sireComparison && (
            <div className="grid grid-cols-6 gap-2 text-sm">
              <div /><div className="font-medium text-primary">{sire1}</div><div className="font-medium text-primary">{sire2}</div>
              {[
                ['AI Conception %', sireComparison.s1.conceptionRate, sireComparison.s2.conceptionRate],
                ['Avg Gestation', sireComparison.s1.avgGestation, sireComparison.s2.avgGestation],
                ['Avg Calf BW', sireComparison.s1.avgBW, sireComparison.s2.avgBW],
                ['Calf Survival %', sireComparison.s1.survival, sireComparison.s2.survival],
                ['Total Calves', sireComparison.s1.total, sireComparison.s2.total],
              ].map(([label, v1, v2]) => (
                <>
                  <div className="text-muted-foreground col-span-2 md:col-span-1">{label as string}</div>
                  <div className="font-medium">{v1 as number}</div>
                  <div className="font-medium">{v2 as number}</div>
                </>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
