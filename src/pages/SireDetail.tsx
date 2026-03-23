import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBreedingCalvingRecords, useAnimals } from '@/hooks/useCattleData';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { anonymizeSire } from '@/utils/anonymize';
import { ShimmerSkeleton, ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';

import ServicesOverTime from '@/components/sire-detail/ServicesOverTime';
import ConceptionByYear from '@/components/sire-detail/ConceptionByYear';
import CalfOutcomes from '@/components/sire-detail/CalfOutcomes';
import GestationDistribution from '@/components/sire-detail/GestationDistribution';
import SireCowList from '@/components/sire-detail/SireCowList';

const rateColor = (rate: number) => {
  if (rate >= 70) return 'hsl(142, 71%, 45%)';
  if (rate >= 55) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

export default function SireDetail() {
  const navigate = useNavigate();
  const { sire_name } = useParams<{ sire_name: string }>();
  const decodedSire = decodeURIComponent(sire_name || '');

  const { data: allRecords, isLoading: lr, error: recError } = useBreedingCalvingRecords();
  const { data: allAnimals, isLoading: la, error: animError } = useAnimals();

  // Filter to Blair operation only
  const blairRecords = useMemo(
    () => (allRecords ?? []).filter(r => (r as any).operation === 'Blair'),
    [allRecords]
  );

  // Sire-specific records (for services / conception)
  const sireRecords = useMemo(
    () => blairRecords.filter(r => r.ai_sire_1 === decodedSire || r.ai_sire_2 === decodedSire || r.calf_sire === decodedSire),
    [blairRecords, decodedSire]
  );

  // Herd average 1st service rate (all Blair)
  const herdAvg1stService = useMemo(() => {
    const withAiDate1 = blairRecords.filter(r => r.ai_date_1 != null);
    if (withAiDate1.length === 0) return 0;
    const aiConceived = withAiDate1.filter(r => r.preg_stage?.toLowerCase() === 'ai').length;
    return Math.round((aiConceived / withAiDate1.length) * 1000) / 10;
  }, [blairRecords]);

  // Herd average gestation (all Blair)
  const herdAvgGestation = useMemo(() => {
    const gests: number[] = [];
    blairRecords.forEach(r => {
      let gd = r.gestation_days;
      if (gd != null && gd >= 250 && gd <= 310) {
        gests.push(gd);
      } else if (r.calving_date && r.ai_date_1 && r.preg_stage?.toLowerCase() === 'ai') {
        const diff = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_1).getTime()) / 86400000);
        if (diff >= 250 && diff <= 310) gests.push(diff);
      }
    });
    if (gests.length === 0) return 0;
    return Math.round((gests.reduce((a, b) => a + b, 0) / gests.length) * 10) / 10;
  }, [blairRecords]);

  // Summary stats
  const summary = useMemo(() => {
    let services1 = 0, conceived1 = 0, services2 = 0, conceived2 = 0;
    const bws: number[] = [];
    const gests: number[] = [];

    blairRecords.forEach(r => {
      if (r.ai_sire_1 === decodedSire && r.ai_date_1 != null) {
        services1++;
        if (r.preg_stage?.toLowerCase() === 'ai') conceived1++;
      }
      if (r.ai_sire_2 === decodedSire && r.ai_date_2 != null) {
        services2++;
        if (r.preg_stage?.toLowerCase() === 'second ai') conceived2++;
      }
      if (r.calf_sire === decodedSire) {
        if (r.calf_bw != null && r.calf_bw > 0) bws.push(r.calf_bw);
        let gd = r.gestation_days;
        if (gd != null && gd >= 250 && gd <= 310) gests.push(gd);
        else if (r.calving_date && r.ai_date_1 && r.preg_stage?.toLowerCase() === 'ai') {
          const diff = Math.round((new Date(r.calving_date).getTime() - new Date(r.ai_date_1).getTime()) / 86400000);
          if (diff >= 250 && diff <= 310) gests.push(diff);
        }
      }
    });

    const totalServices = services1 + services2;
    const totalConceived = conceived1 + conceived2;
    const overallRate = totalServices > 0 ? Math.round((totalConceived / totalServices) * 1000) / 10 : 0;
    const avgBw = bws.length > 0 ? Math.round((bws.reduce((a, b) => a + b, 0) / bws.length) * 10) / 10 : 0;
    const avgGest = gests.length > 0 ? Math.round((gests.reduce((a, b) => a + b, 0) / gests.length) * 10) / 10 : 0;

    return { totalServices, overallRate, avgBw, avgGest, bwCount: bws.length, gestCount: gests.length };
  }, [blairRecords, decodedSire]);

  const loading = lr || la;

  if (loading) return (
    <div className="space-y-4">
      <ShimmerSkeleton className="h-6 w-40" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <ShimmerCard key={i} />)}
      </div>
      <ShimmerSkeleton className="h-64" />
      <ShimmerSkeleton className="h-64" />
    </div>
  );

  if (recError || animError) return (
    <div className="space-y-4">
      <button onClick={() => navigate('/sires')} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Sire Overview
      </button>
      <ErrorBox />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/sires')}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Sire Overview
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <h1 className="text-[20px] font-semibold text-foreground">{anonymizeSire(decodedSire)}</h1>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="outline" className="px-3 py-1.5 text-sm border-border bg-card">
          <span className="text-muted-foreground mr-1.5">Total Services:</span>
          <span className="font-bold text-foreground">{summary.totalServices}</span>
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-sm border-border bg-card">
          <span className="text-muted-foreground mr-1.5">Overall AI Rate:</span>
          <span className="font-bold" style={{ color: rateColor(summary.overallRate) }}>{summary.overallRate}%</span>
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-sm border-border bg-card">
          <span className="text-muted-foreground mr-1.5">Avg Birth Weight:</span>
          <span className="font-bold text-foreground">{summary.avgBw > 0 ? `${summary.avgBw} lbs` : '—'}</span>
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-sm border-border bg-card">
          <span className="text-muted-foreground mr-1.5">Avg Gestation:</span>
          <span className="font-bold text-foreground">{summary.avgGest > 0 ? `${summary.avgGest} days` : '—'}</span>
        </Badge>
      </div>

      {/* Section 1 — Services Over Time */}
      <ServicesOverTime records={blairRecords} sireName={decodedSire} />

      {/* Section 2 — Conception Rate by Year */}
      <ConceptionByYear records={blairRecords} sireName={decodedSire} herdAvg1stService={herdAvg1stService} />

      {/* Section 3 — Calf Outcomes */}
      <CalfOutcomes records={blairRecords} sireName={decodedSire} />

      {/* Section 4 — Gestation Distribution */}
      <GestationDistribution records={blairRecords} sireName={decodedSire} herdAvgGestation={herdAvgGestation} />

      {/* Section 5 — Cow List */}
      <SireCowList records={blairRecords} animals={allAnimals ?? []} sireName={decodedSire} />
    </div>
  );
}
