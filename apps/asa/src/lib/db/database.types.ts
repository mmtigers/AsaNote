export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      analytics_events: {
        Row: {
          client_ts: string
          created_at: string
          event_name: string
          id: string
          properties: Json
          record_id: string | null
          user_id: string
        }
        Insert: {
          client_ts: string
          created_at?: string
          event_name: string
          id?: string
          properties?: Json
          record_id?: string | null
          user_id: string
        }
        Update: {
          client_ts?: string
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json
          record_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      children: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      client_errors: {
        Row: {
          app: string
          app_version: string | null
          client_ts: string
          context: Json | null
          created_at: string
          id: string
          message: string
          path: string | null
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app: string
          app_version?: string | null
          client_ts: string
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          path?: string | null
          source: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app?: string
          app_version?: string | null
          client_ts?: string
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          path?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      group_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          group_id: string
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          group_id: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          group_id?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          enabled: boolean
          notify_partner_record: boolean
          reminder_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          notify_partner_record?: boolean
          reminder_time?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          notify_partner_record?: boolean
          reminder_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      records: {
        Row: {
          child_id: string | null
          companion: string | null
          condition_scale: number | null
          created_at: string
          depart_time: string | null
          handoff: string | null
          id: string
          memo: string | null
          outcome: string | null
          reason_tags: string[]
          record_date: string
          response_tags: string[]
          struggled: boolean | null
          trigger_tags: string[]
          updated_at: string
          user_id: string
          wake_tags: string[]
          wake_time: string | null
        }
        Insert: {
          child_id?: string | null
          companion?: string | null
          condition_scale?: number | null
          created_at?: string
          depart_time?: string | null
          handoff?: string | null
          id?: string
          memo?: string | null
          outcome?: string | null
          reason_tags?: string[]
          record_date: string
          response_tags?: string[]
          struggled?: boolean | null
          trigger_tags?: string[]
          updated_at?: string
          user_id: string
          wake_tags?: string[]
          wake_time?: string | null
        }
        Update: {
          child_id?: string | null
          companion?: string | null
          condition_scale?: number | null
          created_at?: string
          depart_time?: string | null
          handoff?: string | null
          id?: string
          memo?: string | null
          outcome?: string | null
          reason_tags?: string[]
          record_date?: string
          response_tags?: string[]
          struggled?: boolean | null
          trigger_tags?: string[]
          updated_at?: string
          user_id?: string
          wake_tags?: string[]
          wake_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "records_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_deliveries: {
        Row: {
          created_at: string
          sent_on: string
          user_id: string
        }
        Insert: {
          created_at?: string
          sent_on: string
          user_id: string
        }
        Update: {
          created_at?: string
          sent_on?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      analytics_flow_duration_daily: {
        Row: {
          avg_duration_seconds: number | null
          day: string | null
          entry_point: string | null
          median_duration_seconds: number | null
          p90_duration_seconds: number | null
          saved_count: number | null
        }
        Relationships: []
      }
      analytics_pause_resume_daily: {
        Row: {
          day: string | null
          pause_reason: string | null
          paused_count: number | null
          resumed_count: number | null
        }
        Relationships: []
      }
      analytics_record_flow_sessions: {
        Row: {
          date_offset_days: number | null
          duration_seconds: number | null
          ended_at: string | null
          entry_point: string | null
          is_edit: boolean | null
          is_resume: boolean | null
          pause_reason: string | null
          paused: boolean | null
          record_id: string | null
          saved: boolean | null
          session_seq: number | null
          started_at: string | null
          step_view_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      analytics_step_funnel_daily: {
        Row: {
          day: string | null
          flow_started: number | null
          outcome_selected: number | null
          paused: number | null
          reached_form: number | null
          reached_reason: number | null
          reached_result: number | null
          saved: number | null
        }
        Relationships: []
      }
      client_errors_summary_7d: {
        Row: {
          app: string | null
          first_seen: string | null
          last_seen: string | null
          message: string | null
          occurrences: number | null
          source: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_empty_groups_and_invites: {
        Args: never
        Returns: {
          deleted_groups: number
          deleted_invites: number
        }[]
      }
      cleanup_old_logs: {
        Args: never
        Returns: {
          deleted_analytics_events: number
          deleted_client_errors: number
          deleted_reminder_deliveries: number
        }[]
      }
      create_group: {
        Args: never
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dearmor: { Args: { "": string }; Returns: string }
      gen_random_uuid: { Args: never; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      get_group_members: {
        Args: never
        Returns: {
          email: string
          joined_at: string
          user_id: string
        }[]
      }
      is_fellow_group_member: { Args: { p_group_id: string }; Returns: boolean }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      redeem_group_invite: { Args: { p_code: string }; Returns: string }
      uuid_generate_v1: { Args: never; Returns: string }
      uuid_generate_v1mc: { Args: never; Returns: string }
      uuid_generate_v3: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_generate_v4: { Args: never; Returns: string }
      uuid_generate_v5: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_nil: { Args: never; Returns: string }
      uuid_ns_dns: { Args: never; Returns: string }
      uuid_ns_oid: { Args: never; Returns: string }
      uuid_ns_url: { Args: never; Returns: string }
      uuid_ns_x500: { Args: never; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

