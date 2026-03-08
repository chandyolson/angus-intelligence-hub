export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      animals: {
        Row: {
          animal_type: string | null
          bw: number | null
          c1_conception_score: number | null
          c2_survival_score: number | null
          c3_interval_score: number | null
          c4_calves_per_year_score: number | null
          c5_gestation_score: number | null
          c6_birthweight_score: number | null
          cattle_type: string | null
          dam: string | null
          dam_bw: number | null
          dam_lid: string | null
          dam_sire: string | null
          dob: string | null
          eid: number | null
          granddam: string | null
          id: number
          lifetime_id: string | null
          operation: string | null
          origin: string | null
          other_id: string | null
          owner: string | null
          pedigree: string | null
          registration_name: string | null
          registration_number: number | null
          sex: string | null
          sire: string | null
          snyder_auto_number: number | null
          snyder_system_id: number | null
          status: string | null
          tag: string | null
          tag_color: string | null
          value_score: number | null
          value_score_percentile: number | null
          ww: number | null
          year_born: number | null
          yw: number | null
        }
        Insert: {
          animal_type?: string | null
          bw?: number | null
          c1_conception_score?: number | null
          c2_survival_score?: number | null
          c3_interval_score?: number | null
          c4_calves_per_year_score?: number | null
          c5_gestation_score?: number | null
          c6_birthweight_score?: number | null
          cattle_type?: string | null
          dam?: string | null
          dam_bw?: number | null
          dam_lid?: string | null
          dam_sire?: string | null
          dob?: string | null
          eid?: number | null
          granddam?: string | null
          id?: number
          lifetime_id?: string | null
          operation?: string | null
          origin?: string | null
          other_id?: string | null
          owner?: string | null
          pedigree?: string | null
          registration_name?: string | null
          registration_number?: number | null
          sex?: string | null
          sire?: string | null
          snyder_auto_number?: number | null
          snyder_system_id?: number | null
          status?: string | null
          tag?: string | null
          tag_color?: string | null
          value_score?: number | null
          value_score_percentile?: number | null
          ww?: number | null
          year_born?: number | null
          yw?: number | null
        }
        Update: {
          animal_type?: string | null
          bw?: number | null
          c1_conception_score?: number | null
          c2_survival_score?: number | null
          c3_interval_score?: number | null
          c4_calves_per_year_score?: number | null
          c5_gestation_score?: number | null
          c6_birthweight_score?: number | null
          cattle_type?: string | null
          dam?: string | null
          dam_bw?: number | null
          dam_lid?: string | null
          dam_sire?: string | null
          dob?: string | null
          eid?: number | null
          granddam?: string | null
          id?: number
          lifetime_id?: string | null
          operation?: string | null
          origin?: string | null
          other_id?: string | null
          owner?: string | null
          pedigree?: string | null
          registration_name?: string | null
          registration_number?: number | null
          sex?: string | null
          sire?: string | null
          snyder_auto_number?: number | null
          snyder_system_id?: number | null
          status?: string | null
          tag?: string | null
          tag_color?: string | null
          value_score?: number | null
          value_score_percentile?: number | null
          ww?: number | null
          year_born?: number | null
          yw?: number | null
        }
        Relationships: []
      }
      blair_combined: {
        Row: {
          ai_date_1: string | null
          ai_date_2: string | null
          ai_sire_1: string | null
          ai_sire_2: string | null
          breeding_year: number | null
          calf_bw: number | null
          calf_sex: string | null
          calf_sire: string | null
          calf_status: string | null
          calving_date: string | null
          calving_group: string | null
          cow_age: number | null
          cow_sire: string | null
          dog: number | null
          fetal_sex: string | null
          gestation_days: number | null
          lifetime_id: string | null
          memo: string | null
          preg_stage: string | null
          ultrasound_date: string | null
          ultrasound_group: string | null
          ultrasound_notes: string | null
        }
        Insert: {
          ai_date_1?: string | null
          ai_date_2?: string | null
          ai_sire_1?: string | null
          ai_sire_2?: string | null
          breeding_year?: number | null
          calf_bw?: number | null
          calf_sex?: string | null
          calf_sire?: string | null
          calf_status?: string | null
          calving_date?: string | null
          calving_group?: string | null
          cow_age?: number | null
          cow_sire?: string | null
          dog?: number | null
          fetal_sex?: string | null
          gestation_days?: number | null
          lifetime_id?: string | null
          memo?: string | null
          preg_stage?: string | null
          ultrasound_date?: string | null
          ultrasound_group?: string | null
          ultrasound_notes?: string | null
        }
        Update: {
          ai_date_1?: string | null
          ai_date_2?: string | null
          ai_sire_1?: string | null
          ai_sire_2?: string | null
          breeding_year?: number | null
          calf_bw?: number | null
          calf_sex?: string | null
          calf_sire?: string | null
          calf_status?: string | null
          calving_date?: string | null
          calving_group?: string | null
          cow_age?: number | null
          cow_sire?: string | null
          dog?: number | null
          fetal_sex?: string | null
          gestation_days?: number | null
          lifetime_id?: string | null
          memo?: string | null
          preg_stage?: string | null
          ultrasound_date?: string | null
          ultrasound_group?: string | null
          ultrasound_notes?: string | null
        }
        Relationships: []
      }
      bse: {
        Row: {
          auto_number: number | null
          dam_lifetime_id: string | null
          eid: number | null
          id: number
          lifetime_id: string | null
          morphology: number | null
          motility: number | null
          pass_fail: string | null
          pen: number | null
          primary_defects: string | null
          scrotal: number | null
          tag: string | null
          test_date: string
          weight: number | null
        }
        Insert: {
          auto_number?: number | null
          dam_lifetime_id?: string | null
          eid?: number | null
          id?: number
          lifetime_id?: string | null
          morphology?: number | null
          motility?: number | null
          pass_fail?: string | null
          pen?: number | null
          primary_defects?: string | null
          scrotal?: number | null
          tag?: string | null
          test_date: string
          weight?: number | null
        }
        Update: {
          auto_number?: number | null
          dam_lifetime_id?: string | null
          eid?: number | null
          id?: number
          lifetime_id?: string | null
          morphology?: number | null
          motility?: number | null
          pass_fail?: string | null
          pen?: number | null
          primary_defects?: string | null
          scrotal?: number | null
          tag?: string | null
          test_date?: string
          weight?: number | null
        }
        Relationships: []
      }
      calving_records: {
        Row: {
          birth_weight: number | null
          breeding_year: number | null
          calf_sex: string | null
          calf_sire: string | null
          calf_size: string | null
          calf_status: string | null
          calf_tag: string | null
          calf_tag_color: string | null
          calf_vigor: string | null
          calving_assistance: string | null
          calving_date: string
          calving_group: string | null
          cow_lifetime_id: string | null
          cow_sire: string | null
          cow_tag: string | null
          cow_tag_color: string | null
          death_explanation: string | null
          id: number
          location: string | null
          memo: string | null
          modified_time: string | null
          mothering_disposition: string | null
          operation: string | null
          owner: string | null
          quick_notes: string | null
          snyder_auto_number: number | null
          snyder_system_id: number | null
        }
        Insert: {
          birth_weight?: number | null
          breeding_year?: number | null
          calf_sex?: string | null
          calf_sire?: string | null
          calf_size?: string | null
          calf_status?: string | null
          calf_tag?: string | null
          calf_tag_color?: string | null
          calf_vigor?: string | null
          calving_assistance?: string | null
          calving_date: string
          calving_group?: string | null
          cow_lifetime_id?: string | null
          cow_sire?: string | null
          cow_tag?: string | null
          cow_tag_color?: string | null
          death_explanation?: string | null
          id?: number
          location?: string | null
          memo?: string | null
          modified_time?: string | null
          mothering_disposition?: string | null
          operation?: string | null
          owner?: string | null
          quick_notes?: string | null
          snyder_auto_number?: number | null
          snyder_system_id?: number | null
        }
        Update: {
          birth_weight?: number | null
          breeding_year?: number | null
          calf_sex?: string | null
          calf_sire?: string | null
          calf_size?: string | null
          calf_status?: string | null
          calf_tag?: string | null
          calf_tag_color?: string | null
          calf_vigor?: string | null
          calving_assistance?: string | null
          calving_date?: string
          calving_group?: string | null
          cow_lifetime_id?: string | null
          cow_sire?: string | null
          cow_tag?: string | null
          cow_tag_color?: string | null
          death_explanation?: string | null
          id?: number
          location?: string | null
          memo?: string | null
          modified_time?: string | null
          mothering_disposition?: string | null
          operation?: string | null
          owner?: string | null
          quick_notes?: string | null
          snyder_auto_number?: number | null
          snyder_system_id?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
