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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      build_history: {
        Row: {
          applied: boolean
          created_at: string
          credits_used: number
          errors_count: number
          files_count: number
          id: string
          model: string | null
          plugin_status: string
          project_id: string
          prompt: string
          user_id: string
        }
        Insert: {
          applied?: boolean
          created_at?: string
          credits_used?: number
          errors_count?: number
          files_count?: number
          id?: string
          model?: string | null
          plugin_status?: string
          project_id: string
          prompt: string
          user_id: string
        }
        Update: {
          applied?: boolean
          created_at?: string
          credits_used?: number
          errors_count?: number
          files_count?: number
          id?: string
          model?: string | null
          plugin_status?: string
          project_id?: string
          prompt?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          actions: Json
          content: string
          created_at: string
          error: string | null
          id: string
          image_url: string | null
          model: string | null
          project_id: string
          role: string
          status: string
          tokens_used: number
          user_id: string
        }
        Insert: {
          actions?: Json
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          project_id: string
          role: string
          status?: string
          tokens_used?: number
          user_id: string
        }
        Update: {
          actions?: Json
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          project_id?: string
          role?: string
          status?: string
          tokens_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_usage: {
        Row: {
          builds_used: number
          credits_used: number
          id: string
          messages_used: number
          plugin_sends_used: number
          scans_used: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          builds_used?: number
          credits_used?: number
          id?: string
          messages_used?: number
          plugin_sends_used?: number
          scans_used?: number
          updated_at?: string
          usage_date?: string
          user_id: string
        }
        Update: {
          builds_used?: number
          credits_used?: number
          id?: string
          messages_used?: number
          plugin_sends_used?: number
          scans_used?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      donation_claims: {
        Row: {
          admin_note: string | null
          amount_note: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          paypal_reference: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_note?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          paypal_reference: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_note?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          paypal_reference?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      model_generations: {
        Row: {
          animation_name: string | null
          art_style: string | null
          bridge_metadata: Json | null
          bridge_status: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          image_url: string | null
          mode: string
          model_url: string | null
          model_urls: Json | null
          parent_id: string | null
          progress: number
          project_id: string | null
          prompt: string | null
          roblox_asset_id: string | null
          roblox_operation_path: string | null
          roblox_upload_error: string | null
          roblox_upload_status: string | null
          source: string | null
          source_format: string | null
          status: string
          task_id: string | null
          texture_urls: Json | null
          thumbnail_url: string | null
          user_id: string
        }
        Insert: {
          animation_name?: string | null
          art_style?: string | null
          bridge_metadata?: Json | null
          bridge_status?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          image_url?: string | null
          mode: string
          model_url?: string | null
          model_urls?: Json | null
          parent_id?: string | null
          progress?: number
          project_id?: string | null
          prompt?: string | null
          roblox_asset_id?: string | null
          roblox_operation_path?: string | null
          roblox_upload_error?: string | null
          roblox_upload_status?: string | null
          source?: string | null
          source_format?: string | null
          status?: string
          task_id?: string | null
          texture_urls?: Json | null
          thumbnail_url?: string | null
          user_id: string
        }
        Update: {
          animation_name?: string | null
          art_style?: string | null
          bridge_metadata?: Json | null
          bridge_status?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          image_url?: string | null
          mode?: string
          model_url?: string | null
          model_urls?: Json | null
          parent_id?: string | null
          progress?: number
          project_id?: string | null
          prompt?: string | null
          roblox_asset_id?: string | null
          roblox_operation_path?: string | null
          roblox_upload_error?: string | null
          roblox_upload_status?: string | null
          source?: string | null
          source_format?: string | null
          status?: string
          task_id?: string | null
          texture_urls?: Json | null
          thumbnail_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_generations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "model_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_actions: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          message_id: string | null
          name: string
          parent_path: string
          payload: Json
          position: number
          project_id: string
          result: Json | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          message_id?: string | null
          name?: string
          parent_path?: string
          payload?: Json
          position?: number
          project_id: string
          result?: Json | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          message_id?: string | null
          name?: string
          parent_path?: string
          payload?: Json
          position?: number
          project_id?: string
          result?: Json | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plugin_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plugin_actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_pair_codes: {
        Row: {
          claimed_at: string | null
          code: string
          created_at: string
          expires_at: string
          picked_up_at: string | null
          plugin_token: string | null
          project_id: string | null
          user_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          code: string
          created_at?: string
          expires_at?: string
          picked_up_at?: string | null
          plugin_token?: string | null
          project_id?: string | null
          user_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          picked_up_at?: string | null
          plugin_token?: string | null
          project_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      plugin_sessions: {
        Row: {
          created_at: string
          id: string
          last_scan: Json | null
          last_scan_at: string | null
          last_seen: string
          online: boolean
          place_id: string | null
          plugin_version: string | null
          project_id: string | null
          studio_version: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_scan?: Json | null
          last_scan_at?: string | null
          last_seen?: string
          online?: boolean
          place_id?: string | null
          plugin_version?: string | null
          project_id?: string | null
          studio_version?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_scan?: Json | null
          last_scan_at?: string | null
          last_seen?: string
          online?: boolean
          place_id?: string | null
          plugin_version?: string | null
          project_id?: string | null
          studio_version?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plugin_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banned: boolean
          banned_at: string | null
          banned_reason: string | null
          bio: string
          created_at: string
          credits: number
          credits_reset_at: string
          display_name: string | null
          id: string
          is_admin: boolean
          is_private: boolean
          language: string
          max_credits: number
          plan: string
          plugin_token: string
          roblox_username: string
          settings: Json
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          banned?: boolean
          banned_at?: string | null
          banned_reason?: string | null
          bio?: string
          created_at?: string
          credits?: number
          credits_reset_at?: string
          display_name?: string | null
          id: string
          is_admin?: boolean
          is_private?: boolean
          language?: string
          max_credits?: number
          plan?: string
          plugin_token?: string
          roblox_username?: string
          settings?: Json
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          banned?: boolean
          banned_at?: string | null
          banned_reason?: string | null
          bio?: string
          created_at?: string
          credits?: number
          credits_reset_at?: string
          display_name?: string | null
          id?: string
          is_admin?: boolean
          is_private?: boolean
          language?: string
          max_credits?: number
          plan?: string
          plugin_token?: string
          roblox_username?: string
          settings?: Json
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          build_count: number
          created_at: string
          description: string
          game_type: string
          id: string
          last_model_used: string | null
          name: string
          plugin_connected: boolean
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          build_count?: number
          created_at?: string
          description?: string
          game_type?: string
          id?: string
          last_model_used?: string | null
          name: string
          plugin_connected?: boolean
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          build_count?: number
          created_at?: string
          description?: string
          game_type?: string
          id?: string
          last_model_used?: string | null
          name?: string
          plugin_connected?: boolean
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      studio_errors: {
        Row: {
          action_id: string | null
          created_at: string
          id: string
          level: string
          message: string
          project_id: string | null
          source: string
          stack: string | null
          user_id: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          id?: string
          level?: string
          message: string
          project_id?: string | null
          source?: string
          stack?: string | null
          user_id: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          project_id?: string | null
          source?: string
          stack?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_errors_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "plugin_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_errors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          display_name: string | null
          id: string | null
          roblox_username: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          display_name?: string | null
          id?: string | null
          roblox_username?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          display_name?: string | null
          id?: string | null
          roblox_username?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_plugin_token: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      regenerate_my_plugin_token: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "owner" | "user" | "donator" | "moderator"
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
    Enums: {
      app_role: ["admin", "owner", "user", "donator", "moderator"],
    },
  },
} as const
