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
      oya_families: {
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
      oya_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          display_name: string
          expires_at: string
          family_id: string
          id: string
          role: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          display_name: string
          expires_at?: string
          family_id: string
          id?: string
          role: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          expires_at?: string
          family_id?: string
          id?: string
          role?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oya_invites_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "oya_families"
            referencedColumns: ["id"]
          },
        ]
      }
      oya_members: {
        Row: {
          display_name: string
          family_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          display_name: string
          family_id: string
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          display_name?: string
          family_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oya_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "oya_families"
            referencedColumns: ["id"]
          },
        ]
      }
      oya_photo_reveals: {
        Row: {
          photo_id: string | null
          record_date: string
          revealed_at: string
          user_id: string
        }
        Insert: {
          photo_id?: string | null
          record_date: string
          revealed_at?: string
          user_id: string
        }
        Update: {
          photo_id?: string | null
          record_date?: string
          revealed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oya_photo_reveals_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "oya_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      oya_photos: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          storage_path: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          storage_path: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "oya_photos_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "oya_families"
            referencedColumns: ["id"]
          },
        ]
      }
      oya_records: {
        Row: {
          breakfast: string | null
          completed_at: string | null
          condition: string | null
          created_at: string
          dinner: string | null
          family_id: string
          hospital: boolean | null
          id: string
          lunch: string | null
          medication: string | null
          memo: string | null
          record_date: string
          shopping: boolean | null
          updated_at: string
          user_id: string
          went_out: boolean | null
        }
        Insert: {
          breakfast?: string | null
          completed_at?: string | null
          condition?: string | null
          created_at?: string
          dinner?: string | null
          family_id: string
          hospital?: boolean | null
          id?: string
          lunch?: string | null
          medication?: string | null
          memo?: string | null
          record_date: string
          shopping?: boolean | null
          updated_at?: string
          user_id?: string
          went_out?: boolean | null
        }
        Update: {
          breakfast?: string | null
          completed_at?: string | null
          condition?: string | null
          created_at?: string
          dinner?: string | null
          family_id?: string
          hospital?: boolean | null
          id?: string
          lunch?: string | null
          medication?: string | null
          memo?: string | null
          record_date?: string
          shopping?: boolean | null
          updated_at?: string
          user_id?: string
          went_out?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "oya_records_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "oya_families"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_oya_record: {
        Args: { p_record_date: string }
        Returns: {
          completed_at: string
          photo_id: string
          storage_path: string
        }[]
      }
      create_oya_family: {
        Args: { p_display_name: string; p_name?: string }
        Returns: string
      }
      create_oya_invite: {
        Args: { p_display_name: string; p_role: string }
        Returns: string
      }
      oya_assert_admin_remains: {
        Args: { p_changing_user: string; p_family_id: string }
        Returns: undefined
      }
      oya_my_family: { Args: never; Returns: string }
      oya_my_role: { Args: never; Returns: string }
      oya_today_jst: { Args: never; Returns: string }
      redeem_oya_invite: { Args: { p_code: string }; Returns: string }
      remove_oya_member: { Args: { p_user_id: string }; Returns: undefined }
      set_oya_member_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
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

