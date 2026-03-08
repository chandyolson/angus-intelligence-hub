import { useMemo } from 'react';
import { useAnimals, useBlairCombined } from '@/hooks/useCattleData';

export function useDataQualityCount() {
  const { data: animals } = useAnimals();
  const { data: combined } = useBlairCombined();

  return useMemo(() => {
    if (!animals || !combined) return 0;
    let count = 0;

    // Critical: null lifetime_id
    count += animals.filter(a => !a.lifetime_id).length;
    count += combined.filter(r => !r.lifetime_id).length;

    // Critical: calving before AI
    count += combined.filter(r => r.calving_date && r.ai_date_1 && r.calving_date < r.ai_date_1).length;

    // High: calving without birth weight
    count += combined.filter(r => r.calving_date && r.calf_bw == null).length;

    // High: abnormal gestation
    count += combined.filter(r => r.gestation_days != null && (r.gestation_days < 260 || r.gestation_days > 295)).length;

    return count;
  }, [animals, combined]);
}
