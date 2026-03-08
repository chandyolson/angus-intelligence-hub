import { useMemo } from 'react';
import { useAnimals, useBlairCombined } from '@/hooks/useCattleData';

export function useDataQualityCount() {
  const { data: animals } = useAnimals();
  const { data: combined } = useBlairCombined();

  return useMemo(() => {
    if (!animals || !combined) return 0;

    const currentYear = new Date().getFullYear();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 18);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const recent = combined.filter(r => {
      const latestDate = r.calving_date ?? r.ai_date_1 ?? r.ultrasound_date;
      return latestDate != null && latestDate >= cutoffStr;
    });

    const blairActive = animals.filter(a => a.operation === 'Blair' && a.status?.toLowerCase() === 'active');
    const lidsWithCalving = new Set<string>();
    const lidsInCombined = new Set<string>();
    recent.forEach(r => {
      if (r.lifetime_id && r.calving_date) lidsWithCalving.add(r.lifetime_id);
      if (r.lifetime_id) lidsInCombined.add(r.lifetime_id);
    });

    const neverCalved = blairActive.filter(a => a.lifetime_id && a.year_born != null && a.year_born <= currentYear - 2 && !lidsWithCalving.has(a.lifetime_id)).length;
    const neverBred = blairActive.filter(a => a.lifetime_id && !lidsInCombined.has(a.lifetime_id)).length;

    return neverCalved + neverBred;
  }, [animals, combined]);
}
