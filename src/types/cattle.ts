export interface Animal {
  lifetime_id: string;
  tag: string | null;
  status: string | null;
  sex: string | null;
  year_born: number | null;
  dob: string | null;
  animal_type: string | null;
  sire: string | null;
  dam_sire: string | null;
  bw: number | null;
  ww: number | null;
  yw: number | null;
  cattle_type: string | null;
  operation: string | null;
  owner: string | null;
}

export interface BreedingCalvingRecord {
  lifetime_id: string | null;
  status: string | null;
  sire: string | null;
  dam_sire: string | null;
  year_born: number | null;
  breeding_year: number | null;
  ai_date_1: string | null;
  ai_date_2: string | null;
  ultrasound_date: string | null;
  preg_stage: string | null;
  fetal_sex: string | null;
  days_of_gestation_at_scan: number | null;
  calving_date: string | null;
  calf_sire: string | null;
  calf_sex: string | null;
  calf_status: string | null;
  calf_bw: number | null;
  est_calving_date: string | null;
  gestation_days: number | null;
}

export interface BreedingRecord {
  id: string;
  lifetime_id: string | null;
  tag: string | null;
  ai_date: string | null;
  ai_sire: string | null;
  status: string | null;
  cow_lookup: string | null;
}

export interface UltrasoundRecord {
  id: string;
  lifetime_id: string | null;
  tag: string | null;
  ultrasound_date: string | null;
  preg_stage: string | null;
  dog: string | null;
  calf_sex: string | null;
  cow_sire: string | null;
  cow_lookup: string | null;
  notes: string | null;
}

export interface CowStats {
  lifetime_id: string;
  tag: string | null;
  year_born: number | null;
  sire: string | null;
  dam_sire: string | null;
  status: string | null;
  animal_type: string | null;
  total_calves: number;
  avg_bw: number;
  ai_conception_rate: number;
  calf_survival_rate: number;
  composite_score: number;
}

export interface SireStats {
  sire: string;
  total_calves: number;
  ai_conception_rate: number;
  avg_gestation_days: number;
  avg_calf_bw: number;
  calf_survival_rate: number;
  bull_calf_pct: number;
  performance_badge: 'ELITE' | 'STRONG' | 'AVERAGE' | 'BELOW AVG';
}

export interface CalvingIntervalStats {
  average: number;
  median: number;
  best: number;
  longest: number;
}

export interface CullCandidate {
  lifetime_id: string;
  tag: string | null;
  year_born: number | null;
  sire: string | null;
  composite_score: number;
  reasons: string[];
}
