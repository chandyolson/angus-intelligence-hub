import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAnimal, useCowBreedingRecords, useUltrasoundRecords } from '@/hooks/useCattleData';
import { computeCowStats, computeCompositeScores, generatePerformanceNotes } from '@/lib/calculations';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft } from 'lucide-react';

const CHART_COLORS = { grid: '#1E2E4A', gold: '#CA972E' };

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-card-border rounded-md px-3 py-2 text-xs">
      <p className="text-primary font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

export default function CowDetail() {
  const { lifetime_id } = useParams<{ lifetime_id: string }>();
  const decodedId = decodeURIComponent(lifetime_id || '');
  const { data: animal, isLoading: la } = useAnimal(decodedId);
  const { data: calvingRecords, isLoading: lr } = useCowBreedingRecords(decodedId);
  const { data: ultrasoundRecords, isLoading: lu } = useUltrasoundRecords(decodedId);

  const stats = useMemo(() => {
    if (!animal || !calvingRecords) return null;
    const raw = computeCowStats(animal, calvingRecords);
    const [computed] = computeCompositeScores([raw]);
    return computed;
  }, [animal, calvingRecords]);

  const notes = useMemo(() => {
    if (!stats || !calvingRecords) return [];
    return generatePerformanceNotes(stats, calvingRecords);
  }, [stats, calvingRecords]);

  const bwTrend = useMemo(() => {
    if (!calvingRecords) return [];
    return calvingRecords
      .filter(r => r.calf_bw && r.calf_bw > 0 && r.breeding_year)
      .sort((a, b) => (a.breeding_year ?? 0) - (b.breeding_year ?? 0))
      .map(r => ({ year: String(r.breeding_year), bw: r.calf_bw }));
  }, [calvingRecords]);

  if (la || lr) return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!animal) return <div className="text-destructive">Animal not found.</div>;

  return (
    <div className="space-y-6">
      <Link to="/roster" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Roster
      </Link>

      {/* Header */}
      <Card className="bg-card border-card-border">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Tag #{animal.tag || '—'}</h1>
              <p className="text-sm text-muted-foreground mt-1">{animal.lifetime_id}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                <span>Born: {animal.year_born || '—'}</span>
                <span>Sire: {animal.sire || '—'}</span>
                <span>Dam Sire: {animal.dam_sire || '—'}</span>
                <span>Type: {animal.animal_type || '—'}</span>
              </div>
            </div>
            <Badge variant={animal.status?.toLowerCase() === 'active' ? 'default' : 'secondary'}>
              {animal.status || '—'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* KPI Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total Calvings', value: stats.total_calves },
            { label: 'Avg Calf BW', value: stats.avg_bw ? `${stats.avg_bw} lbs` : '—' },
            { label: 'AI Conception', value: `${stats.ai_conception_rate}%` },
            { label: 'Survival Rate', value: `${stats.calf_survival_rate}%` },
            { label: 'Composite Score', value: stats.composite_score },
          ].map(k => (
            <Card key={k.label} className="bg-card border-card-border">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-xl font-bold text-primary">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Calving History */}
      <Card className="bg-card border-card-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Calving History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-card-border hover:bg-transparent">
                <TableHead>Year</TableHead><TableHead>AI Date</TableHead><TableHead>Sire</TableHead>
                <TableHead>Preg Stage</TableHead><TableHead>Calving Date</TableHead><TableHead>Sex</TableHead>
                <TableHead>BW</TableHead><TableHead>Status</TableHead><TableHead>Gestation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calvingRecords?.sort((a, b) => (b.breeding_year ?? 0) - (a.breeding_year ?? 0)).map((r, i) => (
                <TableRow key={i} className="border-card-border">
                  <TableCell>{r.breeding_year || '—'}</TableCell>
                  <TableCell className="text-xs">{r.ai_date_1 || '—'}</TableCell>
                  <TableCell>{r.calf_sire || r.sire || '—'}</TableCell>
                  <TableCell>{r.preg_stage || '—'}</TableCell>
                  <TableCell className="text-xs">{r.calving_date || '—'}</TableCell>
                  <TableCell>{r.calf_sex || '—'}</TableCell>
                  <TableCell>{r.calf_bw || '—'}</TableCell>
                  <TableCell>{r.calf_status || '—'}</TableCell>
                  <TableCell>{r.gestation_days || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Ultrasound History */}
      {ultrasoundRecords && ultrasoundRecords.length > 0 && (
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ultrasound History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-card-border hover:bg-transparent">
                  <TableHead>Date</TableHead><TableHead>Preg Stage</TableHead>
                  <TableHead>Calf Sex</TableHead><TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ultrasoundRecords.map((r, i) => (
                  <TableRow key={i} className="border-card-border">
                    <TableCell className="text-xs">{r.ultrasound_date || '—'}</TableCell>
                    <TableCell>{r.preg_stage || '—'}</TableCell>
                    <TableCell>{r.calf_sex || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BW Trend */}
        {bwTrend.length > 1 && (
          <Card className="bg-card border-card-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Birth Weight Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={bwTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="year" tick={{ fill: '#6B7FA3', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6B7FA3', fontSize: 11 }} unit=" lbs" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="bw" stroke={CHART_COLORS.gold} strokeWidth={2} dot={{ r: 4 }} name="Birth Weight" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Performance Notes */}
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Performance Notes</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {notes.map((n, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>{n}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
