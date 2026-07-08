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
      admin_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          new_value: Json | null
          previous_value: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          previous_value?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          previous_value?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_broadcasts: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          level: string
          title: string
        }
        Insert: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          level?: string
          title: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          level?: string
          title?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      agent_pipeline_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          latest_report_id: string | null
          project_id: string
          prompt: string
          repair_actions_count: number
          status: string
          total_actions: number
          updated_at: string
          user_id: string
          verification_status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          latest_report_id?: string | null
          project_id: string
          prompt: string
          repair_actions_count?: number
          status?: string
          total_actions?: number
          updated_at?: string
          user_id: string
          verification_status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          latest_report_id?: string | null
          project_id?: string
          prompt?: string
          repair_actions_count?: number
          status?: string
          total_actions?: number
          updated_at?: string
          user_id?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_pipeline_runs_latest_report_id_fkey"
            columns: ["latest_report_id"]
            isOneToOne: false
            referencedRelation: "playtest_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pipeline_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          actions_count: number
          agent: string
          completed_at: string | null
          created_at: string
          id: string
          pipeline_id: string
          position: number
          started_at: string | null
          status: string
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actions_count?: number
          agent: string
          completed_at?: string | null
          created_at?: string
          id?: string
          pipeline_id: string
          position?: number
          started_at?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actions_count?: number
          agent?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          pipeline_id?: string
          position?: number
          started_at?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "agent_pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestions: {
        Row: {
          area: string
          auto_fixable: boolean
          created_at: string
          detail: string | null
          dismissed_at: string | null
          id: string
          project_id: string
          severity: string
          source: string
          suggested_prompt: string | null
          title: string
          user_id: string
        }
        Insert: {
          area?: string
          auto_fixable?: boolean
          created_at?: string
          detail?: string | null
          dismissed_at?: string | null
          id?: string
          project_id: string
          severity?: string
          source?: string
          suggested_prompt?: string | null
          title: string
          user_id: string
        }
        Update: {
          area?: string
          auto_fixable?: boolean
          created_at?: string
          detail?: string | null
          dismissed_at?: string | null
          id?: string
          project_id?: string
          severity?: string
          source?: string
          suggested_prompt?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
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
      build_milestones: {
        Row: {
          created_at: string
          gui_count: number
          id: string
          kind: string
          label: string
          parts_count: number
          place_id: string | null
          project_id: string
          scripts_count: number
          size_bytes: number
          snapshot_data: Json
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gui_count?: number
          id?: string
          kind?: string
          label?: string
          parts_count?: number
          place_id?: string | null
          project_id: string
          scripts_count?: number
          size_bytes?: number
          snapshot_data?: Json
          summary?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gui_count?: number
          id?: string
          kind?: string
          label?: string
          parts_count?: number
          place_id?: string | null
          project_id?: string
          scripts_count?: number
          size_bytes?: number
          snapshot_data?: Json
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      build_plans: {
        Row: {
          created_at: string
          est_credits: number
          est_seconds: number
          executed_at: string | null
          id: string
          model_used: string | null
          notes: string | null
          project_id: string
          prompt: string
          status: string
          steps: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          est_credits?: number
          est_seconds?: number
          executed_at?: string | null
          id?: string
          model_used?: string | null
          notes?: string | null
          project_id: string
          prompt: string
          status?: string
          steps?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          est_credits?: number
          est_seconds?: number
          executed_at?: string | null
          id?: string
          model_used?: string | null
          notes?: string | null
          project_id?: string
          prompt?: string
          status?: string
          steps?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      build_snapshots: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          project_id: string
          size_bytes: number
          user_id: string
          workspace_json: Json
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          project_id: string
          size_bytes?: number
          user_id: string
          workspace_json?: Json
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          project_id?: string
          size_bytes?: number
          user_id?: string
          workspace_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "build_snapshots_project_id_fkey"
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
      dev_session_tasks: {
        Row: {
          agent: string
          created_at: string
          finished_at: string | null
          id: string
          instruction: string
          notes: string | null
          position: number
          project_id: string
          session_id: string
          started_at: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          agent?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          instruction: string
          notes?: string | null
          position?: number
          project_id: string
          session_id: string
          started_at?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          agent?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          instruction?: string
          notes?: string | null
          position?: number
          project_id?: string
          session_id?: string
          started_at?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_session_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_session_tasks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dev_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_sessions: {
        Row: {
          auto_run: boolean
          created_at: string
          finished_at: string | null
          goal: string
          id: string
          project_id: string
          quality_target: string
          status: string
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_run?: boolean
          created_at?: string
          finished_at?: string | null
          goal: string
          id?: string
          project_id: string
          quality_target?: string
          status?: string
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_run?: boolean
          created_at?: string
          finished_at?: string | null
          goal?: string
          id?: string
          project_id?: string
          quality_target?: string
          status?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      execution_reports: {
        Row: {
          created_at: string
          duration_ms: number
          fail_count: number
          id: string
          ok_count: number
          plan: Json
          project_id: string | null
          repair_count: number
          retry_count: number
          skip_count: number
          source: string
          steps: Json
          summary: string | null
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          fail_count?: number
          id?: string
          ok_count?: number
          plan?: Json
          project_id?: string | null
          repair_count?: number
          retry_count?: number
          skip_count?: number
          source?: string
          steps?: Json
          summary?: string | null
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          fail_count?: number
          id?: string
          ok_count?: number
          plan?: Json
          project_id?: string | null
          repair_count?: number
          retry_count?: number
          skip_count?: number
          source?: string
          steps?: Json
          summary?: string | null
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      game_templates: {
        Row: {
          actions_json: Json
          category: string
          cover_url: string | null
          created_at: string
          description: string
          downloads: number
          id: string
          is_public: boolean
          prompt: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actions_json?: Json
          category?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          downloads?: number
          id?: string
          is_public?: boolean
          prompt?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actions_json?: Json
          category?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          downloads?: number
          id?: string
          is_public?: boolean
          prompt?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kb_chunks: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          source: string | null
          source_hash: string | null
          title: string
          topic: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          source?: string | null
          source_hash?: string | null
          title: string
          topic: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          source?: string | null
          source_hash?: string | null
          title?: string
          topic?: string
        }
        Relationships: []
      }
      kb_seed_progress: {
        Row: {
          current_index: number
          current_title: string | null
          failed: number
          inserted: number
          message: string | null
          status: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_index?: number
          current_title?: string | null
          failed?: number
          inserted?: number
          message?: string | null
          status?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_index?: number
          current_title?: string | null
          failed?: number
          inserted?: number
          message?: string | null
          status?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_servers: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_tested_at: string | null
          name: string
          status: string
          status_message: string | null
          token: string | null
          tools: Json
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_tested_at?: string | null
          name: string
          status?: string
          status_message?: string | null
          token?: string | null
          tools?: Json
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_tested_at?: string | null
          name?: string
          status?: string
          status_message?: string | null
          token?: string | null
          tools?: Json
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      model_generations: {
        Row: {
          animation_name: string | null
          art_style: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          image_url: string | null
          meta: Json
          mode: string
          model_url: string | null
          model_urls: Json | null
          parent_id: string | null
          progress: number
          project_id: string | null
          prompt: string | null
          status: string
          task_id: string | null
          texture_urls: Json | null
          thumbnail_url: string | null
          user_id: string
        }
        Insert: {
          animation_name?: string | null
          art_style?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          image_url?: string | null
          meta?: Json
          mode: string
          model_url?: string | null
          model_urls?: Json | null
          parent_id?: string | null
          progress?: number
          project_id?: string | null
          prompt?: string | null
          status?: string
          task_id?: string | null
          texture_urls?: Json | null
          thumbnail_url?: string | null
          user_id: string
        }
        Update: {
          animation_name?: string | null
          art_style?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          image_url?: string | null
          meta?: Json
          mode?: string
          model_url?: string | null
          model_urls?: Json | null
          parent_id?: string | null
          progress?: number
          project_id?: string | null
          prompt?: string | null
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
      playtest_loop_state: {
        Row: {
          attempt: number
          created_at: string
          directive: string
          last_fingerprint: string | null
          max_attempts: number
          reason: string | null
          run_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          directive?: string
          last_fingerprint?: string | null
          max_attempts?: number
          reason?: string | null
          run_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          directive?: string
          last_fingerprint?: string | null
          max_attempts?: number
          reason?: string | null
          run_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      playtest_reports: {
        Row: {
          attempt: number
          auto_triggered: boolean
          created_at: string
          duration_ms: number | null
          finding_fingerprint: string | null
          findings: Json
          id: string
          metrics: Json
          parent_run_id: string | null
          phase_results: Json
          place_id: string | null
          run_id: string | null
          screenshot_urls: string[]
          status: string
          summary: Json
          user_id: string
        }
        Insert: {
          attempt?: number
          auto_triggered?: boolean
          created_at?: string
          duration_ms?: number | null
          finding_fingerprint?: string | null
          findings: Json
          id?: string
          metrics: Json
          parent_run_id?: string | null
          phase_results?: Json
          place_id?: string | null
          run_id?: string | null
          screenshot_urls?: string[]
          status?: string
          summary: Json
          user_id: string
        }
        Update: {
          attempt?: number
          auto_triggered?: boolean
          created_at?: string
          duration_ms?: number | null
          finding_fingerprint?: string | null
          findings?: Json
          id?: string
          metrics?: Json
          parent_run_id?: string | null
          phase_results?: Json
          place_id?: string | null
          run_id?: string | null
          screenshot_urls?: string[]
          status?: string
          summary?: Json
          user_id?: string
        }
        Relationships: []
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
          referral_code: string | null
          roblox_avatar_url: string | null
          roblox_created_at: string | null
          roblox_display_name: string | null
          roblox_experiences: Json
          roblox_headshot_url: string | null
          roblox_last_synced_at: string | null
          roblox_public: boolean
          roblox_user_id: number | null
          roblox_username: string
          roblox_verified_at: string | null
          settings: Json
          updated_at: string
          username: string
          username_changed_at: string | null
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
          referral_code?: string | null
          roblox_avatar_url?: string | null
          roblox_created_at?: string | null
          roblox_display_name?: string | null
          roblox_experiences?: Json
          roblox_headshot_url?: string | null
          roblox_last_synced_at?: string | null
          roblox_public?: boolean
          roblox_user_id?: number | null
          roblox_username?: string
          roblox_verified_at?: string | null
          settings?: Json
          updated_at?: string
          username: string
          username_changed_at?: string | null
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
          referral_code?: string | null
          roblox_avatar_url?: string | null
          roblox_created_at?: string | null
          roblox_display_name?: string | null
          roblox_experiences?: Json
          roblox_headshot_url?: string | null
          roblox_last_synced_at?: string | null
          roblox_public?: boolean
          roblox_user_id?: number | null
          roblox_username?: string
          roblox_verified_at?: string | null
          settings?: Json
          updated_at?: string
          username?: string
          username_changed_at?: string | null
        }
        Relationships: []
      }
      project_activity: {
        Row: {
          created_at: string
          id: string
          kind: string
          meta: Json
          project_id: string
          summary: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          project_id: string
          summary: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          project_id?: string
          summary?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assets: {
        Row: {
          created_at: string
          data_url: string
          id: string
          kind: string
          meta: Json
          project_id: string
          prompt: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_url: string
          id?: string
          kind: string
          meta?: Json
          project_id: string
          prompt: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_url?: string
          id?: string
          kind?: string
          meta?: Json
          project_id?: string
          prompt?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_chat_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_collaborators: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          project_id: string
          role: Database["public"]["Enums"]["collab_role"]
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["collab_role"]
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["collab_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_comments: {
        Row: {
          anchor: string | null
          body: string
          created_at: string
          id: string
          project_id: string
          resolved: boolean
          user_id: string
        }
        Insert: {
          anchor?: string | null
          body: string
          created_at?: string
          id?: string
          project_id: string
          resolved?: boolean
          user_id: string
        }
        Update: {
          anchor?: string | null
          body?: string
          created_at?: string
          id?: string
          project_id?: string
          resolved?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_invites: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          invitee_user_id: string | null
          invitee_username: string
          project_id: string
          responded_at: string | null
          role: Database["public"]["Enums"]["collab_role"]
          status: Database["public"]["Enums"]["invite_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          invitee_user_id?: string | null
          invitee_username: string
          project_id: string
          responded_at?: string | null
          role?: Database["public"]["Enums"]["collab_role"]
          status?: Database["public"]["Enums"]["invite_status"]
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          invitee_user_id?: string | null
          invitee_username?: string
          project_id?: string
          responded_at?: string | null
          role?: Database["public"]["Enums"]["collab_role"]
          status?: Database["public"]["Enums"]["invite_status"]
        }
        Relationships: [
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memory: {
        Row: {
          created_at: string
          id: string
          importance: number
          key: string
          kind: string
          project_id: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          importance?: number
          key: string
          kind?: string
          project_id: string
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          importance?: number
          key?: string
          kind?: string
          project_id?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_qa_reports: {
        Row: {
          created_at: string
          id: string
          issues: Json
          model_used: string | null
          overall_score: number
          project_id: string
          recommendations: Json
          scores: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issues?: Json
          model_used?: string | null
          overall_score?: number
          project_id: string
          recommendations?: Json
          scores?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issues?: Json
          model_used?: string | null
          overall_score?: number
          project_id?: string
          recommendations?: Json
          scores?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_qa_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          build_count: number
          created_at: string
          default_build_mode: string
          default_execution_mode: string
          default_language: string | null
          default_model: string | null
          description: string
          game_type: string
          id: string
          is_favorite: boolean
          is_public: boolean
          last_model_used: string | null
          name: string
          pinned_at: string | null
          plugin_connected: boolean
          roblox_place_id: number | null
          roblox_universe_id: number | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          build_count?: number
          created_at?: string
          default_build_mode?: string
          default_execution_mode?: string
          default_language?: string | null
          default_model?: string | null
          description?: string
          game_type?: string
          id?: string
          is_favorite?: boolean
          is_public?: boolean
          last_model_used?: string | null
          name: string
          pinned_at?: string | null
          plugin_connected?: boolean
          roblox_place_id?: number | null
          roblox_universe_id?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          build_count?: number
          created_at?: string
          default_build_mode?: string
          default_execution_mode?: string
          default_language?: string | null
          default_model?: string | null
          description?: string
          game_type?: string
          id?: string
          is_favorite?: boolean
          is_public?: boolean
          last_model_used?: string | null
          name?: string
          pinned_at?: string | null
          plugin_connected?: boolean
          roblox_place_id?: number | null
          roblox_universe_id?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          count: number
          id: string
          ip_hash: string | null
          updated_at: string
          user_id: string | null
          window_start: string
        }
        Insert: {
          action: string
          count?: number
          id?: string
          ip_hash?: string | null
          updated_at?: string
          user_id?: string | null
          window_start?: string
        }
        Update: {
          action?: string
          count?: number
          id?: string
          ip_hash?: string | null
          updated_at?: string
          user_id?: string | null
          window_start?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          referred_user_id: string
          referrer_user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          referred_user_id: string
          referrer_user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          referred_user_id?: string
          referrer_user_id?: string
        }
        Relationships: []
      }
      showcase_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "showcase_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "showcase_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      showcase_posts: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string
          id: string
          is_published: boolean
          likes: number
          project_id: string | null
          roblox_place_id: number | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          views: number
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          likes?: number
          project_id?: string | null
          roblox_place_id?: number | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
          views?: number
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          likes?: number
          project_id?: string | null
          roblox_place_id?: number | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "showcase_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      ui_generations: {
        Row: {
          code: string
          concept_image_url: string | null
          created_at: string
          id: string
          metadata: Json
          model: string | null
          project_id: string | null
          prompt: string
          style: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string
          concept_image_url?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          project_id?: string | null
          prompt: string
          style?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          concept_image_url?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          project_id?: string | null
          prompt?: string
          style?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ui_generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_key: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_key: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_key?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
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
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          is_private: boolean | null
          plan: string | null
          roblox_avatar_url: string | null
          roblox_created_at: string | null
          roblox_display_name: string | null
          roblox_experiences: Json | null
          roblox_headshot_url: string | null
          roblox_last_synced_at: string | null
          roblox_public: boolean | null
          roblox_username: string | null
          roblox_verified_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_private?: boolean | null
          plan?: string | null
          roblox_avatar_url?: string | null
          roblox_created_at?: string | null
          roblox_display_name?: string | null
          roblox_experiences?: Json | null
          roblox_headshot_url?: string | null
          roblox_last_synced_at?: string | null
          roblox_public?: boolean | null
          roblox_username?: string | null
          roblox_verified_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_private?: boolean | null
          plan?: string | null
          roblox_avatar_url?: string | null
          roblox_created_at?: string | null
          roblox_display_name?: string | null
          roblox_experiences?: Json | null
          roblox_headshot_url?: string | null
          roblox_last_synced_at?: string | null
          roblox_public?: boolean | null
          roblox_username?: string | null
          roblox_verified_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          is_private: boolean | null
          language: string | null
          plan: string | null
          roblox_username: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_private?: boolean | null
          language?: string | null
          plan?: string | null
          roblox_username?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_private?: boolean | null
          language?: string | null
          plan?: string | null
          roblox_username?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_project_invite: { Args: { _invite_id: string }; Returns: string }
      award_badge: { Args: { _badge_key: string }; Returns: boolean }
      can_access_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      current_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      get_my_plugin_token: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_owner: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      match_kb_chunks: {
        Args: {
          match_count?: number
          match_topic: string
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          source: string
          title: string
          topic: string
        }[]
      }
      regenerate_my_plugin_token: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "owner" | "user" | "donator" | "moderator"
      collab_role: "editor" | "viewer"
      invite_status: "pending" | "accepted" | "declined" | "canceled"
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
      collab_role: ["editor", "viewer"],
      invite_status: ["pending", "accepted", "declined", "canceled"],
    },
  },
} as const
