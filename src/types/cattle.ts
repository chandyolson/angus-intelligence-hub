export interface Animal {
  id: number;
  lifetime_id: string | null;
  tag: string | null;
  status: string | null;
  sex: string | null;
  year_born: number | null;
  dob: string | null;
  animal_type: string | null;
  sire: string | null;
  dam: string | null;
  dam_sire: string | null;
  dam_lid: string | null;
  dam_bw: number | null;
  bw: number | null;
  ww: number | null;
  yw: number | null;
  cattle_type: string | null;
  operation: string | null;
  owner: string | null;
  eid: number | null;
  granddam: string | null;
  other_id: string | null;
  origin: string | null;
  pedigree: string | null;
  registration_name: string | null;
  registration_number: number | null;
  tag_color: string | null;
  snyder_auto_number: number | null;
  snyder_system_id: number | null;
}

export interface BreedingCalvingRecord {
  lifetime_id: string | null;
  breeding_year: number | null;
  ai_date_1: string | null;
  ai_date_2: string | null;
  ai_sire_1: string | null;
  ai_sire_2: string | null;
  ultrasound_date: string | null;
  preg_stage: string | null;
  fetal_sex: string | null;
  calving_date: string | null;
  calf_sire: string | null;
  calf_sex: string | null;
  calf_status: string | null;
  calf_bw: number | null;
  dog: number | null;
  cow_sire: string | null;
  project_record_id: string | null;
  group: string | null;
  memo: string | null;
  ultrasound_notes: string | null;
}

export interface BreedingRecord {
  id: number;
  lifetime_id: string | null;
  tag: string | null;
  ai_date: string;
  ai_sire: string;
  status: string | null;
  cow_lookup: string | null;
  auto_number: number | null;
  master_eid: number | null;
  record_number: number | null;
}

export interface UltrasoundRecord {
  id: number;
  lifetime_id: string | null;
  tag: string | null;
  ultrasound_date: string;
  preg_stage: string;
  dog: number | null;
  calf_sex: string | null;
  cow_sire: string | null;
  cow_lookup: string | null;
  notes: string | null;
  auto_number: number | null;
  master_eid: number | null;
  project_record_id: string | null;
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
  first_service_rate: number;
  second_service_rate: number;
  calf_survival_rate: number;
  composite_score: number;
}

export interface SireStats {
  sire: string;
  units_used_1st: number;
  units_used_2nd: number;
  total_calves: number;
  first_service_rate: number;
  second_service_rate: number;
  overall_ai_rate: number;
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

export interface BlairCombinedRecord {
  lifetime_id: string | null;
  ai_date_1: string | null;
  ai_date_2: string | null;
  ai_sire_1: string | null;
  ai_sire_2: string | null;
  breeding_year: number | null;
  ultrasound_date: string | null;
  preg_stage: string | null;
  fetal_sex: string | null;
  dog: number | null;
  calving_date: string | null;
  calf_sire: string | null;
  calf_sex: string | null;
  calf_status: string | null;
  calf_bw: number | null;
  cow_sire: string | null;
  ultrasound_notes: string | null;
  memo: string | null;
  group: string | null;
  project_record_id: string | null;
  gestation_days: number | null;
}

export interface CullCandidate {
  lifetime_id: string;
  tag: string | null;
  year_born: number | null;
  sire: string | null;
  composite_score: number;
  reasons: string[];
}
