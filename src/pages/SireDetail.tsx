import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBreedingCalvingRecords, useAnimals } from '@/hooks/useCattleData';
import { BreedingCalvingRecord, Animal } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { ShimmerSkeleton, ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { EmptyState } from '@/components/ui/empty-state';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface AgeBucket {
  label: string;
  services: number;
  conceived: number;
  rate: number;
}

const BUCKET_ORDER = ['2', '3–4', '5–7', '8–10', '11+'];

function classifyAge(age: number): string | null {
  if (age < 2) return null;
  if (age === 2) return '2';
  if (age <= 4) return '3–4';
  if (age <= 7) return '5–7';
  if (age <= 10) return '8–10';
  return '11+';
}

function computeConceptionByAge(
  records: BreedingCalvingRecord[],
  sireName: string,
  animalMap: Map<string, number | null>
): { buckets: AgeBucket[]; overallRate: number } {
  const bucketMap = new Map<string, { services: number; conceived: number }>();
  let totalServices = 0;
  let totalConceived = 0;

  records.forEach(r => {
    // Check if this sire was used as ai_sire_1 or ai_sire_2
    const is1st = r.ai_sire_1 === sireName && r.ai_date_1 != null;
    const is2nd = r.ai_sire_2 === sireName && r.ai_date_2 != null;
    if (!is1st && !is2nd) return;
    if (!r.lifetime_id || r.breeding_year == null) return;

    const yearBorn = animalMap.get(r.lifetime_id);
    if (yearBorn == null) return;

    const cowAge = r.breeding_year - yearBorn;
    const bucket = classifyAge(cowAge);
    if (!bucket) return;

    const entry = bucketMap.get(bucket) || { services: 0, conceived: 0 };

    if (is1st) {
      entry.services++;
      totalServices++;
      if (r.preg_stage?.toLowerCase() === 'ai') {
        entry.conceived++;
        totalConceived++;
      }
    }
    if (is2nd) {
      entry.services++;
      totalServices++;
      if (r.preg_stage?.toLowerCase() === 'second ai') {
        entry.conceived++;
        totalConceived++;
      }
    }

    bucketMap.set(bucket, entry);
  });

  const buckets: AgeBucket[] = BUCKET_ORDER
    .filter(label => bucketMap.has(label))
    .map(label => {
      const d = bucketMap.get(label)!;
      return {
        label,
        services: d.services,
        conceived: d.conceived,
        rate: d.services > 0 ? Math.round((d.conceived / d.services) * 1000) / 10 : 0,
      };
    });

  const overallRate = totalServices > 0 ? Math.round((totalConceived / totalServices) * 1000) / 10 : 0;

  return { buckets, overallRate };
}

const rateColor = (rate: number) => {
  if (rate >= 70) return 'hsl(142, 71%, 45%)';
  if (rate >= 55) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

export default function SireDetail() {
  const navigate = useNavigate();
  const { sire_name } = useParams<{ sire_name: string }>();
  const decodedSire = decodeURIComponent(sire_name || '');
  const { data: records, isLoading: lr, error: recError } = useBreedingCalvingRecords();
  const { data: animals, isLoading: la, error: animError } = useAnimals();

  const animalMap = useMemo(() => {
    const m = new Map<string, number | null>();
    (animals ?? []).forEach(a => {
      if (a.lifetime_id) m.set(a.lifetime_id, a.year_born ?? null);
    });
    return m;
  }, [animals]);

  const { buckets, overallRate } = useMemo(() => {
    if (!records) return { buckets: [], overallRate: 0 };
    return computeConceptionByAge(records, decodedSire, animalMap);
  }, [records, decodedSire, animalMap]);

  // Overall sire stats
  const sireStats = useMemo(() => {
    if (!records) return null;
    let services1 = 0, conceived1 = 0, services2 = 0, conceived2 = 0;
    records.forEach(r => {
      if (r.ai_sire_1 === decodedSire && r.ai_date_1 != null) {
        services1++;
        if (r.preg_stage?.toLowerCase() === 'ai') conceived1++;
      }
      if (r.ai_sire_2 === decodedSire && r.ai_date_2 != null) {
        services2++;
        if (r.preg_stage?.toLowerCase() === 'second ai') conceived2++;
      }
    });
    return {
      firstRate: services1 > 0 ? Math.round((conceived1 / services1) * 1000) / 10 : null,
      firstN: services1,
      secondRate: services2 >= 5 ? Math.round((conceived2 / services2) * 1000) / 10 : null,
      secondN: services2,
    };
  }, [records, decodedSire]);

  const loading = lr || la;

  if (loading) return (
    <div className="space-y-4">
      <ShimmerSkeleton className="h-6 w-40" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <ShimmerCard key={i} />)}
      </div>
      <ShimmerSkeleton className="h-64" />
    </div>
  );

  if (recError || animError) return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</button>
      <ErrorBox />
    </div>
  );

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-foreground">{decodedSire}</h1>
        <p className="text-sm text-muted-foreground">AI Sire Performance Detail</p>
      </div>

      {/* KPI Cards */}
      {sireStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">1st Service Rate</p>
              <p className="text-[24px] font-bold" style={{ color: sireStats.firstRate != null ? rateColor(sireStats.firstRate) : undefined }}>
                {sireStats.firstRate != null ? `${sireStats.firstRate}%` : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">n={sireStats.firstN}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">2nd Service Rate</p>
              <p className="text-[24px] font-bold" style={{ color: sireStats.secondRate != null ? rateColor(sireStats.secondRate) : undefined }}>
                {sireStats.secondRate != null ? `${sireStats.secondRate}%` : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">n={sireStats.secondN}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Services</p>
              <p className="text-[24px] font-bold text-primary">{sireStats.firstN + sireStats.secondN}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overall Conception</p>
              <p className="text-[24px] font-bold" style={{ color: rateColor(overallRate) }}>{overallRate}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section 5 — Conception Rate by Cow Age at Breeding */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            Conception Rate by Cow Age at Breeding
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Cow age = breeding_year − year_born · Dashed line = sire's overall conception rate ({overallRate}%)
          </p>
        </CardHeader>
        <CardContent>
          {buckets.length === 0 ? (
            <EmptyState message="Not enough data to compute conception rate by cow age for this sire." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={buckets} margin={{ left: 10, right: 30, bottom: 20, top: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  label={{ value: 'Cow Age at Breeding', position: 'bottom', offset: 5, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}%`}
                  label={{ value: 'Conception Rate', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, _: string, entry: any) => [
                    `${value}% (${entry.payload.conceived}/${entry.payload.services})`,
                    'Conception Rate',
                  ]}
                  labelFormatter={(label: string) => `Age: ${label}`}
                />
                <ReferenceLine
                  y={overallRate}
                  stroke="hsl(var(--foreground))"
                  strokeDasharray="5 5"
                  label={{ value: `Sire Avg: ${overallRate}%`, fill: 'hsl(var(--muted-foreground))', fontSize: 10, position: 'right' }}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {buckets.map((b, i) => (
                    <Cell key={i} fill={rateColor(b.rate)} />
                  ))}
                  <LabelList
                    dataKey="services"
                    position="top"
                    style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    formatter={(v: number) => `n=${v}`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
