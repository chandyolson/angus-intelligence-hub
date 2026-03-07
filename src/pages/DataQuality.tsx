import { useState, useMemo } from 'react';
import { useAnimals, useBlairCombined } from '@/hooks/useCattleData';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';

interface FlaggedRecord {
  lifetime_id: string;
  detail: string;
  extraColumns?: Record<string, string>;
}

interface QualityCard {
  id: string;
  label: string;
  description: string;
  count: number;
  severity: 'red' | 'amber';
  records: FlaggedRecord[];
  customHeaders?: string[];
}

export default function DataQuality() {
  const { data: animals, isLoading: loadingAnimals, error: animalsError } = useAnimals();
  const { data: combined, isLoading: loadingCombined, error: combinedError } = useBlairCombined();
  const loading = loadingAnimals || loadingCombined;
  const [expanded, setExpanded] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  const cards: QualityCard[] = useMemo(() => {
    if (!animals || !combined) return [];

    // 18-month cutoff
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 18);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Recent records: any record with a date-bearing field in the last 18 months
    const recent = combined.filter(r => {
      const latestDate = r.calving_date ?? r.ai_date_1 ?? r.ultrasound_date;
      return latestDate != null && latestDate >= cutoffStr;
    });

    const blairActive = animals.filter(a => a.operation === 'Blair' && a.status?.toLowerCase() === 'active');

    // Index recent blair_combined by lifetime_id
    const combinedByLid = new Map<string, typeof combined>();
    recent.forEach(r => {
      if (!r.lifetime_id) return;
      const arr = combinedByLid.get(r.lifetime_id) || [];
      arr.push(r);
      combinedByLid.set(r.lifetime_id, arr);
    });

    // Lids that have at least one calving_date in last 18 months
    const lidsWithCalving = new Set<string>();
    recent.forEach(r => { if (r.lifetime_id && r.calving_date) lidsWithCalving.add(r.lifetime_id); });

    // Lids that appear in recent combined at all
    const lidsInCombined = new Set<string>();
    recent.forEach(r => { if (r.lifetime_id) lidsInCombined.add(r.lifetime_id); });

    // Card 1: Active Cows Never Calved (Age 2+)
    const neverCalved = blairActive.filter(a =>
      a.lifetime_id &&
      a.year_born != null && a.year_born <= currentYear - 2 &&
      !lidsWithCalving.has(a.lifetime_id)
    );

    // Card 2: Active Cows Never Bred
    const neverBred = blairActive.filter(a =>
      a.lifetime_id && !lidsInCombined.has(a.lifetime_id)
    );

    // Card 3: Sold/Dead with current year breeding
    const soldDeadLids = new Set(
      animals.filter(a => a.lifetime_id && ['sold', 'dead'].includes(a.status?.toLowerCase() ?? ''))
        .map(a => a.lifetime_id!)
    );
    const soldDeadCurrentYear = new Map<string, string>();
    recent.forEach(r => {
      if (r.lifetime_id && r.breeding_year === currentYear && soldDeadLids.has(r.lifetime_id)) {
        const animal = animals.find(a => a.lifetime_id === r.lifetime_id);
        soldDeadCurrentYear.set(r.lifetime_id, `Status: ${animal?.status ?? '?'}, Breeding Year: ${r.breeding_year}`);
      }
    });

    // Card 4: Alive calves missing birth weight (last 18 months)
    const missingBW = recent.filter(r =>
      r.calving_date != null &&
      r.calf_status?.toLowerCase() === 'alive' &&
      !(r.calf_sire && r.calf_sire.toLowerCase().includes('cleanup')) &&
      r.calf_bw == null
    );

    // Card 5: Breeding records missing ultrasound (last 18 months)
    const missingUS = recent.filter(r =>
      r.ai_date_1 != null &&
      r.ultrasound_date == null &&
      r.preg_stage == null
    );

    // Card 6: Abnormal calving intervals
    const abnormalIntervals: FlaggedRecord[] = [];
    combinedByLid.forEach((recs, lid) => {
      const calvingDates = recs
        .filter(r => r.calving_date)
        .map(r => new Date(r.calving_date!).getTime())
        .sort((a, b) => a - b);
      for (let i = 1; i < calvingDates.length; i++) {
        const days = Math.round((calvingDates[i] - calvingDates[i - 1]) / 86400000);
        if (days < 200 || days > 500) {
          abnormalIntervals.push({ lifetime_id: lid, detail: `${days} days between calvings` });
        }
      }
    });

    // Card 7: Contradictory AI/Cleanup Records
    const contradictoryAICleanup = combined.filter(r =>
      r.calf_sire === 'CLEANUP' &&
      (r.preg_stage === 'AI' || r.preg_stage === 'Second AI')
    ).sort((a, b) => (b.breeding_year ?? 0) - (a.breeding_year ?? 0));

    // Look up tags from animals
    const animalTagMap = new Map<string, string>();
    animals.forEach(a => { if (a.lifetime_id) animalTagMap.set(a.lifetime_id, a.tag ?? '—'); });

    return [
      {
        id: 'never-calved',
        label: 'Active Cows Never Calved (Age 2+)',
        description: 'Active cows age 2+ with no calving record in last 18 months',
        count: neverCalved.length,
        severity: neverCalved.length > 10 ? 'red' : 'amber',
        records: neverCalved.map(a => ({ lifetime_id: a.lifetime_id!, detail: `Born ${a.year_born}, Tag: ${a.tag ?? '—'}` })),
      },
      {
        id: 'never-bred',
        label: 'Active Cows Never Bred',
        description: 'Active cows with no breeding record in last 18 months',
        count: neverBred.length,
        severity: neverBred.length > 5 ? 'red' : 'amber',
        records: neverBred.map(a => ({ lifetime_id: a.lifetime_id!, detail: `Born ${a.year_born ?? '?'}, Tag: ${a.tag ?? '—'}` })),
      },
      {
        id: 'sold-dead-breeding',
        label: 'Sold/Dead With Current Year Breeding',
        description: `Cows marked Sold or Dead but have a ${currentYear} breeding record`,
        count: soldDeadCurrentYear.size,
        severity: soldDeadCurrentYear.size > 0 ? 'red' : 'amber',
        records: Array.from(soldDeadCurrentYear.entries()).map(([lid, detail]) => ({ lifetime_id: lid, detail })),
      },
      {
        id: 'missing-bw',
        label: 'Alive Calves Missing Birth Weight',
        description: 'Calving records where calf is alive but no birth weight recorded',
        count: missingBW.length,
        severity: missingBW.length > 20 ? 'red' : 'amber',
        records: missingBW.map(r => ({ lifetime_id: r.lifetime_id ?? '?', detail: `Calving: ${r.calving_date}, Sire: ${r.calf_sire ?? '?'}` })),
      },
      {
        id: 'missing-us',
        label: 'Breeding Records Missing Ultrasound',
        description: 'Records with AI date but no ultrasound date or preg stage',
        count: missingUS.length,
        severity: missingUS.length > 30 ? 'red' : 'amber',
        records: missingUS.map(r => ({ lifetime_id: r.lifetime_id ?? '?', detail: `AI Date: ${r.ai_date_1}, Year: ${r.breeding_year ?? '?'}` })),
      },
      {
        id: 'abnormal-interval',
        label: 'Abnormal Calving Intervals',
        description: 'Calving intervals under 200 or over 500 days (likely data entry error)',
        count: abnormalIntervals.length,
        severity: abnormalIntervals.length > 5 ? 'red' : 'amber',
        records: abnormalIntervals,
      },
    ];
  }, [animals, combined, currentYear]);

  if (animalsError || combinedError) return <ErrorBox />;

  return (
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 px-6 pt-6 pb-4 mb-2" style={{ background: 'linear-gradient(180deg, hsl(224, 52%, 14%) 0%, hsl(224, 48%, 11%) 100%)' }}>
        <h1 className="text-[20px] font-semibold text-foreground">Data Quality</h1>
        <p className="text-sm text-muted-foreground mt-1">Flagged records that may need attention or correction</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ShimmerCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(card => {
            const isExpanded = expanded === card.id;
            const borderColor = card.count === 0
              ? 'border-success/40'
              : card.severity === 'red'
                ? 'border-destructive/60'
                : 'border-primary/60';
            const countColor = card.count === 0
              ? 'text-success'
              : card.severity === 'red'
                ? 'text-destructive'
                : 'text-primary';

            return (
              <Card
                key={card.id}
                className={`bg-card ${borderColor} border-l-4 cursor-pointer transition-colors hover:border-foreground/30 ${isExpanded ? 'sm:col-span-2 lg:col-span-3' : ''}`}
                onClick={() => setExpanded(isExpanded ? null : card.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${card.count === 0 ? 'text-success' : card.severity === 'red' ? 'text-destructive' : 'text-primary'}`} />
                      <div>
                        <p className={`text-[28px] font-bold leading-none ${countColor}`}>{card.count}</p>
                        <p className="text-sm font-medium text-foreground mt-1">{card.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
                      </div>
                    </div>
                    {card.count > 0 && (
                      isExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    )}
                  </div>

                  {isExpanded && card.records.length > 0 && (
                    <div className="mt-4 max-h-[400px] overflow-auto rounded border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Lifetime ID</TableHead>
                            <TableHead className="text-xs">Detail</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {card.records.slice(0, 100).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-mono">{r.lifetime_id}</TableCell>
                              <TableCell className="text-xs">{r.detail}</TableCell>
                            </TableRow>
                          ))}
                          {card.records.length > 100 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-xs text-muted-foreground text-center">
                                Showing 100 of {card.records.length} records
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
