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
      admin_action_attempts: {
        Row: {
          action: string
          attempts: number
          locked_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          attempts?: number
          locked_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          attempts?: number
          locked_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_addon_pricing: {
        Row: {
          addon_slug: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          included_messages: number
          is_active: boolean
          monthly_price: number
          overage_price_per_message: number
          updated_at: string
        }
        Insert: {
          addon_slug: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          included_messages?: number
          is_active?: boolean
          monthly_price?: number
          overage_price_per_message?: number
          updated_at?: string
        }
        Update: {
          addon_slug?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          included_messages?: number
          is_active?: boolean
          monthly_price?: number
          overage_price_per_message?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_agent_history: {
        Row: {
          agent_id: string
          change_summary: string | null
          changed_by: string | null
          changed_by_name: string | null
          company_id: string
          created_at: string
          id: string
          pipeline_id: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          agent_id: string
          change_summary?: string | null
          changed_by?: string | null
          changed_by_name?: string | null
          company_id: string
          created_at?: string
          id?: string
          pipeline_id?: string | null
          snapshot: Json
          version: number
        }
        Update: {
          agent_id?: string
          change_summary?: string | null
          changed_by?: string | null
          changed_by_name?: string | null
          company_id?: string
          created_at?: string
          id?: string
          pipeline_id?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: []
      }
      ai_agent_limits: {
        Row: {
          allow_single_agent_fallback: boolean
          block_message_to_client: string
          block_when_exceeded: boolean
          blocked_at: string | null
          blocked_reason: string | null
          blocked_until: string | null
          company_id: string
          created_at: string
          currently_blocked: boolean
          daily_message_cap: number
          last_block_notified_at: string | null
          monthly_cost_cap_brl: number
          monthly_message_cap: number
          monthly_token_cap: number
          notify_admins_on_block: boolean
          send_block_message: boolean
          updated_at: string
        }
        Insert: {
          allow_single_agent_fallback?: boolean
          block_message_to_client?: string
          block_when_exceeded?: boolean
          blocked_at?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          company_id: string
          created_at?: string
          currently_blocked?: boolean
          daily_message_cap?: number
          last_block_notified_at?: string | null
          monthly_cost_cap_brl?: number
          monthly_message_cap?: number
          monthly_token_cap?: number
          notify_admins_on_block?: boolean
          send_block_message?: boolean
          updated_at?: string
        }
        Update: {
          allow_single_agent_fallback?: boolean
          block_message_to_client?: string
          block_when_exceeded?: boolean
          blocked_at?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          company_id?: string
          created_at?: string
          currently_blocked?: boolean
          daily_message_cap?: number
          last_block_notified_at?: string | null
          monthly_cost_cap_brl?: number
          monthly_message_cap?: number
          monthly_token_cap?: number
          notify_admins_on_block?: boolean
          send_block_message?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      ai_agent_runs: {
        Row: {
          agent_id: string | null
          company_id: string
          conversation_id: string
          cost_brl: number
          created_at: string
          error: string | null
          had_audio: boolean
          id: string
          input_summary: string | null
          kb_citations: Json
          latency_ms: number | null
          messages_consumed: number
          model: string | null
          output_text: string | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
          tools_called: Json | null
          trigger_message_id: string | null
        }
        Insert: {
          agent_id?: string | null
          company_id: string
          conversation_id: string
          cost_brl?: number
          created_at?: string
          error?: string | null
          had_audio?: boolean
          id?: string
          input_summary?: string | null
          kb_citations?: Json
          latency_ms?: number | null
          messages_consumed?: number
          model?: string | null
          output_text?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tools_called?: Json | null
          trigger_message_id?: string | null
        }
        Update: {
          agent_id?: string | null
          company_id?: string
          conversation_id?: string
          cost_brl?: number
          created_at?: string
          error?: string | null
          had_audio?: boolean
          id?: string
          input_summary?: string | null
          kb_citations?: Json
          latency_ms?: number | null
          messages_consumed?: number
          model?: string | null
          output_text?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tools_called?: Json | null
          trigger_message_id?: string | null
        }
        Relationships: []
      }
      ai_agents: {
        Row: {
          auto_confirmation: boolean
          available_hours: Json
          business_hours_only: boolean
          collect_fields: Json
          company_id: string
          created_at: string
          debounce_seconds: number
          detect_negative_sentiment: boolean
          emoji: string | null
          handoff_keywords: string[]
          id: string
          instance_id: string | null
          is_active: boolean
          kb_document_ids: string[] | null
          max_turns: number
          model: string
          name: string
          offer_scheduling: boolean
          offer_timing: string
          paused_until: string | null
          persona: string
          pipeline_id: string | null
          qualification_criteria: Json
          qualification_questions: Json
          reminder_enabled: boolean
          response_delay_ms: number
          send_discount_coupon: boolean
          system_prompt: string
          tone: string
          transfer_stage_id: string | null
          updated_at: string
        }
        Insert: {
          auto_confirmation?: boolean
          available_hours?: Json
          business_hours_only?: boolean
          collect_fields?: Json
          company_id: string
          created_at?: string
          debounce_seconds?: number
          detect_negative_sentiment?: boolean
          emoji?: string | null
          handoff_keywords?: string[]
          id?: string
          instance_id?: string | null
          is_active?: boolean
          kb_document_ids?: string[] | null
          max_turns?: number
          model?: string
          name?: string
          offer_scheduling?: boolean
          offer_timing?: string
          paused_until?: string | null
          persona?: string
          pipeline_id?: string | null
          qualification_criteria?: Json
          qualification_questions?: Json
          reminder_enabled?: boolean
          response_delay_ms?: number
          send_discount_coupon?: boolean
          system_prompt?: string
          tone?: string
          transfer_stage_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_confirmation?: boolean
          available_hours?: Json
          business_hours_only?: boolean
          collect_fields?: Json
          company_id?: string
          created_at?: string
          debounce_seconds?: number
          detect_negative_sentiment?: boolean
          emoji?: string | null
          handoff_keywords?: string[]
          id?: string
          instance_id?: string | null
          is_active?: boolean
          kb_document_ids?: string[] | null
          max_turns?: number
          model?: string
          name?: string
          offer_scheduling?: boolean
          offer_timing?: string
          paused_until?: string | null
          persona?: string
          pipeline_id?: string | null
          qualification_criteria?: Json
          qualification_questions?: Json
          reminder_enabled?: boolean
          response_delay_ms?: number
          send_discount_coupon?: boolean
          system_prompt?: string
          tone?: string
          transfer_stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_config_rate_limit: {
        Row: {
          last_test_at: string
          provider: string
          user_id: string
        }
        Insert: {
          last_test_at?: string
          provider: string
          user_id: string
        }
        Update: {
          last_test_at?: string
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_global_config: {
        Row: {
          active_model: string
          active_provider: string
          anthropic_model: string
          anthropic_test_error: string | null
          anthropic_test_ok: boolean | null
          anthropic_tested_at: string | null
          consecutive_failures: number
          google_model: string
          google_test_error: string | null
          google_test_ok: boolean | null
          google_tested_at: string | null
          id: boolean
          model_active_at: string
          openai_model: string
          openai_test_error: string | null
          openai_test_ok: boolean | null
          openai_tested_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_model?: string
          active_provider?: string
          anthropic_model?: string
          anthropic_test_error?: string | null
          anthropic_test_ok?: boolean | null
          anthropic_tested_at?: string | null
          consecutive_failures?: number
          google_model?: string
          google_test_error?: string | null
          google_test_ok?: boolean | null
          google_tested_at?: string | null
          id?: boolean
          model_active_at?: string
          openai_model?: string
          openai_test_error?: string | null
          openai_test_ok?: boolean | null
          openai_tested_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_model?: string
          active_provider?: string
          anthropic_model?: string
          anthropic_test_error?: string | null
          anthropic_test_ok?: boolean | null
          anthropic_tested_at?: string | null
          consecutive_failures?: number
          google_model?: string
          google_test_error?: string | null
          google_test_ok?: boolean | null
          google_tested_at?: string | null
          id?: boolean
          model_active_at?: string
          openai_model?: string
          openai_test_error?: string | null
          openai_test_ok?: boolean | null
          openai_tested_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_knowledge_chunks: {
        Row: {
          agent_id: string
          chunk_index: number
          company_id: string
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
        }
        Insert: {
          agent_id: string
          chunk_index: number
          company_id: string
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
        }
        Update: {
          agent_id?: string
          chunk_index?: number
          company_id?: string
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_documents: {
        Row: {
          agent_id: string
          chunks_count: number
          company_id: string
          created_at: string
          error: string | null
          file_name: string
          id: string
          mime_type: string | null
          processed_at: string | null
          size_bytes: number | null
          status: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          agent_id: string
          chunks_count?: number
          company_id: string
          created_at?: string
          error?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          processed_at?: string | null
          size_bytes?: number | null
          status?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          agent_id?: string
          chunks_count?: number
          company_id?: string
          created_at?: string
          error?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          processed_at?: string | null
          size_bytes?: number | null
          status?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      app_notifications: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          link: string | null
          message: string | null
          metadata: Json | null
          read_at: string | null
          severity: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      appointment_audit: {
        Row: {
          appointment_id: string
          changed_by: string | null
          company_id: string
          created_at: string
          current: Json | null
          event_type: string
          id: string
          notes: string | null
          previous: Json | null
        }
        Insert: {
          appointment_id: string
          changed_by?: string | null
          company_id: string
          created_at?: string
          current?: Json | null
          event_type: string
          id?: string
          notes?: string | null
          previous?: Json | null
        }
        Update: {
          appointment_id?: string
          changed_by?: string | null
          company_id?: string
          created_at?: string
          current?: Json | null
          event_type?: string
          id?: string
          notes?: string | null
          previous?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_audit_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_professionals: {
        Row: {
          avatar_url: string | null
          bio: string | null
          buffer_minutes: number
          color: string
          company_id: string
          council_type: string | null
          created_at: string
          crm: string | null
          email: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          linked_user_id: string | null
          medical_doctor_id: string | null
          name: string
          phone: string | null
          specialty: string | null
          updated_at: string
          work_days: number[]
          work_end_time: string
          work_start_time: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          buffer_minutes?: number
          color?: string
          company_id: string
          council_type?: string | null
          created_at?: string
          crm?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          linked_user_id?: string | null
          medical_doctor_id?: string | null
          name: string
          phone?: string | null
          specialty?: string | null
          updated_at?: string
          work_days?: number[]
          work_end_time?: string
          work_start_time?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          buffer_minutes?: number
          color?: string
          company_id?: string
          council_type?: string | null
          created_at?: string
          crm?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          linked_user_id?: string | null
          medical_doctor_id?: string | null
          name?: string
          phone?: string | null
          specialty?: string | null
          updated_at?: string
          work_days?: number[]
          work_end_time?: string
          work_start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_professionals_medical_doctor_id_fkey"
            columns: ["medical_doctor_id"]
            isOneToOne: false
            referencedRelation: "medical_doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reasons: {
        Row: {
          automation_enabled: boolean
          automation_rules: Json
          client_reminders: Json
          color: string
          company_id: string
          created_at: string
          default_duration_minutes: number
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          updated_at: string
        }
        Insert: {
          automation_enabled?: boolean
          automation_rules?: Json
          client_reminders?: Json
          color?: string
          company_id: string
          created_at?: string
          default_duration_minutes?: number
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          automation_enabled?: boolean
          automation_rules?: Json
          client_reminders?: Json
          color?: string
          company_id?: string
          created_at?: string
          default_duration_minutes?: number
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      appointment_reminders: {
        Row: {
          appointment_id: string
          attempts: number
          channel: string
          company_id: string
          created_at: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["appointment_reminder_kind"]
          payload: Json
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["appointment_reminder_status"]
          updated_at: string
        }
        Insert: {
          appointment_id: string
          attempts?: number
          channel: string
          company_id: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["appointment_reminder_kind"]
          payload?: Json
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["appointment_reminder_status"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          attempts?: number
          channel?: string
          company_id?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["appointment_reminder_kind"]
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["appointment_reminder_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          agenda_checklist: Json
          cancel_reason: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          end_at: string
          id: string
          is_demo: boolean
          lead_id: string | null
          location: string | null
          meeting_url: string | null
          notes: string | null
          professional_id: string
          reason_id: string | null
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          timezone: string
          title: string | null
          updated_at: string
        }
        Insert: {
          agenda_checklist?: Json
          cancel_reason?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          end_at: string
          id?: string
          is_demo?: boolean
          lead_id?: string | null
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          professional_id: string
          reason_id?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          agenda_checklist?: Json
          cancel_reason?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string
          id?: string
          is_demo?: boolean
          lead_id?: string | null
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          professional_id?: string
          reason_id?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "appointment_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "appointment_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      archived_logs: {
        Row: {
          archived_at: string
          company_id: string | null
          id: string
          original_created_at: string
          payload: Json
          source_id: string | null
          source_table: string
        }
        Insert: {
          archived_at?: string
          company_id?: string | null
          id?: string
          original_created_at: string
          payload: Json
          source_id?: string | null
          source_table: string
        }
        Update: {
          archived_at?: string
          company_id?: string | null
          id?: string
          original_created_at?: string
          payload?: Json
          source_id?: string | null
          source_table?: string
        }
        Relationships: []
      }
      asaas_logs: {
        Row: {
          action: string | null
          asaas_payment_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          environment: string | null
          error_message: string | null
          event: string | null
          http_status: number | null
          id: string
          ok: boolean
          request_payload: Json | null
          response_payload: Json | null
          retry_of: string | null
        }
        Insert: {
          action?: string | null
          asaas_payment_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          environment?: string | null
          error_message?: string | null
          event?: string | null
          http_status?: number | null
          id?: string
          ok?: boolean
          request_payload?: Json | null
          response_payload?: Json | null
          retry_of?: string | null
        }
        Update: {
          action?: string | null
          asaas_payment_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          environment?: string | null
          error_message?: string | null
          event?: string | null
          http_status?: number | null
          id?: string
          ok?: boolean
          request_payload?: Json | null
          response_payload?: Json | null
          retry_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asaas_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asaas_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "asaas_logs_retry_of_fkey"
            columns: ["retry_of"]
            isOneToOne: false
            referencedRelation: "asaas_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_auto_message_queue: {
        Row: {
          attempts: number
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          last_error: string | null
          message_kind: string
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_kind: string
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_kind?: string
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      attendance_auto_messages: {
        Row: {
          body: string | null
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          message_kind: string
          sent_at: string
        }
        Insert: {
          body?: string | null
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          message_kind: string
          sent_at?: string
        }
        Update: {
          body?: string | null
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          message_kind?: string
          sent_at?: string
        }
        Relationships: []
      }
      attendance_auto_send_attempts: {
        Row: {
          body_preview: string | null
          company_id: string
          conversation_id: string | null
          created_at: string
          error_message: string | null
          evolution_response: Json | null
          feature_enabled_now: boolean | null
          http_status: number | null
          id: string
          instance_name: string | null
          is_phantom: boolean
          message_kind: string
          metadata: Json | null
          off_hours_enabled: boolean | null
          origin: string
          phase: string
          queue_id: string | null
          skip_reason: string | null
          wait_time_enabled: boolean | null
          welcome_enabled: boolean | null
        }
        Insert: {
          body_preview?: string | null
          company_id: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          evolution_response?: Json | null
          feature_enabled_now?: boolean | null
          http_status?: number | null
          id?: string
          instance_name?: string | null
          is_phantom?: boolean
          message_kind: string
          metadata?: Json | null
          off_hours_enabled?: boolean | null
          origin: string
          phase: string
          queue_id?: string | null
          skip_reason?: string | null
          wait_time_enabled?: boolean | null
          welcome_enabled?: boolean | null
        }
        Update: {
          body_preview?: string | null
          company_id?: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          evolution_response?: Json | null
          feature_enabled_now?: boolean | null
          http_status?: number | null
          id?: string
          instance_name?: string | null
          is_phantom?: boolean
          message_kind?: string
          metadata?: Json | null
          off_hours_enabled?: boolean | null
          origin?: string
          phase?: string
          queue_id?: string | null
          skip_reason?: string | null
          wait_time_enabled?: boolean | null
          welcome_enabled?: boolean | null
        }
        Relationships: []
      }
      attendance_settings: {
        Row: {
          business_hours: Json
          closing: Json
          company_id: string
          created_at: string
          general: Json
          holidays: Json
          id: string
          quick_replies: Json
          rating: Json
          signature: Json
          tickets: Json
          updated_at: string
        }
        Insert: {
          business_hours?: Json
          closing?: Json
          company_id: string
          created_at?: string
          general?: Json
          holidays?: Json
          id?: string
          quick_replies?: Json
          rating?: Json
          signature?: Json
          tickets?: Json
          updated_at?: string
        }
        Update: {
          business_hours?: Json
          closing?: Json
          company_id?: string
          created_at?: string
          general?: Json
          holidays?: Json
          id?: string
          quick_replies?: Json
          rating?: Json
          signature?: Json
          tickets?: Json
          updated_at?: string
        }
        Relationships: []
      }
      attendance_ticket_assignments: {
        Row: {
          company_id: string
          created_at: string
          from_user_id: string | null
          id: string
          mode: string
          reason: string | null
          ticket_id: string
          to_user_id: string | null
          transferred_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          mode?: string
          reason?: string | null
          ticket_id: string
          to_user_id?: string | null
          transferred_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          mode?: string
          reason?: string | null
          ticket_id?: string
          to_user_id?: string | null
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_ticket_assignments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "attendance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_ticket_events: {
        Row: {
          actor_name: string | null
          actor_user_id: string | null
          company_id: string
          conversation_id: string | null
          created_at: string
          event_type: string
          id: string
          notes: string | null
          reason: string | null
          ticket_id: string | null
        }
        Insert: {
          actor_name?: string | null
          actor_user_id?: string | null
          company_id: string
          conversation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          notes?: string | null
          reason?: string | null
          ticket_id?: string | null
        }
        Update: {
          actor_name?: string | null
          actor_user_id?: string | null
          company_id?: string
          conversation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          notes?: string | null
          reason?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "attendance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_ticket_ratings: {
        Row: {
          comment: string | null
          company_id: string
          created_at: string
          id: string
          raw_response: string | null
          requested_at: string
          responded_at: string | null
          response_window_hours: number
          scale: string
          score: number | null
          status: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          company_id: string
          created_at?: string
          id?: string
          raw_response?: string | null
          requested_at?: string
          responded_at?: string | null
          response_window_hours?: number
          scale?: string
          score?: number | null
          status?: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          company_id?: string
          created_at?: string
          id?: string
          raw_response?: string | null
          requested_at?: string
          responded_at?: string | null
          response_window_hours?: number
          scale?: string
          score?: number | null
          status?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_ticket_ratings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "attendance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_tickets: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          category: string | null
          channel: string
          close_notes: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          contact_name: string | null
          contact_phone: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          lead_id: string | null
          priority: string
          priority_color: string | null
          rating_deadline: string | null
          reopened_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_number: number
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          category?: string | null
          channel?: string
          close_notes?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          contact_name?: string | null
          contact_phone?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          priority?: string
          priority_color?: string | null
          rating_deadline?: string | null
          reopened_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_number: number
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          category?: string | null
          channel?: string
          close_notes?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          priority?: string
          priority_color?: string | null
          rating_deadline?: string | null
          reopened_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_code?: string
          ticket_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      chat_message_side_effects_queue: {
        Row: {
          chat_message_id: string
          company_id: string
          conversation_id: string
          created_at: string
          effect_type: string
          error: string | null
          id: string
          max_attempts: number
          next_attempt_at: string
          picked_at: string | null
          processed_at: string | null
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          chat_message_id: string
          company_id: string
          conversation_id: string
          created_at?: string
          effect_type: string
          error?: string | null
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          picked_at?: string | null
          processed_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          chat_message_id?: string
          company_id?: string
          conversation_id?: string
          created_at?: string
          effect_type?: string
          error?: string | null
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          picked_at?: string | null
          processed_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_side_effects_queue_chat_message_id_fkey"
            columns: ["chat_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          client_id: string | null
          company_id: string
          content: string | null
          conversation_id: string
          created_at: string
          duration: number | null
          edited_at: string | null
          file_name: string | null
          from_me: boolean
          id: string
          interactive_payload: Json | null
          is_demo: boolean
          latitude: number | null
          link_preview: Json | null
          longitude: number | null
          media_mimetype: string | null
          media_storage_path: string | null
          media_url: string | null
          message_id: string
          message_type: string
          provider: string
          provider_message_id: string | null
          provider_raw_payload: Json | null
          quoted_message_id: string | null
          raw_data: Json | null
          reaction_emoji: string | null
          remote_jid: string
          sender_name: string | null
          seq: number
          status: string
          sync_error: string | null
          timestamp: string
          webhook_received_at: string | null
        }
        Insert: {
          client_id?: string | null
          company_id: string
          content?: string | null
          conversation_id: string
          created_at?: string
          duration?: number | null
          edited_at?: string | null
          file_name?: string | null
          from_me?: boolean
          id?: string
          interactive_payload?: Json | null
          is_demo?: boolean
          latitude?: number | null
          link_preview?: Json | null
          longitude?: number | null
          media_mimetype?: string | null
          media_storage_path?: string | null
          media_url?: string | null
          message_id: string
          message_type?: string
          provider?: string
          provider_message_id?: string | null
          provider_raw_payload?: Json | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          reaction_emoji?: string | null
          remote_jid: string
          sender_name?: string | null
          seq?: number
          status?: string
          sync_error?: string | null
          timestamp: string
          webhook_received_at?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          duration?: number | null
          edited_at?: string | null
          file_name?: string | null
          from_me?: boolean
          id?: string
          interactive_payload?: Json | null
          is_demo?: boolean
          latitude?: number | null
          link_preview?: Json | null
          longitude?: number | null
          media_mimetype?: string | null
          media_storage_path?: string | null
          media_url?: string | null
          message_id?: string
          message_type?: string
          provider?: string
          provider_message_id?: string | null
          provider_raw_payload?: Json | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          reaction_emoji?: string | null
          remote_jid?: string
          sender_name?: string | null
          seq?: number
          status?: string
          sync_error?: string | null
          timestamp?: string
          webhook_received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      coexistence_history_chunks: {
        Row: {
          attempts: number
          chunk_index: number
          company_id: string
          created_at: string
          error: string | null
          id: string
          instance_id: string
          payload: Json
          phase: number
          processed_at: string | null
        }
        Insert: {
          attempts?: number
          chunk_index?: number
          company_id: string
          created_at?: string
          error?: string | null
          id?: string
          instance_id: string
          payload: Json
          phase?: number
          processed_at?: string | null
        }
        Update: {
          attempts?: number
          chunk_index?: number
          company_id?: string
          created_at?: string
          error?: string | null
          id?: string
          instance_id?: string
          payload?: Json
          phase?: number
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coexistence_history_chunks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coexistence_history_chunks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "coexistence_history_chunks_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          address_complement: string | null
          address_number: string | null
          ai_agent_enabled: boolean
          ai_usage_alert_100_sent_at: string | null
          ai_usage_alert_80_sent_at: string | null
          asaas_customer_id: string | null
          automations_enabled: boolean
          billing_run_hour: number
          brand_palette: string
          city: string | null
          cnpj: string | null
          created_at: string
          crm_vertical: string | null
          ecommerce_enabled: boolean
          email: string | null
          id: string
          last_billing_sync_at: string | null
          legal_name: string | null
          logo_url: string | null
          name: string
          neighborhood: string | null
          phone: string | null
          plan_status: Database["public"]["Enums"]["plan_status"]
          selected_plan_id: string | null
          state: string | null
          timezone: string | null
          trade_name: string | null
          trial_ends_at: string | null
          trial_expired_notified_at: string | null
          trial_reminder_12h_sent_at: string | null
          trial_reminder_6h_sent_at: string | null
          updated_at: string
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          ai_agent_enabled?: boolean
          ai_usage_alert_100_sent_at?: string | null
          ai_usage_alert_80_sent_at?: string | null
          asaas_customer_id?: string | null
          automations_enabled?: boolean
          billing_run_hour?: number
          brand_palette?: string
          city?: string | null
          cnpj?: string | null
          created_at?: string
          crm_vertical?: string | null
          ecommerce_enabled?: boolean
          email?: string | null
          id?: string
          last_billing_sync_at?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name: string
          neighborhood?: string | null
          phone?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          selected_plan_id?: string | null
          state?: string | null
          timezone?: string | null
          trade_name?: string | null
          trial_ends_at?: string | null
          trial_expired_notified_at?: string | null
          trial_reminder_12h_sent_at?: string | null
          trial_reminder_6h_sent_at?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          ai_agent_enabled?: boolean
          ai_usage_alert_100_sent_at?: string | null
          ai_usage_alert_80_sent_at?: string | null
          asaas_customer_id?: string | null
          automations_enabled?: boolean
          billing_run_hour?: number
          brand_palette?: string
          city?: string | null
          cnpj?: string | null
          created_at?: string
          crm_vertical?: string | null
          ecommerce_enabled?: boolean
          email?: string | null
          id?: string
          last_billing_sync_at?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          neighborhood?: string | null
          phone?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          selected_plan_id?: string | null
          state?: string | null
          timezone?: string | null
          trade_name?: string | null
          trial_ends_at?: string | null
          trial_expired_notified_at?: string | null
          trial_reminder_12h_sent_at?: string | null
          trial_reminder_6h_sent_at?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_selected_plan_id_fkey"
            columns: ["selected_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      company_addons: {
        Row: {
          activated_at: string
          addon_slug: string
          company_id: string
          created_at: string
          deactivated_at: string | null
          id: string
          included_messages: number
          is_active: boolean
          monthly_price: number
          notes: string | null
          overage_price_per_message: number
          updated_at: string
        }
        Insert: {
          activated_at?: string
          addon_slug: string
          company_id: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          included_messages?: number
          is_active?: boolean
          monthly_price: number
          notes?: string | null
          overage_price_per_message?: number
          updated_at?: string
        }
        Update: {
          activated_at?: string
          addon_slug?: string
          company_id?: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          included_messages?: number
          is_active?: boolean
          monthly_price?: number
          notes?: string | null
          overage_price_per_message?: number
          updated_at?: string
        }
        Relationships: []
      }
      company_notification_prefs: {
        Row: {
          company_id: string
          created_at: string
          daily_report_hour: number
          email_daily_report: boolean
          email_new_lead: boolean
          email_new_message: boolean
          email_recipients: string[]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          daily_report_hour?: number
          email_daily_report?: boolean
          email_new_lead?: boolean
          email_new_message?: boolean
          email_recipients?: string[]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          daily_report_hour?: number
          email_daily_report?: boolean
          email_new_lead?: boolean
          email_new_message?: boolean
          email_recipients?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_notification_prefs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_notification_prefs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      company_onboarding: {
        Row: {
          company_id: string
          completed_at: string | null
          completed_steps: string[]
          created_at: string
          current_step: number
          skipped: boolean
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          completed_steps?: string[]
          created_at?: string
          current_step?: number
          skipped?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          completed_steps?: string[]
          created_at?: string
          current_step?: number
          skipped?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_onboarding_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_onboarding_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      company_status_audit: {
        Row: {
          changed_by: string
          company_id: string
          created_at: string
          id: string
          new_status: string
          previous_status: string | null
          reason: string
        }
        Insert: {
          changed_by: string
          company_id: string
          created_at?: string
          id?: string
          new_status: string
          previous_status?: string | null
          reason: string
        }
        Update: {
          changed_by?: string
          company_id?: string
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string | null
          reason?: string
        }
        Relationships: []
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          address_complement: string | null
          address_number: string | null
          allergies: string | null
          assigned_to: string | null
          avatar_url: string | null
          birth_date: string | null
          city: string | null
          company_id: string
          company_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          document: string | null
          email: string | null
          gender: string | null
          id: string
          insurance: string | null
          is_demo: boolean
          last_interaction_at: string | null
          medical_patient_id: string | null
          name: string
          neighborhood: string | null
          notes: string | null
          phone: string | null
          phone_match_key: string | null
          phone_normalized: string | null
          source: string | null
          state: string | null
          tenant_seq: number | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          allergies?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          city?: string | null
          company_id: string
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          insurance?: string | null
          is_demo?: boolean
          last_interaction_at?: string | null
          medical_patient_id?: string | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          phone_match_key?: string | null
          phone_normalized?: string | null
          source?: string | null
          state?: string | null
          tenant_seq?: number | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          allergies?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          city?: string | null
          company_id?: string
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          insurance?: string | null
          is_demo?: boolean
          last_interaction_at?: string | null
          medical_patient_id?: string | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          phone_match_key?: string | null
          phone_normalized?: string | null
          source?: string | null
          state?: string | null
          tenant_seq?: number | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_access_log: {
        Row: {
          access_type: string
          company_id: string
          conversation_id: string | null
          created_at: string
          id: string
          message_count: number | null
          metadata: Json
          user_id: string
        }
        Insert: {
          access_type: string
          company_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_count?: number | null
          metadata?: Json
          user_id: string
        }
        Update: {
          access_type?: string
          company_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_count?: number | null
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      conversation_ai_state: {
        Row: {
          agent_id: string
          collected_data: Json
          company_id: string
          conversation_id: string
          created_at: string
          handoff_reason: string | null
          id: string
          last_inbound_at: string | null
          last_processed_message_id: string | null
          last_run_at: string | null
          manual_status: string | null
          manual_status_set_at: string | null
          manual_status_set_by: string | null
          paused_until: string | null
          pending_since: string | null
          status: string
          summary: string | null
          turn_count: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          collected_data?: Json
          company_id: string
          conversation_id: string
          created_at?: string
          handoff_reason?: string | null
          id?: string
          last_inbound_at?: string | null
          last_processed_message_id?: string | null
          last_run_at?: string | null
          manual_status?: string | null
          manual_status_set_at?: string | null
          manual_status_set_by?: string | null
          paused_until?: string | null
          pending_since?: string | null
          status?: string
          summary?: string | null
          turn_count?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          collected_data?: Json
          company_id?: string
          conversation_id?: string
          created_at?: string
          handoff_reason?: string | null
          id?: string
          last_inbound_at?: string | null
          last_processed_message_id?: string | null
          last_run_at?: string | null
          manual_status?: string | null
          manual_status_set_at?: string | null
          manual_status_set_by?: string | null
          paused_until?: string | null
          pending_since?: string | null
          status?: string
          summary?: string | null
          turn_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          closed_at: string | null
          company_id: string
          contact_id: string | null
          contact_name: string | null
          contact_photo_url: string | null
          contact_storage_path: string | null
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string
          is_archived: boolean
          is_demo: boolean
          last_message_at: string | null
          last_message_text: string | null
          lead_id: string | null
          phone: string
          provider: string
          remote_jid: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          company_id: string
          contact_id?: string | null
          contact_name?: string | null
          contact_photo_url?: string | null
          contact_storage_path?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name: string
          is_archived?: boolean
          is_demo?: boolean
          last_message_at?: string | null
          last_message_text?: string | null
          lead_id?: string | null
          phone: string
          provider?: string
          remote_jid: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          company_id?: string
          contact_id?: string | null
          contact_name?: string | null
          contact_photo_url?: string | null
          contact_storage_path?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          is_archived?: boolean
          is_demo?: boolean
          last_message_at?: string | null
          last_message_text?: string | null
          lead_id?: string | null
          phone?: string
          provider?: string
          remote_jid?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          html_body: string
          id: string
          is_active: boolean
          name: string
          slug: string
          subject: string
          text_body: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          html_body: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          subject: string
          text_body?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          html_body?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          subject?: string
          text_body?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      financial_categories: {
        Row: {
          archived: boolean
          color: string | null
          company_id: string
          created_at: string
          dre_section: Database["public"]["Enums"]["dre_section"] | null
          id: string
          is_direct_cost: boolean
          is_operational: boolean
          is_system: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          company_id: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_direct_cost?: boolean
          is_operational?: boolean
          is_system?: boolean
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          company_id?: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_direct_cost?: boolean
          is_operational?: boolean
          is_system?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      financial_cost_centers: {
        Row: {
          archived: boolean
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      financial_entries: {
        Row: {
          amount: number
          approved_by: string | null
          category_id: string | null
          company_id: string
          contact_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          description: string
          discount: number
          due_date: string | null
          external_payment_id: string | null
          external_provider: string | null
          id: string
          installment_number: number | null
          installment_total: number | null
          kind: string
          lead_id: string | null
          metadata: Json
          net_amount: number | null
          paid_amount: number
          paid_at: string | null
          paid_by: string | null
          parent_entry_id: string | null
          party_name: string | null
          payment_method: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          category_id?: string | null
          company_id: string
          contact_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          discount?: number
          due_date?: string | null
          external_payment_id?: string | null
          external_provider?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          kind: string
          lead_id?: string | null
          metadata?: Json
          net_amount?: number | null
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          parent_entry_id?: string | null
          party_name?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          category_id?: string | null
          company_id?: string
          contact_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          discount?: number
          due_date?: string | null
          external_payment_id?: string | null
          external_provider?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          kind?: string
          lead_id?: string | null
          metadata?: Json
          net_amount?: number | null
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          parent_entry_id?: string | null
          party_name?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "financial_entries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "financial_cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_parent_entry_id_fkey"
            columns: ["parent_entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_entry_attachments: {
        Row: {
          company_id: string
          created_at: string
          entry_id: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          entry_id: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          entry_id?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_entry_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entry_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "financial_entry_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_agents: {
        Row: {
          company_id: string
          created_at: string
          id: string
          instance_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          instance_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          instance_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instance_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instance_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "instance_agents_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instance_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_events: {
        Row: {
          company_id: string | null
          created_at: string
          down_since: string | null
          duration_seconds: number | null
          event_type: string
          id: string
          instance_name: string
          metadata: Json | null
          new_state: string | null
          previous_state: string | null
          scope: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          down_since?: string | null
          duration_seconds?: number | null
          event_type: string
          id?: string
          instance_name: string
          metadata?: Json | null
          new_state?: string | null
          previous_state?: string | null
          scope?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          down_since?: string | null
          duration_seconds?: number | null
          event_type?: string
          id?: string
          instance_name?: string
          metadata?: Json | null
          new_state?: string | null
          previous_state?: string | null
          scope?: string
        }
        Relationships: []
      }
      instance_health: {
        Row: {
          company_id: string | null
          created_at: string
          down_alerted_at: string | null
          down_since: string | null
          id: string
          instance_name: string
          last_reconnect_at: string | null
          last_reconnect_error: string | null
          last_seen_at: string
          last_state: string
          next_reconnect_at: string | null
          reconnect_attempts: number
          reconnect_given_up: boolean
          recovered_alerted_at: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          down_alerted_at?: string | null
          down_since?: string | null
          id?: string
          instance_name: string
          last_reconnect_at?: string | null
          last_reconnect_error?: string | null
          last_seen_at?: string
          last_state?: string
          next_reconnect_at?: string | null
          reconnect_attempts?: number
          reconnect_given_up?: boolean
          recovered_alerted_at?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          down_alerted_at?: string | null
          down_since?: string | null
          id?: string
          instance_name?: string
          last_reconnect_at?: string | null
          last_reconnect_error?: string | null
          last_seen_at?: string
          last_state?: string
          next_reconnect_at?: string | null
          reconnect_attempts?: number
          reconnect_given_up?: boolean
          recovered_alerted_at?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          asaas_invoice_url: string | null
          asaas_payment_id: string | null
          billing_cycle: string
          company_id: string
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issued_at: string
          metadata: Json
          paid_at: string | null
          payment_method: string | null
          pdf_url: string | null
          period_end: string
          period_start: string
          pix_expires_at: string | null
          pix_payload: string | null
          pix_qrcode: string | null
          status: string
          stripe_invoice_id: string | null
          subscription_id: string
        }
        Insert: {
          amount: number
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          billing_cycle: string
          company_id: string
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          metadata?: Json
          paid_at?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          pix_expires_at?: string | null
          pix_payload?: string | null
          pix_qrcode?: string | null
          status?: string
          stripe_invoice_id?: string | null
          subscription_id: string
        }
        Update: {
          amount?: number
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          billing_cycle?: string
          company_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          metadata?: Json
          paid_at?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          pix_expires_at?: string | null
          pix_payload?: string | null
          pix_qrcode?: string | null
          status?: string
          stripe_invoice_id?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          action_type: Database["public"]["Enums"]["lead_activity_type"]
          company_id: string
          contact_id: string | null
          created_at: string
          description: string
          id: string
          lead_id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["lead_activity_type"]
          company_id: string
          contact_id?: string | null
          created_at?: string
          description: string
          id?: string
          lead_id: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["lead_activity_type"]
          company_id?: string
          contact_id?: string | null
          created_at?: string
          description?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "lead_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_attachments: {
        Row: {
          category: string
          company_id: string
          contact_id: string | null
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          lead_id: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          company_id: string
          contact_id?: string | null
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          lead_id: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          contact_id?: string | null
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          lead_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "lead_attachments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_attachments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_attachments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_discount_approvals: {
        Row: {
          approved_by: string
          company_id: string
          created_at: string
          discount_amount: number | null
          discount_pct: number | null
          id: string
          lead_id: string
          lead_procedure_id: string | null
          previous_amount: number | null
          previous_pct: number | null
          reason: string | null
          requested_by: string | null
        }
        Insert: {
          approved_by: string
          company_id: string
          created_at?: string
          discount_amount?: number | null
          discount_pct?: number | null
          id?: string
          lead_id: string
          lead_procedure_id?: string | null
          previous_amount?: number | null
          previous_pct?: number | null
          reason?: string | null
          requested_by?: string | null
        }
        Update: {
          approved_by?: string
          company_id?: string
          created_at?: string
          discount_amount?: number | null
          discount_pct?: number | null
          id?: string
          lead_id?: string
          lead_procedure_id?: string | null
          previous_amount?: number | null
          previous_pct?: number | null
          reason?: string | null
          requested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_discount_approvals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_discount_approvals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_distribution_settings: {
        Row: {
          company_id: string
          created_at: string | null
          distribution_mode: string | null
          enabled: boolean | null
          id: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          distribution_mode?: string | null
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          distribution_mode?: string | null
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_distribution_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_distribution_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      lead_distribution_users: {
        Row: {
          assigned_count: number | null
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          max_chats: number | null
          user_id: string
        }
        Insert: {
          assigned_count?: number | null
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_chats?: number | null
          user_id: string
        }
        Update: {
          assigned_count?: number | null
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_chats?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_distribution_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_distribution_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "lead_distribution_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_history: {
        Row: {
          actor_name: string | null
          actor_user_id: string | null
          company_id: string
          created_at: string
          event_type: string
          id: string
          lead_id: string
          payload: Json
        }
        Insert: {
          actor_name?: string | null
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          lead_id: string
          payload?: Json
        }
        Update: {
          actor_name?: string | null
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_medical_notes: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          company_id: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body: string
          company_id: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_medical_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_medical_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_payment_attachments: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          id: string
          kind: string
          lead_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          id?: string
          kind?: string
          lead_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          lead_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_payment_attachments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_payment_attachments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_procedures: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          discount_amount: number | null
          discount_pct: number | null
          id: string
          item_name_snapshot: string | null
          item_type: string
          lead_id: string
          medical_procedure_id: string | null
          net_price: number | null
          price_snapshot: number | null
          product_id: string | null
          quantity: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          id?: string
          item_name_snapshot?: string | null
          item_type?: string
          lead_id: string
          medical_procedure_id?: string | null
          net_price?: number | null
          price_snapshot?: number | null
          product_id?: string | null
          quantity?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          id?: string
          item_name_snapshot?: string | null
          item_type?: string
          lead_id?: string
          medical_procedure_id?: string | null
          net_price?: number | null
          price_snapshot?: number | null
          product_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_procedures_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_procedures_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_procedures_medical_procedure_id_fkey"
            columns: ["medical_procedure_id"]
            isOneToOne: false
            referencedRelation: "medical_procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_procedures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          created_at: string | null
          id: string
          lead_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lead_id: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lead_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          address_complement: string | null
          address_number: string | null
          allergies: string | null
          appointment_status: string | null
          asaas_customer_id: string | null
          assigned_to: string | null
          avatar_url: string | null
          birth_date: string | null
          city: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          company_name: string | null
          contact_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          discount_amount: number | null
          discount_approved_at: string | null
          discount_approved_by: string | null
          discount_pct: number | null
          document: string | null
          duration_minutes: number | null
          email: string | null
          facility_id: string | null
          finance_notes: string | null
          gender: string | null
          id: string
          insurance: string | null
          insurance_card_number: string | null
          insurance_id: string | null
          invoice_number: string | null
          is_demo: boolean
          last_payment_amount: number | null
          last_payment_at: string | null
          last_payment_status: string | null
          loss_reason_id: string | null
          loss_reason_text: string | null
          medical_doctor_id: string | null
          medical_patient_id: string | null
          medical_procedure_id: string | null
          name: string
          name_manually_edited: boolean
          neighborhood: string | null
          net_value: number | null
          notes: string | null
          numeric_id: number
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_installments: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          phone: string | null
          pipeline_id: string | null
          responded_at: string | null
          scheduled_at: string | null
          source: string | null
          stage_id: string | null
          state: string | null
          status: Database["public"]["Enums"]["lead_status"]
          tenant_seq: number | null
          updated_at: string
          value: number | null
          value_auto: boolean
          value_manual_override: boolean
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          allergies?: string | null
          appointment_status?: string | null
          asaas_customer_id?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          city?: string | null
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          company_name?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_approved_at?: string | null
          discount_approved_by?: string | null
          discount_pct?: number | null
          document?: string | null
          duration_minutes?: number | null
          email?: string | null
          facility_id?: string | null
          finance_notes?: string | null
          gender?: string | null
          id?: string
          insurance?: string | null
          insurance_card_number?: string | null
          insurance_id?: string | null
          invoice_number?: string | null
          is_demo?: boolean
          last_payment_amount?: number | null
          last_payment_at?: string | null
          last_payment_status?: string | null
          loss_reason_id?: string | null
          loss_reason_text?: string | null
          medical_doctor_id?: string | null
          medical_patient_id?: string | null
          medical_procedure_id?: string | null
          name: string
          name_manually_edited?: boolean
          neighborhood?: string | null
          net_value?: number | null
          notes?: string | null
          numeric_id?: number
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_installments?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          phone?: string | null
          pipeline_id?: string | null
          responded_at?: string | null
          scheduled_at?: string | null
          source?: string | null
          stage_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_seq?: number | null
          updated_at?: string
          value?: number | null
          value_auto?: boolean
          value_manual_override?: boolean
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          allergies?: string | null
          appointment_status?: string | null
          asaas_customer_id?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          city?: string | null
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          company_name?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_approved_at?: string | null
          discount_approved_by?: string | null
          discount_pct?: number | null
          document?: string | null
          duration_minutes?: number | null
          email?: string | null
          facility_id?: string | null
          finance_notes?: string | null
          gender?: string | null
          id?: string
          insurance?: string | null
          insurance_card_number?: string | null
          insurance_id?: string | null
          invoice_number?: string | null
          is_demo?: boolean
          last_payment_amount?: number | null
          last_payment_at?: string | null
          last_payment_status?: string | null
          loss_reason_id?: string | null
          loss_reason_text?: string | null
          medical_doctor_id?: string | null
          medical_patient_id?: string | null
          medical_procedure_id?: string | null
          name?: string
          name_manually_edited?: boolean
          neighborhood?: string | null
          net_value?: number | null
          notes?: string | null
          numeric_id?: number
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_installments?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          phone?: string | null
          pipeline_id?: string | null
          responded_at?: string | null
          scheduled_at?: string | null
          source?: string | null
          stage_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_seq?: number | null
          updated_at?: string
          value?: number | null
          value_auto?: boolean
          value_manual_override?: boolean
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["assigned_to_id"]
          },
          {
            foreignKeyName: "leads_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "medical_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_insurance_id_fkey"
            columns: ["insurance_id"]
            isOneToOne: false
            referencedRelation: "medical_insurances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_loss_reason_id_fkey"
            columns: ["loss_reason_id"]
            isOneToOne: false
            referencedRelation: "loss_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_medical_doctor_id_fkey"
            columns: ["medical_doctor_id"]
            isOneToOne: false
            referencedRelation: "medical_doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_medical_patient_id_fkey"
            columns: ["medical_patient_id"]
            isOneToOne: false
            referencedRelation: "medical_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_medical_procedure_id_fkey"
            columns: ["medical_procedure_id"]
            isOneToOne: false
            referencedRelation: "medical_procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["pipeline_id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      log_retention_policies: {
        Row: {
          archive_days: number
          archive_enabled: boolean
          created_at: string
          enabled: boolean
          hot_days: number
          id: string
          last_moved: number | null
          last_purged: number | null
          last_run_at: string | null
          table_name: string
          updated_at: string
        }
        Insert: {
          archive_days?: number
          archive_enabled?: boolean
          created_at?: string
          enabled?: boolean
          hot_days?: number
          id?: string
          last_moved?: number | null
          last_purged?: number | null
          last_run_at?: string | null
          table_name: string
          updated_at?: string
        }
        Update: {
          archive_days?: number
          archive_enabled?: boolean
          created_at?: string
          enabled?: boolean
          hot_days?: number
          id?: string
          last_moved?: number | null
          last_purged?: number | null
          last_run_at?: string | null
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      loss_reasons: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loss_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loss_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      media_fetch_jobs: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          id: string
          instance_id: string
          last_error: string | null
          max_attempts: number
          media_id: string
          media_mimetype: string | null
          media_type: string
          message_id: string
          next_attempt_at: string
          picked_at: string | null
          provider: string
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          id?: string
          instance_id: string
          last_error?: string | null
          max_attempts?: number
          media_id: string
          media_mimetype?: string | null
          media_type: string
          message_id: string
          next_attempt_at?: string
          picked_at?: string | null
          provider?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          id?: string
          instance_id?: string
          last_error?: string | null
          max_attempts?: number
          media_id?: string
          media_mimetype?: string | null
          media_type?: string
          message_id?: string
          next_attempt_at?: string
          picked_at?: string | null
          provider?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      medical_ai_insights: {
        Row: {
          action_suggested: string | null
          action_taken: boolean | null
          action_taken_at: string | null
          company_id: string
          created_at: string | null
          description: string | null
          dismissed: boolean | null
          dismissed_at: string | null
          expires_at: string | null
          id: string
          insight_type: string
          practice_id: string
          related_doctor_id: string | null
          related_patient_id: string | null
          severity: string | null
          title: string
        }
        Insert: {
          action_suggested?: string | null
          action_taken?: boolean | null
          action_taken_at?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          insight_type: string
          practice_id: string
          related_doctor_id?: string | null
          related_patient_id?: string | null
          severity?: string | null
          title: string
        }
        Update: {
          action_suggested?: string | null
          action_taken?: boolean | null
          action_taken_at?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          insight_type?: string
          practice_id?: string
          related_doctor_id?: string | null
          related_patient_id?: string | null
          severity?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_ai_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_ai_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_ai_insights_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_ai_insights_related_doctor_id_fkey"
            columns: ["related_doctor_id"]
            isOneToOne: false
            referencedRelation: "medical_doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_ai_insights_related_patient_id_fkey"
            columns: ["related_patient_id"]
            isOneToOne: false
            referencedRelation: "medical_patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_appointments: {
        Row: {
          company_id: string
          created_at: string | null
          doctor_id: string
          duration_minutes: number | null
          facility_id: string | null
          follow_up_date: string | null
          follow_up_needed: boolean | null
          id: string
          insurance_id: string | null
          lead_id: string | null
          notes: string | null
          patient_id: string
          payment_status: string | null
          practice_id: string
          price: number | null
          procedure_id: string | null
          scheduled_date: string
          source: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          doctor_id: string
          duration_minutes?: number | null
          facility_id?: string | null
          follow_up_date?: string | null
          follow_up_needed?: boolean | null
          id?: string
          insurance_id?: string | null
          lead_id?: string | null
          notes?: string | null
          patient_id: string
          payment_status?: string | null
          practice_id: string
          price?: number | null
          procedure_id?: string | null
          scheduled_date: string
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          doctor_id?: string
          duration_minutes?: number | null
          facility_id?: string | null
          follow_up_date?: string | null
          follow_up_needed?: boolean | null
          id?: string
          insurance_id?: string | null
          lead_id?: string | null
          notes?: string | null
          patient_id?: string
          payment_status?: string | null
          practice_id?: string
          price?: number | null
          procedure_id?: string | null
          scheduled_date?: string
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "medical_doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_appointments_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "medical_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_appointments_insurance_id_fkey"
            columns: ["insurance_id"]
            isOneToOne: false
            referencedRelation: "medical_insurances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "medical_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_appointments_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_appointments_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "medical_procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_doctors: {
        Row: {
          active: boolean | null
          avatar_url: string | null
          avg_ticket_price: number | null
          bio: string | null
          company_id: string
          created_at: string | null
          email: string | null
          full_name: string
          hire_date: string | null
          id: string
          phone: string | null
          practice_id: string
          professional_registry: string | null
          specialization: string | null
          total_appointments: number | null
          total_revenue: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          avatar_url?: string | null
          avg_ticket_price?: number | null
          bio?: string | null
          company_id: string
          created_at?: string | null
          email?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          phone?: string | null
          practice_id: string
          professional_registry?: string | null
          specialization?: string | null
          total_appointments?: number | null
          total_revenue?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          avatar_url?: string | null
          avg_ticket_price?: number | null
          bio?: string | null
          company_id?: string
          created_at?: string | null
          email?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          phone?: string | null
          practice_id?: string
          professional_registry?: string | null
          specialization?: string | null
          total_appointments?: number | null
          total_revenue?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_doctors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_doctors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_doctors_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_facilities: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          cnpj: string | null
          company_id: string
          created_at: string
          id: string
          kind: string
          name: string
          notes: string | null
          phone: string | null
          practice_id: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          cnpj?: string | null
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          notes?: string | null
          phone?: string | null
          practice_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          cnpj?: string | null
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          phone?: string | null
          practice_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_facilities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_facilities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_facilities_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_follow_ups: {
        Row: {
          communication_method: string | null
          company_id: string
          completed_at: string | null
          created_at: string | null
          doctor_id: string | null
          follow_up_type: string
          id: string
          message_template_id: string | null
          notes: string | null
          outcome: string | null
          patient_id: string
          practice_id: string
          scheduled_date: string
          scheduled_time: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          communication_method?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          doctor_id?: string | null
          follow_up_type: string
          id?: string
          message_template_id?: string | null
          notes?: string | null
          outcome?: string | null
          patient_id: string
          practice_id: string
          scheduled_date: string
          scheduled_time?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          communication_method?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          doctor_id?: string | null
          follow_up_type?: string
          id?: string
          message_template_id?: string | null
          notes?: string | null
          outcome?: string | null
          patient_id?: string
          practice_id?: string
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_follow_ups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_follow_ups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_follow_ups_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "medical_doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "medical_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_follow_ups_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_insurances: {
        Row: {
          active: boolean
          ans_code: string | null
          company_id: string
          contact_phone: string | null
          coverage_scope: string | null
          created_at: string
          id: string
          modality: string | null
          name: string
          notes: string | null
          practice_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          ans_code?: string | null
          company_id: string
          contact_phone?: string | null
          coverage_scope?: string | null
          created_at?: string
          id?: string
          modality?: string | null
          name: string
          notes?: string | null
          practice_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          ans_code?: string | null
          company_id?: string
          contact_phone?: string | null
          coverage_scope?: string | null
          created_at?: string
          id?: string
          modality?: string | null
          name?: string
          notes?: string | null
          practice_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_insurances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_insurances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_insurances_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_kpi_snapshots: {
        Row: {
          appointments_booked: number | null
          avg_occupancy_rate: number | null
          avg_ticket: number | null
          company_id: string
          completed_appointments: number | null
          conversion_rate: number | null
          created_at: string | null
          daily_revenue: number | null
          doctor_count: number | null
          id: string
          leads_received: number | null
          monthly_revenue: number | null
          no_show_count: number | null
          no_show_rate: number | null
          practice_id: string
          snapshot_date: string
          total_appointments: number | null
        }
        Insert: {
          appointments_booked?: number | null
          avg_occupancy_rate?: number | null
          avg_ticket?: number | null
          company_id: string
          completed_appointments?: number | null
          conversion_rate?: number | null
          created_at?: string | null
          daily_revenue?: number | null
          doctor_count?: number | null
          id?: string
          leads_received?: number | null
          monthly_revenue?: number | null
          no_show_count?: number | null
          no_show_rate?: number | null
          practice_id: string
          snapshot_date: string
          total_appointments?: number | null
        }
        Update: {
          appointments_booked?: number | null
          avg_occupancy_rate?: number | null
          avg_ticket?: number | null
          company_id?: string
          completed_appointments?: number | null
          conversion_rate?: number | null
          created_at?: string | null
          daily_revenue?: number | null
          doctor_count?: number | null
          id?: string
          leads_received?: number | null
          monthly_revenue?: number | null
          no_show_count?: number | null
          no_show_rate?: number | null
          practice_id?: string
          snapshot_date?: string
          total_appointments?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_kpi_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_kpi_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_kpi_snapshots_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_marketing: {
        Row: {
          appointment_booked: boolean | null
          appointment_booked_date: string | null
          appointment_completed: boolean | null
          appointment_completed_date: string | null
          campaign_cost: number | null
          campaign_id: string | null
          campaign_name: string | null
          company_id: string
          created_at: string | null
          id: string
          lead_received_date: string
          notes: string | null
          patient_id: string | null
          practice_id: string
          revenue_generated: number | null
          roi: number | null
          source: string
          updated_at: string | null
        }
        Insert: {
          appointment_booked?: boolean | null
          appointment_booked_date?: string | null
          appointment_completed?: boolean | null
          appointment_completed_date?: string | null
          campaign_cost?: number | null
          campaign_id?: string | null
          campaign_name?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          lead_received_date?: string
          notes?: string | null
          patient_id?: string | null
          practice_id: string
          revenue_generated?: number | null
          roi?: number | null
          source: string
          updated_at?: string | null
        }
        Update: {
          appointment_booked?: boolean | null
          appointment_booked_date?: string | null
          appointment_completed?: boolean | null
          appointment_completed_date?: string | null
          campaign_cost?: number | null
          campaign_id?: string | null
          campaign_name?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          lead_received_date?: string
          notes?: string | null
          patient_id?: string | null
          practice_id?: string
          revenue_generated?: number | null
          roi?: number | null
          source?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_marketing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_marketing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_marketing_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "medical_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_marketing_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_patients: {
        Row: {
          allergies: string | null
          at_risk_flag: boolean | null
          at_risk_reason: string | null
          company_id: string
          cpf: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          first_appointment_date: string | null
          full_name: string
          gender: string | null
          id: string
          last_appointment_date: string | null
          lifetime_value: number | null
          medical_history: string | null
          phone: string | null
          practice_id: string
          recurrence_rate: number | null
          status: string | null
          total_appointments: number | null
          updated_at: string | null
        }
        Insert: {
          allergies?: string | null
          at_risk_flag?: boolean | null
          at_risk_reason?: string | null
          company_id: string
          cpf?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_appointment_date?: string | null
          full_name: string
          gender?: string | null
          id?: string
          last_appointment_date?: string | null
          lifetime_value?: number | null
          medical_history?: string | null
          phone?: string | null
          practice_id: string
          recurrence_rate?: number | null
          status?: string | null
          total_appointments?: number | null
          updated_at?: string | null
        }
        Update: {
          allergies?: string | null
          at_risk_flag?: boolean | null
          at_risk_reason?: string | null
          company_id?: string
          cpf?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_appointment_date?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          last_appointment_date?: string | null
          lifetime_value?: number | null
          medical_history?: string | null
          phone?: string | null
          practice_id?: string
          recurrence_rate?: number | null
          status?: string | null
          total_appointments?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_patients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_patients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_patients_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_payments: {
        Row: {
          amount: number
          appointment_id: string | null
          company_id: string
          created_at: string | null
          doctor_id: string | null
          due_date: string | null
          external_payment_id: string | null
          id: string
          issue_date: string
          notes: string | null
          patient_id: string
          payment_method: string | null
          payment_provider: string | null
          payment_status: string
          practice_id: string
          received_date: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          company_id: string
          created_at?: string | null
          doctor_id?: string | null
          due_date?: string | null
          external_payment_id?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          patient_id: string
          payment_method?: string | null
          payment_provider?: string | null
          payment_status?: string
          practice_id: string
          received_date?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          company_id?: string
          created_at?: string | null
          doctor_id?: string | null
          due_date?: string | null
          external_payment_id?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          patient_id?: string
          payment_method?: string | null
          payment_provider?: string | null
          payment_status?: string
          practice_id?: string
          received_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "medical_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_payments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "medical_doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "medical_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_payments_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_practices: {
        Row: {
          appointment_reminders_enabled: boolean | null
          billing_provider: string | null
          business_model: string | null
          city: string | null
          cnpj: string | null
          company_id: string
          created_at: string | null
          crm_type: string
          id: string
          practice_name: string | null
          state: string | null
          updated_at: string | null
          whatsapp_integration_enabled: boolean | null
        }
        Insert: {
          appointment_reminders_enabled?: boolean | null
          billing_provider?: string | null
          business_model?: string | null
          city?: string | null
          cnpj?: string | null
          company_id: string
          created_at?: string | null
          crm_type?: string
          id?: string
          practice_name?: string | null
          state?: string | null
          updated_at?: string | null
          whatsapp_integration_enabled?: boolean | null
        }
        Update: {
          appointment_reminders_enabled?: boolean | null
          billing_provider?: string | null
          business_model?: string | null
          city?: string | null
          cnpj?: string | null
          company_id?: string
          created_at?: string | null
          crm_type?: string
          id?: string
          practice_name?: string | null
          state?: string | null
          updated_at?: string | null
          whatsapp_integration_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_practices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_practices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      medical_procedures: {
        Row: {
          active: boolean | null
          avg_rating: number | null
          base_price: number
          category: string | null
          company_id: string
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          name: string
          practice_id: string
          total_performed: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          avg_rating?: number | null
          base_price: number
          category?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          name: string
          practice_id: string
          total_performed?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          avg_rating?: number | null
          base_price?: number
          category?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          name?: string
          practice_id?: string
          total_performed?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_procedures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_procedures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "medical_procedures_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "medical_practices"
            referencedColumns: ["id"]
          },
        ]
      }
      message_sequence_enrollments: {
        Row: {
          cancel_reason: string | null
          company_id: string
          completed_at: string | null
          current_step: number
          id: string
          lead_id: string
          next_run_at: string | null
          sequence_id: string
          started_at: string
          started_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          company_id: string
          completed_at?: string | null
          current_step?: number
          id?: string
          lead_id: string
          next_run_at?: string | null
          sequence_id: string
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          company_id?: string
          completed_at?: string | null
          current_step?: number
          id?: string
          lead_id?: string
          next_run_at?: string | null
          sequence_id?: string
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_sequence_enrollments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sequence_enrollments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "message_sequence_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sequence_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "message_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      message_sequence_steps: {
        Row: {
          body_override: string | null
          created_at: string
          delay_minutes: number
          id: string
          media_filename: string | null
          media_mimetype: string | null
          media_url: string | null
          position: number
          sequence_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          body_override?: string | null
          created_at?: string
          delay_minutes?: number
          id?: string
          media_filename?: string | null
          media_mimetype?: string | null
          media_url?: string | null
          position?: number
          sequence_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          body_override?: string | null
          created_at?: string
          delay_minutes?: number
          id?: string
          media_filename?: string | null
          media_mimetype?: string | null
          media_url?: string | null
          position?: number
          sequence_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "message_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_sequences: {
        Row: {
          business_hours_only: boolean
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          stop_on_reply: boolean
          stop_on_won_lost: boolean
          trigger_config: Json
          trigger_type: Database["public"]["Enums"]["sequence_trigger_type"]
          updated_at: string
        }
        Insert: {
          business_hours_only?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          stop_on_reply?: boolean
          stop_on_won_lost?: boolean
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["sequence_trigger_type"]
          updated_at?: string
        }
        Update: {
          business_hours_only?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          stop_on_reply?: boolean
          stop_on_won_lost?: boolean
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["sequence_trigger_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      message_sync_log: {
        Row: {
          company_id: string
          conversation_id: string | null
          created_at: string
          error_message: string | null
          event: string
          id: string
          message_content: string | null
          metadata: Json | null
          provider: string | null
          provider_event_id: string | null
          status: string | null
        }
        Insert: {
          company_id: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          event: string
          id?: string
          message_content?: string | null
          metadata?: Json | null
          provider?: string | null
          provider_event_id?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          event?: string
          id?: string
          message_content?: string | null
          metadata?: Json | null
          provider?: string | null
          provider_event_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_sync_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sync_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "message_sync_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          media_filename: string | null
          media_mimetype: string | null
          media_url: string | null
          name: string
          slug: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          category?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          media_filename?: string | null
          media_mimetype?: string | null
          media_url?: string | null
          name: string
          slug: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          media_filename?: string | null
          media_mimetype?: string | null
          media_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      notification_log: {
        Row: {
          channel: string
          company_id: string | null
          created_at: string
          error: string | null
          id: string
          payload: Json | null
          recipient: string
          sent_by: string | null
          status: string
          subject: string | null
          template_slug: string | null
        }
        Insert: {
          channel: string
          company_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          recipient: string
          sent_by?: string | null
          status?: string
          subject?: string | null
          template_slug?: string | null
        }
        Update: {
          channel?: string
          company_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          recipient?: string
          sent_by?: string | null
          status?: string
          subject?: string | null
          template_slug?: string | null
        }
        Relationships: []
      }
      outbound_message_queue: {
        Row: {
          client_id: string
          company_id: string
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          max_attempts: number
          next_attempt_at: string
          payload: Json
          picked_at: string | null
          processed_at: string | null
          provider: string
          provider_message_id: string | null
          retry_count: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_id: string
          company_id: string
          conversation_id: string
          created_at?: string
          error?: string | null
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          picked_at?: string | null
          processed_at?: string | null
          provider: string
          provider_message_id?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string
          company_id?: string
          conversation_id?: string
          created_at?: string
          error?: string | null
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          picked_at?: string | null
          processed_at?: string | null
          provider?: string
          provider_message_id?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          amount: number | null
          asaas_payment_id: string | null
          company_id: string
          created_at: string
          event: string
          id: string
          invoice_id: string | null
          raw: Json
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          amount?: number | null
          asaas_payment_id?: string | null
          company_id: string
          created_at?: string
          event: string
          id?: string
          invoice_id?: string | null
          raw?: Json
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number | null
          asaas_payment_id?: string | null
          company_id?: string
          created_at?: string
          event?: string
          id?: string
          invoice_id?: string | null
          raw?: Json
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payment_attempts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_members: {
        Row: {
          created_at: string
          id: string
          pipeline_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pipeline_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pipeline_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_members_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["pipeline_id"]
          },
          {
            foreignKeyName: "pipeline_members_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["assigned_to_id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_demo: boolean
          name: string
          pipeline_id: string
          position: number
          stage_type: Database["public"]["Enums"]["pipeline_stage_type"]
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          pipeline_id: string
          position?: number
          stage_type?: Database["public"]["Enums"]["pipeline_stage_type"]
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          pipeline_id?: string
          position?: number
          stage_type?: Database["public"]["Enums"]["pipeline_stage_type"]
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["pipeline_id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          is_demo: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_demo?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_demo?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          base_price: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          sku: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sku?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["assigned_to_id"]
          },
        ]
      }
      professional_report_preferences: {
        Row: {
          company_id: string
          created_at: string
          daily_email_enabled: boolean
          daily_send_time: string
          daily_whatsapp_enabled: boolean
          email_override: string | null
          last_sent_date: string | null
          professional_id: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          daily_email_enabled?: boolean
          daily_send_time?: string
          daily_whatsapp_enabled?: boolean
          email_override?: string | null
          last_sent_date?: string | null
          professional_id: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          daily_email_enabled?: boolean
          daily_send_time?: string
          daily_whatsapp_enabled?: boolean
          email_override?: string | null
          last_sent_date?: string | null
          professional_id?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_report_preferences_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "appointment_professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          brand_palette: string | null
          city: string | null
          company_id: string | null
          complement: string | null
          cpf: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          is_online: boolean
          last_seen: string | null
          neighborhood: string | null
          number: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          state: string | null
          status: string
          street: string | null
          tags: string[]
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          brand_palette?: string | null
          city?: string | null
          company_id?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          is_online?: boolean
          last_seen?: string | null
          neighborhood?: string | null
          number?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          state?: string | null
          status?: string
          street?: string | null
          tags?: string[]
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          brand_palette?: string | null
          city?: string | null
          company_id?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_online?: boolean
          last_seen?: string | null
          neighborhood?: string | null
          number?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          state?: string | null
          status?: string
          street?: string | null
          tags?: string[]
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "leads_enriched"
            referencedColumns: ["assigned_to_id"]
          },
        ]
      }
      provider_circuit_state: {
        Row: {
          company_id: string
          consecutive_failures: number
          consecutive_successes: number
          half_open_in_flight: number
          last_error: string | null
          last_refill_at: string
          next_attempt_at: string | null
          opened_at: string | null
          provider: string
          status: string
          tokens: number
          total_allowed: number
          total_failures: number
          total_short_circuited: number
          total_throttled: number
          updated_at: string
        }
        Insert: {
          company_id: string
          consecutive_failures?: number
          consecutive_successes?: number
          half_open_in_flight?: number
          last_error?: string | null
          last_refill_at?: string
          next_attempt_at?: string | null
          opened_at?: string | null
          provider: string
          status?: string
          tokens?: number
          total_allowed?: number
          total_failures?: number
          total_short_circuited?: number
          total_throttled?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          consecutive_failures?: number
          consecutive_successes?: number
          half_open_in_flight?: number
          last_error?: string | null
          last_refill_at?: string
          next_attempt_at?: string | null
          opened_at?: string | null
          provider?: string
          status?: string
          tokens?: number
          total_allowed?: number
          total_failures?: number
          total_short_circuited?: number
          total_throttled?: number
          updated_at?: string
        }
        Relationships: []
      }
      provider_rate_limits: {
        Row: {
          bucket_capacity: number
          created_at: string
          enabled: boolean
          failure_threshold: number
          half_open_max_calls: number
          id: string
          open_seconds: number
          provider: string
          tokens_per_sec: number
          updated_at: string
        }
        Insert: {
          bucket_capacity?: number
          created_at?: string
          enabled?: boolean
          failure_threshold?: number
          half_open_max_calls?: number
          id?: string
          open_seconds?: number
          provider: string
          tokens_per_sec?: number
          updated_at?: string
        }
        Update: {
          bucket_capacity?: number
          created_at?: string
          enabled?: boolean
          failure_threshold?: number
          half_open_max_calls?: number
          id?: string
          open_seconds?: number
          provider?: string
          tokens_per_sec?: number
          updated_at?: string
        }
        Relationships: []
      }
      reactivation_requests: {
        Row: {
          company_id: string | null
          company_name: string
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string | null
          requester_email: string
          requester_name: string
          status: string
        }
        Insert: {
          company_id?: string | null
          company_name: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          requester_email: string
          requester_name: string
          status?: string
        }
        Update: {
          company_id?: string | null
          company_name?: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          requester_email?: string
          requester_name?: string
          status?: string
        }
        Relationships: []
      }
      roadmap_items: {
        Row: {
          addon: boolean
          created_at: string
          description: string
          icon: string
          id: string
          progress: number
          released_at: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          addon?: boolean
          created_at?: string
          description: string
          icon?: string
          id?: string
          progress?: number
          released_at?: string | null
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          addon?: boolean
          created_at?: string
          description?: string
          icon?: string
          id?: string
          progress?: number
          released_at?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      roadmap_suggestions: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          description: string
          id: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          company_id?: string | null
          created_at?: string
          description: string
          id?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          description?: string
          id?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          lead_id: string
          media_caption: string | null
          media_filename: string | null
          media_mimetype: string | null
          media_url: string | null
          message: string
          message_type: string
          send_at: string
          sent_at: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          lead_id: string
          media_caption?: string | null
          media_filename?: string | null
          media_mimetype?: string | null
          media_url?: string | null
          message: string
          message_type?: string
          send_at: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string
          media_caption?: string | null
          media_filename?: string | null
          media_mimetype?: string | null
          media_url?: string | null
          message?: string
          message_type?: string
          send_at?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "scheduled_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      store_carts: {
        Row: {
          checkout_url: string
          company_id: string
          conversation_id: string | null
          converted_at: string | null
          coupon_code: string | null
          created_at: string
          currency: string
          external_cart_id: string | null
          id: string
          items: Json
          lead_id: string | null
          status: string
          store_integration_id: string
          total: number
          updated_at: string
        }
        Insert: {
          checkout_url: string
          company_id: string
          conversation_id?: string | null
          converted_at?: string | null
          coupon_code?: string | null
          created_at?: string
          currency?: string
          external_cart_id?: string | null
          id?: string
          items?: Json
          lead_id?: string | null
          status?: string
          store_integration_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          checkout_url?: string
          company_id?: string
          conversation_id?: string | null
          converted_at?: string | null
          coupon_code?: string | null
          created_at?: string
          currency?: string
          external_cart_id?: string | null
          id?: string
          items?: Json
          lead_id?: string | null
          status?: string
          store_integration_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_carts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_carts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "store_carts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_carts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_carts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_carts_store_integration_id_fkey"
            columns: ["store_integration_id"]
            isOneToOne: false
            referencedRelation: "store_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_coupons: {
        Row: {
          agent_can_offer: boolean
          code: string
          company_id: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_value: number | null
          store_integration_id: string
          updated_at: string
          uses_count: number
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          agent_can_offer?: boolean
          code: string
          company_id: string
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_value?: number | null
          store_integration_id: string
          updated_at?: string
          uses_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          agent_can_offer?: boolean
          code?: string
          company_id?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_value?: number | null
          store_integration_id?: string
          updated_at?: string
          uses_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_coupons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_coupons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "store_coupons_store_integration_id_fkey"
            columns: ["store_integration_id"]
            isOneToOne: false
            referencedRelation: "store_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_integration_jobs: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          finished_at: string | null
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          next_run_at: string
          payload: Json
          started_at: string | null
          status: string
          store_integration_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          started_at?: string | null
          status?: string
          store_integration_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          started_at?: string | null
          status?: string
          store_integration_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      store_integration_logs: {
        Row: {
          company_id: string
          created_at: string
          details: Json
          event_type: string
          id: string
          job_id: string | null
          message: string
          severity: string
          store_integration_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          job_id?: string | null
          message: string
          severity?: string
          store_integration_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          job_id?: string | null
          message?: string
          severity?: string
          store_integration_id?: string | null
        }
        Relationships: []
      }
      store_integrations: {
        Row: {
          company_id: string
          created_at: string
          credentials: Json
          currency: string
          display_name: string
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          presentment_currencies: Json
          product_count: number
          provider: string
          status: string
          store_url: string
          sync_attempts: number
          sync_checkpoint_at: string | null
          sync_cursor: string | null
          sync_error: string | null
          sync_finished_at: string | null
          sync_page: number
          sync_phase: string | null
          sync_processed: number
          sync_progress: number
          sync_started_at: string | null
          sync_total: number
          token_last4: string | null
          token_rotated_at: string | null
          updated_at: string
          webhook_secret: string | null
          webhooks: Json
          webhooks_registered_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          credentials?: Json
          currency?: string
          display_name: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          presentment_currencies?: Json
          product_count?: number
          provider: string
          status?: string
          store_url: string
          sync_attempts?: number
          sync_checkpoint_at?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_finished_at?: string | null
          sync_page?: number
          sync_phase?: string | null
          sync_processed?: number
          sync_progress?: number
          sync_started_at?: string | null
          sync_total?: number
          token_last4?: string | null
          token_rotated_at?: string | null
          updated_at?: string
          webhook_secret?: string | null
          webhooks?: Json
          webhooks_registered_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          credentials?: Json
          currency?: string
          display_name?: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          presentment_currencies?: Json
          product_count?: number
          provider?: string
          status?: string
          store_url?: string
          sync_attempts?: number
          sync_checkpoint_at?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_finished_at?: string | null
          sync_page?: number
          sync_phase?: string | null
          sync_processed?: number
          sync_progress?: number
          sync_started_at?: string | null
          sync_total?: number
          token_last4?: string | null
          token_rotated_at?: string | null
          updated_at?: string
          webhook_secret?: string | null
          webhooks?: Json
          webhooks_registered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      store_products: {
        Row: {
          categories: string[]
          company_id: string
          compare_at_price: number | null
          created_at: string
          currency: string
          description: string | null
          external_id: string
          id: string
          image_url: string | null
          is_active: boolean
          metadata: Json
          price: number
          product_url: string | null
          search_tsv: unknown
          sku: string | null
          stock: number | null
          store_integration_id: string
          synced_at: string
          tags: string[]
          title: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          categories?: string[]
          company_id: string
          compare_at_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          metadata?: Json
          price?: number
          product_url?: string | null
          search_tsv?: unknown
          sku?: string | null
          stock?: number | null
          store_integration_id: string
          synced_at?: string
          tags?: string[]
          title: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          categories?: string[]
          company_id?: string
          compare_at_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          metadata?: Json
          price?: number
          product_url?: string | null
          search_tsv?: unknown
          sku?: string | null
          stock?: number | null
          store_integration_id?: string
          synced_at?: string
          tags?: string[]
          title?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "store_products_store_integration_id_fkey"
            columns: ["store_integration_id"]
            isOneToOne: false
            referencedRelation: "store_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_recommendations_log: {
        Row: {
          company_id: string
          conversation_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          product_ids: string[]
          query_text: string | null
          reason: string | null
        }
        Insert: {
          company_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          product_ids?: string[]
          query_text?: string | null
          reason?: string | null
        }
        Update: {
          company_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          product_ids?: string[]
          query_text?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_recommendations_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_recommendations_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "store_recommendations_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_recommendations_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_recommendations_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      store_webhook_events: {
        Row: {
          company_id: string
          created_at: string
          error: string | null
          external_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          store_integration_id: string
          topic: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          store_integration_id: string
          topic: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          store_integration_id?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "store_webhook_events_store_integration_id_fkey"
            columns: ["store_integration_id"]
            isOneToOne: false
            referencedRelation: "store_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_worker_config: {
        Row: {
          concurrency: number
          enabled: boolean
          id: boolean
          max_batch: number
          max_per_company: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          concurrency?: number
          enabled?: boolean
          id?: boolean
          max_batch?: number
          max_per_company?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          concurrency?: number
          enabled?: boolean
          id?: boolean
          max_batch?: number
          max_per_company?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          features: Json
          id: string
          is_active: boolean
          is_featured: boolean
          max_leads: number | null
          max_pipelines: number | null
          max_users: number | null
          max_whatsapp_instances: number | null
          monthly_price: number
          name: string
          updated_at: string
          yearly_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          max_leads?: number | null
          max_pipelines?: number | null
          max_users?: number | null
          max_whatsapp_instances?: number | null
          monthly_price?: number
          name: string
          updated_at?: string
          yearly_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          max_leads?: number | null
          max_pipelines?: number | null
          max_users?: number | null
          max_whatsapp_instances?: number | null
          monthly_price?: number
          name?: string
          updated_at?: string
          yearly_price?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          asaas_subscription_id: string | null
          billing_cycle: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          card_brand: string | null
          card_last4: string | null
          company_id: string
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          monthly_price: number
          next_due_date: string | null
          payment_method: string | null
          pending_billing_cycle: string | null
          pending_plan_id: string | null
          plan_id: string | null
          plan_name: string
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          asaas_subscription_id?: string | null
          billing_cycle?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          card_brand?: string | null
          card_last4?: string | null
          company_id: string
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          monthly_price?: number
          next_due_date?: string | null
          payment_method?: string | null
          pending_billing_cycle?: string | null
          pending_plan_id?: string | null
          plan_id?: string | null
          plan_name?: string
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          asaas_subscription_id?: string | null
          billing_cycle?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          card_brand?: string | null
          card_last4?: string | null
          company_id?: string
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          monthly_price?: number
          next_due_date?: string | null
          payment_method?: string | null
          pending_billing_cycle?: string | null
          pending_plan_id?: string | null
          plan_id?: string | null
          plan_name?: string
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_pending_plan_id_fkey"
            columns: ["pending_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      system_integrations: {
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
      system_logs: {
        Row: {
          company_id: string | null
          created_at: string
          event: string
          id: string
          instance_name: string | null
          level: string
          message: string
          metadata: Json | null
          source: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          event: string
          id?: string
          instance_name?: string | null
          level?: string
          message: string
          metadata?: Json | null
          source?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          event?: string
          id?: string
          instance_name?: string | null
          level?: string
          message?: string
          metadata?: Json | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          id: string
          is_demo: boolean
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          is_demo?: boolean
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          is_demo?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      team_goal_group_members: {
        Row: {
          created_at: string
          group_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_goal_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "team_goal_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_goal_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_goal_groups: {
        Row: {
          color: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_goal_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_goal_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "team_goal_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_goals: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          metric: string
          name: string
          period_end: string
          period_start: string
          pipeline_id: string | null
          scope: string
          status: string
          target_value: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          metric: string
          name: string
          period_end: string
          period_start: string
          pipeline_id?: string | null
          scope: string
          status?: string
          target_value?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          metric?: string
          name?: string
          period_end?: string
          period_start?: string
          pipeline_id?: string | null
          scope?: string
          status?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "team_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_goals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "team_goal_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_goals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["pipeline_id"]
          },
          {
            foreignKeyName: "team_goals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          company_id: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_notes: {
        Row: {
          author_id: string
          company_id: string
          content: string
          created_at: string
          id: string
          member_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          company_id: string
          content: string
          created_at?: string
          id?: string
          member_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          member_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_missions: {
        Row: {
          assigned_to: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metric: string
          period_end: string
          period_start: string
          reward_icon: string | null
          reward_label: string | null
          status: string
          target_value: number
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metric: string
          period_end: string
          period_start: string
          reward_icon?: string | null
          reward_label?: string | null
          status?: string
          target_value?: number
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metric?: string
          period_end?: string
          period_start?: string
          reward_icon?: string | null
          reward_label?: string | null
          status?: string
          target_value?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_supervisor_alerts: {
        Row: {
          alerted_at: string
          company_id: string
          created_at: string
          id: string
          minutes_silent: number
          recipients_count: number
          ticket_id: string
        }
        Insert: {
          alerted_at?: string
          company_id: string
          created_at?: string
          id?: string
          minutes_silent: number
          recipients_count?: number
          ticket_id: string
        }
        Update: {
          alerted_at?: string
          company_id?: string
          created_at?: string
          id?: string
          minutes_silent?: number
          recipients_count?: number
          ticket_id?: string
        }
        Relationships: []
      }
      tracking_events: {
        Row: {
          company_id: string | null
          created_at: string
          destination: string
          error: string | null
          event_id: string
          event_name: string
          id: string
          payload: Json
          response: Json | null
          source: string
          status: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          destination: string
          error?: string | null
          event_id: string
          event_name: string
          id?: string
          payload?: Json
          response?: Json | null
          source: string
          status?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          destination?: string
          error?: string | null
          event_id?: string
          event_name?: string
          id?: string
          payload?: Json
          response?: Json | null
          source?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      triage_state: {
        Row: {
          company_id: string
          instance_id: string
          last_assigned_user_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          instance_id: string
          last_assigned_user_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          instance_id?: string
          last_assigned_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          accepted_at: string
          context: string
          created_at: string
          id: string
          ip: string | null
          kind: string
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          context?: string
          created_at?: string
          id?: string
          ip?: string | null
          kind?: string
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          context?: string
          created_at?: string
          id?: string
          ip?: string | null
          kind?: string
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["assigned_to_id"]
          },
        ]
      }
      user_goals: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          goal_type: string
          id: string
          period_end: string
          period_start: string
          target_value: number
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          goal_type: string
          id?: string
          period_end: string
          period_start: string
          target_value?: number
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          goal_type?: string
          id?: string
          period_end?: string
          period_start?: string
          target_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "user_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["assigned_to_id"]
          },
        ]
      }
      webhook_audit: {
        Row: {
          company_id: string
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_type: string
          external_message_id: string | null
          headers: Json
          id: string
          instance_id: string | null
          instance_name: string | null
          normalized_event: string | null
          provider: string
          raw_body: Json
          status: Database["public"]["Enums"]["webhook_audit_status"]
        }
        Insert: {
          company_id: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type: string
          external_message_id?: string | null
          headers?: Json
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          normalized_event?: string | null
          provider: string
          raw_body?: Json
          status?: Database["public"]["Enums"]["webhook_audit_status"]
        }
        Update: {
          company_id?: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type?: string
          external_message_id?: string | null
          headers?: Json
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          normalized_event?: string | null
          provider?: string
          raw_body?: Json
          status?: Database["public"]["Enums"]["webhook_audit_status"]
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempt: number
          company_id: string
          correlation_id: string
          created_at: string
          delivered_at: string | null
          duration_ms: number | null
          event: string
          id: string
          last_error: string | null
          last_request_headers: Json | null
          last_response_body: string | null
          last_response_status: number | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          status: string
          updated_at: string
          webhook_id: string
        }
        Insert: {
          attempt?: number
          company_id: string
          correlation_id: string
          created_at?: string
          delivered_at?: string | null
          duration_ms?: number | null
          event: string
          id?: string
          last_error?: string | null
          last_request_headers?: Json | null
          last_response_body?: string | null
          last_response_status?: number | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          status?: string
          updated_at?: string
          webhook_id: string
        }
        Update: {
          attempt?: number
          company_id?: string
          correlation_id?: string
          created_at?: string
          delivered_at?: string | null
          duration_ms?: number | null
          event?: string
          id?: string
          last_error?: string | null
          last_request_headers?: Json | null
          last_response_body?: string | null
          last_response_status?: number | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          status?: string
          updated_at?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events_queue: {
        Row: {
          company_id: string
          created_at: string
          event: string
          id: string
          payload: Json
          picked_at: string | null
          processed_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event: string
          id?: string
          payload: Json
          picked_at?: string | null
          processed_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event?: string
          id?: string
          payload?: Json
          picked_at?: string | null
          processed_at?: string | null
        }
        Relationships: []
      }
      webhook_inbox: {
        Row: {
          created_at: string
          error: string | null
          event_type: string | null
          headers: Json
          id: string
          instance_name: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          picked_at: string | null
          processed_at: string | null
          processing_duration_ms: number | null
          processing_started_at: string | null
          provider: string
          received_at: string
          retry_count: number
          signature_verified: boolean
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          headers?: Json
          id?: string
          instance_name?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          picked_at?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_started_at?: string | null
          provider: string
          received_at?: string
          retry_count?: number
          signature_verified?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          headers?: Json
          id?: string
          instance_name?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          picked_at?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_started_at?: string | null
          provider?: string
          received_at?: string
          retry_count?: number
          signature_verified?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_retry_queue: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          max_attempts: number
          message_id: string | null
          next_attempt_at: string
          payload: Json
          picked_at: string | null
          provider: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string
          payload: Json
          picked_at?: string | null
          provider?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string
          payload?: Json
          picked_at?: string | null
          provider?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          company_id: string
          created_at: string
          events: string[]
          id: string
          instance_ids: string[]
          is_active: boolean
          name: string
          secret: string
          secret_encrypted: string | null
          updated_at: string
          url: string
        }
        Insert: {
          company_id: string
          created_at?: string
          events?: string[]
          id?: string
          instance_ids?: string[]
          is_active?: boolean
          name: string
          secret: string
          secret_encrypted?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          company_id?: string
          created_at?: string
          events?: string[]
          id?: string
          instance_ids?: string[]
          is_active?: boolean
          name?: string
          secret?: string
          secret_encrypted?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      whatsapp_hsm_template_var_mappings: {
        Row: {
          body_tokens: string[]
          company_id: string
          created_at: string
          header_tokens: string[]
          id: string
          instance_id: string
          language: string
          template_name: string
          updated_at: string
        }
        Insert: {
          body_tokens?: string[]
          company_id: string
          created_at?: string
          header_tokens?: string[]
          id?: string
          instance_id: string
          language: string
          template_name: string
          updated_at?: string
        }
        Update: {
          body_tokens?: string[]
          company_id?: string
          created_at?: string
          header_tokens?: string[]
          id?: string
          instance_id?: string
          language?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_hsm_template_var_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_hsm_template_var_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "whatsapp_hsm_template_var_mappings_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_hsm_templates: {
        Row: {
          category: string
          company_id: string
          components: Json
          created_at: string
          id: string
          instance_id: string
          language: string
          last_synced_at: string
          meta_template_id: string | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          company_id: string
          components?: Json
          created_at?: string
          id?: string
          instance_id: string
          language: string
          last_synced_at?: string
          meta_template_id?: string | null
          name: string
          status: string
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          components?: Json
          created_at?: string
          id?: string
          instance_id?: string
          language?: string
          last_synced_at?: string
          meta_template_id?: string | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_hsm_templates_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          coexistence_state: Json
          color: string | null
          company_id: string
          config: Json
          created_at: string
          display_name: string
          id: string
          instance_name: string
          is_active: boolean
          is_preferred: boolean
          last_error: string | null
          last_sync: string | null
          mode: string
          phone_connected: string | null
          phone_number: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          coexistence_state?: Json
          color?: string | null
          company_id: string
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          instance_name: string
          is_active?: boolean
          is_preferred?: boolean
          last_error?: string | null
          last_sync?: string | null
          mode?: string
          phone_connected?: string | null
          phone_number?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          coexistence_state?: Json
          color?: string | null
          company_id?: string
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          instance_name?: string
          is_active?: boolean
          is_preferred?: boolean
          last_error?: string | null
          last_sync?: string | null
          mode?: string
          phone_connected?: string | null
          phone_number?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "leads_enriched"
            referencedColumns: ["company_id"]
          },
        ]
      }
      whatsapp_lid_map: {
        Row: {
          company_id: string
          instance_name: string | null
          last_seen_at: string
          lid: string
          phone_jid: string
        }
        Insert: {
          company_id: string
          instance_name?: string | null
          last_seen_at?: string
          lid: string
          phone_jid: string
        }
        Update: {
          company_id?: string
          instance_name?: string | null
          last_seen_at?: string
          lid?: string
          phone_jid?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
    }
    Views: {
      chat_side_effects_monitor: {
        Row: {
          effect_type: string | null
          newest: string | null
          oldest: string | null
          status: string | null
          total: number | null
        }
        Relationships: []
      }
      leads_enriched: {
        Row: {
          assigned_to_email: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          company_id: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          id: string | null
          name: string | null
          numeric_id: number | null
          phone: string | null
          pipeline_id: string | null
          pipeline_name: string | null
          source: string | null
          stage_id: string | null
          stage_name: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          updated_at: string | null
          value: number | null
        }
        Relationships: []
      }
      outbound_queue_monitor: {
        Row: {
          newest: string | null
          oldest: string | null
          status: string | null
          total: number | null
        }
        Relationships: []
      }
      system_health_snapshot: {
        Row: {
          db_size: string | null
          dead_retries: number | null
          errors_1h: number | null
          msgs_1h: number | null
          stale_queue: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _attendance_metrics_block: {
        Args: { _agent_id: string; _cid: string; _from: string; _to: string }
        Returns: Json
      }
      _can_audit_company: { Args: { _company_id: string }; Returns: boolean }
      _get_service_role_key: { Args: never; Returns: string }
      _last_closed_ticket_owner: {
        Args: { _conversation_id: string }
        Returns: string
      }
      _lead_history_actor_name: { Args: { _uid: string }; Returns: string }
      _mask_webhook_secret: { Args: { _plain: string }; Returns: string }
      _next_ticket_code: {
        Args: { _company_id: string }
        Returns: {
          code: string
          num: number
        }[]
      }
      _webhook_enc_key: { Args: never; Returns: string }
      accept_invite: {
        Args: { _invite_id: string; _user_id: string }
        Returns: undefined
      }
      activate_medical_vertical: {
        Args: {
          p_business_model?: string
          p_company_id: string
          p_crm_type?: string
          p_practice_name?: string
        }
        Returns: {
          appointment_reminders_enabled: boolean | null
          billing_provider: string | null
          business_model: string | null
          city: string | null
          cnpj: string | null
          company_id: string
          created_at: string | null
          crm_type: string
          id: string
          practice_name: string | null
          state: string | null
          updated_at: string | null
          whatsapp_integration_enabled: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "medical_practices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ai_agent_pipeline_checklist: {
        Args: never
        Returns: {
          active_agent_on_default_id: string
          active_agent_on_default_name: string
          ai_agent_enabled: boolean
          company_id: string
          company_name: string
          default_pipeline_id: string
          default_pipeline_name: string
          default_pipelines_count: number
          issues: string[]
          plan_status: string
          status: string
          total_active_agents: number
          total_pipelines: number
        }[]
      }
      apply_paid_invoice: {
        Args: {
          _amount?: number
          _asaas_payment_id: string
          _invoice_url?: string
          _method: string
          _paid_at: string
        }
        Returns: {
          amount: number
          asaas_invoice_url: string | null
          asaas_payment_id: string | null
          billing_cycle: string
          company_id: string
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issued_at: string
          metadata: Json
          paid_at: string | null
          payment_method: string | null
          pdf_url: string | null
          period_end: string
          period_start: string
          pix_expires_at: string | null
          pix_payload: string | null
          pix_qrcode: string | null
          status: string
          stripe_invoice_id: string | null
          subscription_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attach_payment_method: {
        Args: {
          _asaas_customer_id?: string
          _asaas_subscription_id?: string
          _brand?: string
          _last4?: string
          _method: string
          _subscription_id: string
        }
        Returns: {
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          asaas_subscription_id: string | null
          billing_cycle: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          card_brand: string | null
          card_last4: string | null
          company_id: string
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          monthly_price: number
          next_due_date: string | null
          payment_method: string | null
          pending_billing_cycle: string | null
          pending_plan_id: string | null
          plan_id: string | null
          plan_name: string
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auto_close_awaiting_rating_tickets: { Args: never; Returns: number }
      auto_close_inactive_tickets: { Args: never; Returns: number }
      bootstrap_vault_secrets: {
        Args: { _service_role_key: string; _supabase_url: string }
        Returns: Json
      }
      br_phone_match_key: { Args: { p: string }; Returns: string }
      bump_conversation_unread: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      can_read_company_data: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_attendance_queue_bulk: {
        Args: {
          _company_id?: string
          _conversation_id?: string
          _max_items?: number
          _message_kind?: string
          _older_than_minutes?: number
          _reason?: string
        }
        Returns: Json
      }
      cancel_attendance_queue_item: {
        Args: { _queue_id: string; _reason?: string }
        Returns: Json
      }
      cancel_my_subscription: {
        Args: never
        Returns: {
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          asaas_subscription_id: string | null
          billing_cycle: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          card_brand: string | null
          card_last4: string | null
          company_id: string
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          monthly_price: number
          next_due_date: string | null
          payment_method: string | null
          pending_billing_cycle: string | null
          pending_plan_id: string | null
          plan_id: string | null
          plan_name: string
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_subscription: {
        Args: { _subscription_id: string }
        Returns: undefined
      }
      cancel_webhook_retry: { Args: { _id: string }; Returns: undefined }
      canonical_remote_jid: { Args: { input: string }; Returns: string }
      change_subscription_plan: {
        Args: { _billing_cycle?: string; _new_plan_id: string }
        Returns: {
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          asaas_subscription_id: string | null
          billing_cycle: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          card_brand: string | null
          card_last4: string | null
          company_id: string
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          monthly_price: number
          next_due_date: string | null
          payment_method: string | null
          pending_billing_cycle: string | null
          pending_plan_id: string | null
          plan_id: string | null
          plan_name: string
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      chat_message_status_rank: { Args: { _status: string }; Returns: number }
      check_ai_agent_limits: { Args: { _company_id: string }; Returns: Json }
      check_appointment_conflict: {
        Args: {
          _end: string
          _exclude?: string
          _professional_id: string
          _start: string
        }
        Returns: {
          end_at: string
          id: string
          start_at: string
          title: string
        }[]
      }
      check_messaging_alerts: { Args: never; Returns: Json }
      check_pending_invite_by_email: {
        Args: { _email: string }
        Returns: {
          company_id: string
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      claim_chat_side_effects: {
        Args: { _limit?: number }
        Returns: {
          chat_message_id: string
          company_id: string
          conversation_id: string
          created_at: string
          effect_type: string
          error: string | null
          id: string
          max_attempts: number
          next_attempt_at: string
          picked_at: string | null
          processed_at: string | null
          retry_count: number
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "chat_message_side_effects_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_media_fetch_jobs: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          company_id: string
          created_at: string
          id: string
          instance_id: string
          last_error: string | null
          max_attempts: number
          media_id: string
          media_mimetype: string | null
          media_type: string
          message_id: string
          next_attempt_at: string
          picked_at: string | null
          provider: string
          status: string
          storage_path: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "media_fetch_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_outbound_message_by_id: {
        Args: { _id: string }
        Returns: {
          client_id: string
          company_id: string
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          max_attempts: number
          next_attempt_at: string
          payload: Json
          picked_at: string | null
          processed_at: string | null
          provider: string
          provider_message_id: string | null
          retry_count: number
          status: string
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "outbound_message_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_outbound_messages: {
        Args: { _limit?: number }
        Returns: {
          client_id: string
          company_id: string
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          max_attempts: number
          next_attempt_at: string
          payload: Json
          picked_at: string | null
          processed_at: string | null
          provider: string
          provider_message_id: string | null
          retry_count: number
          status: string
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "outbound_message_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_webhook_inbox: {
        Args: { _limit?: number }
        Returns: {
          created_at: string
          error: string | null
          event_type: string | null
          headers: Json
          id: string
          instance_name: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          picked_at: string | null
          processed_at: string | null
          processing_duration_ms: number | null
          processing_started_at: string | null
          provider: string
          received_at: string
          retry_count: number
          signature_verified: boolean
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "webhook_inbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_webhook_retries: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          company_id: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          max_attempts: number
          message_id: string | null
          next_attempt_at: string
          payload: Json
          picked_at: string | null
          provider: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "webhook_retry_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      classify_dre_section: {
        Args: {
          _is_direct_cost: boolean
          _is_operational: boolean
          _kind: string
          _name: string
        }
        Returns: Database["public"]["Enums"]["dre_section"]
      }
      cleanup_asaas_logs: { Args: never; Returns: number }
      close_attendance_ticket: {
        Args: {
          _notes?: string
          _reason: string
          _skip_rating?: boolean
          _ticket_id: string
        }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          category: string | null
          channel: string
          close_notes: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          contact_name: string | null
          contact_phone: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          lead_id: string | null
          priority: string
          priority_color: string | null
          rating_deadline: string | null
          reopened_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_lead_payment: {
        Args: {
          _installments?: number
          _invoice_number?: string
          _lead_id: string
          _method: string
          _notes?: string
          _reference?: string
        }
        Returns: Json
      }
      contacts_normalize_phone: { Args: { p: string }; Returns: string }
      count_company_demo_data: { Args: { p_company_id: string }; Returns: Json }
      create_attendance_ticket: {
        Args: {
          _assigned_to?: string
          _category?: string
          _contact_name?: string
          _contact_phone?: string
          _conversation_id: string
          _lead_id?: string
          _priority?: string
        }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          category: string | null
          channel: string
          close_notes: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          contact_name: string | null
          contact_phone: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          lead_id: string | null
          priority: string
          priority_color: string | null
          rating_deadline: string | null
          reopened_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_manual_conversation: {
        Args: {
          _contact_id?: string
          _contact_name: string
          _contact_photo_url?: string
          _instance_id: string
          _instance_name: string
          _phone: string
          _provider: string
          _remote_jid: string
        }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          closed_at: string | null
          company_id: string
          contact_id: string | null
          contact_name: string | null
          contact_photo_url: string | null
          contact_storage_path: string | null
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string
          is_archived: boolean
          is_demo: boolean
          last_message_at: string | null
          last_message_text: string | null
          lead_id: string | null
          phone: string
          provider: string
          remote_jid: string
          unread_count: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_company_demo_data: {
        Args: { p_company_id: string }
        Returns: Json
      }
      detect_phantom_sends: {
        Args: { _hours?: number }
        Returns: {
          attempt_id: string
          body_preview: string
          company_id: string
          conversation_id: string
          created_at: string
          feature_enabled_now: boolean
          message_kind: string
          origin: string
          phase: string
          skip_reason: string
        }[]
      }
      enqueue_coexistence_history_chunk: {
        Args: {
          _chunk_index: number
          _company_id: string
          _instance_id: string
          _payload: Json
          _phase: number
        }
        Returns: string
      }
      enqueue_media_fetch_job: {
        Args: {
          _company_id: string
          _instance_id: string
          _media_id: string
          _media_mimetype?: string
          _media_type: string
          _message_id: string
          _provider?: string
        }
        Returns: string
      }
      enqueue_outbound_message: {
        Args: {
          _client_id: string
          _conversation_id: string
          _payload: Json
          _provider: string
        }
        Returns: {
          client_id: string
          company_id: string
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          max_attempts: number
          next_attempt_at: string
          payload: Json
          picked_at: string | null
          processed_at: string | null
          provider: string
          provider_message_id: string | null
          retry_count: number
          status: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "outbound_message_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enqueue_webhook_event: {
        Args: { _company_id: string; _event: string; _payload: Json }
        Returns: undefined
      }
      enqueue_webhook_retry: {
        Args: {
          _company_id: string
          _initial_error?: string
          _kind: string
          _message_id: string
          _payload: Json
          _provider: string
        }
        Returns: string
      }
      enroll_lead_in_sequence: {
        Args: { _lead_id: string; _sequence_id: string; _started_by?: string }
        Returns: string
      }
      ensure_dre_system_category: {
        Args: {
          _company_id: string
          _is_direct_cost?: boolean
          _is_operational?: boolean
          _kind: string
          _name: string
          _section: Database["public"]["Enums"]["dre_section"]
        }
        Returns: string
      }
      ensure_financial_seed: {
        Args: { _company_id: string }
        Returns: undefined
      }
      exec_admin_sql: { Args: { sql: string }; Returns: Json }
      fin_actor_name: { Args: { _uid: string }; Returns: string }
      financial_mark_paid: {
        Args: {
          _entry_id: string
          _paid_amount?: number
          _paid_at?: string
          _payment_method?: string
        }
        Returns: string
      }
      get_ai_addon_usage: {
        Args: {
          _company_id: string
          _period_end?: string
          _period_start?: string
        }
        Returns: Json
      }
      get_alert_cron_frequencies: {
        Args: never
        Returns: {
          active: boolean
          job_key: string
          jobname: string
          minutes: number
          schedule: string
        }[]
      }
      get_alert_cron_metrics: {
        Args: { _window_minutes?: number }
        Returns: {
          avg_duration_ms: number
          errors: number
          job_key: string
          last_duration_ms: number
          last_run_at: string
          max_duration_ms: number
          runs: number
          source: string
          total_processed: number
          totals: Json
        }[]
      }
      get_alert_cron_status: {
        Args: never
        Returns: {
          active: boolean
          job_key: string
          jobname: string
          last_run_at: string
          last_run_duration_ms: number
          last_run_message: string
          last_run_status: string
          schedule: string
        }[]
      }
      get_attendance_messages_by_hour: {
        Args: {
          _agent_id?: string
          _company_id?: string
          _from?: string
          _to?: string
        }
        Returns: Json
      }
      get_attendance_reports: {
        Args: {
          _agent_id?: string
          _company_id?: string
          _from?: string
          _to?: string
        }
        Returns: Json
      }
      get_budget_overview: {
        Args: {
          _assigned_to?: string
          _period_end: string
          _period_start: string
          _pipeline_id?: string
        }
        Returns: Json
      }
      get_companies_due_for_billing: {
        Args: never
        Returns: {
          company_id: string
          run_hour: number
          tz: string
        }[]
      }
      get_company_growth: {
        Args: { _company_id: string; _days?: number }
        Returns: Json
      }
      get_company_plan_limits: {
        Args: { _company_id: string }
        Returns: {
          max_leads: number
          max_pipelines: number
          max_users: number
          max_whatsapp_instances: number
        }[]
      }
      get_company_plan_usage: {
        Args: { _company_id: string }
        Returns: {
          instances_count: number
          leads_count: number
          pending_invites_count: number
          pipelines_count: number
          users_count: number
        }[]
      }
      get_company_trial_info: {
        Args: { _company_id: string }
        Returns: {
          days_left: number
          expired: boolean
          hours_left: number
          plan_status: string
          trial_ends_at: string
        }[]
      }
      get_company_usage_overview: { Args: never; Returns: Json }
      get_database_overview: { Args: never; Returns: Json }
      get_dre_comparison: {
        Args: {
          _basis?: string
          _company_id: string
          _filters?: Json
          _period_end: string
          _period_start: string
        }
        Returns: Json
      }
      get_dre_drill_down: {
        Args: {
          _basis?: string
          _category_id: string
          _company_id: string
          _period_end: string
          _period_start: string
          _section: Database["public"]["Enums"]["dre_section"]
        }
        Returns: {
          amount: number
          category_name: string
          description: string
          due_date: string
          id: string
          lead_id: string
          metadata: Json
          net_amount: number
          paid_at: string
          party_name: string
          status: string
        }[]
      }
      get_dre_insights: {
        Args: {
          _basis?: string
          _company_id: string
          _filters?: Json
          _period_end: string
          _period_start: string
        }
        Returns: Json
      }
      get_dre_report: {
        Args: {
          _basis?: string
          _company_id: string
          _filters?: Json
          _period_end: string
          _period_start: string
        }
        Returns: Json
      }
      get_evolution_proxy_metrics: {
        Args: { _company_id?: string; _hours?: number }
        Returns: {
          avg_latency_ms: number
          company_id: string
          company_name: string
          error_rate: number
          errors: number
          instance_name: string
          last_event_at: string
          network_errors: number
          not_found: number
          not_found_rate: number
          p95_latency_ms: number
          rate_limited: number
          server_error_rate: number
          server_errors: number
          total_calls: number
        }[]
      }
      get_finance_pending_receivables: {
        Args: never
        Returns: {
          pending_count: number
          pending_value: number
        }[]
      }
      get_financial_dashboard: {
        Args: {
          _assigned_to?: string
          _company_id: string
          _date_from?: string
          _date_to?: string
          _pipeline_id?: string
        }
        Returns: Json
      }
      get_financial_overview: {
        Args: {
          _company_id: string
          _date_from?: string
          _date_to?: string
          _pipeline_id?: string
        }
        Returns: Json
      }
      get_goal_progress: {
        Args: {
          p_metric: string
          p_period_end: string
          p_period_start: string
          p_pipeline_id: string
          p_user_ids: string[]
        }
        Returns: number
      }
      get_jobs_metrics: { Args: { window_minutes?: number }; Returns: Json }
      get_master_ai_overview: {
        Args: {
          _from: string
          _prev_from: string
          _prev_to: string
          _to: string
        }
        Returns: Json
      }
      get_master_won_lost_overview: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_medical_cross_insights: {
        Args: {
          p_doctor_id?: string
          p_from: string
          p_practice_id: string
          p_procedure_id?: string
          p_to: string
        }
        Returns: Json
      }
      get_medical_dashboard_series: {
        Args: {
          p_doctor_id?: string
          p_from: string
          p_practice_id: string
          p_procedure_id?: string
          p_to: string
        }
        Returns: Json
      }
      get_medical_kpis: {
        Args: {
          p_doctor_id?: string
          p_from: string
          p_practice_id: string
          p_procedure_id?: string
          p_to: string
        }
        Returns: Json
      }
      get_medical_pie_breakdowns: {
        Args: {
          p_doctor_id?: string
          p_from?: string
          p_practice_id: string
          p_procedure_id?: string
          p_to?: string
        }
        Returns: Json
      }
      get_message_audit_list: {
        Args: {
          _company_id: string
          _conversation_id?: string
          _direction?: string
          _from_ts?: string
          _lead_id?: string
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
          _to_ts?: string
        }
        Returns: {
          company_id: string
          content: string
          conversation_id: string
          created_at: string
          events_count: number
          from_me: boolean
          id: string
          lead_id: string
          lead_name: string
          message_id: string
          message_type: string
          provider: string
          provider_message_id: string
          remote_jid: string
          sender_name: string
          status: string
          sync_error: string
          timestamp: string
          total_count: number
          webhook_received_at: string
        }[]
      }
      get_message_audit_timeline: {
        Args: { _message_pk: string }
        Returns: Json
      }
      get_messaging_health_metrics: { Args: never; Returns: Json }
      get_pending_supervisor_alerts: {
        Args: never
        Returns: {
          assigned_name: string
          assigned_to: string
          company_id: string
          contact_name: string
          contact_phone: string
          minutes_silent: number
          threshold_minutes: number
          ticket_code: string
          ticket_id: string
        }[]
      }
      get_pipeline_performance_report:
        | {
            Args: {
              _company_id: string
              _from: string
              _pipeline_id?: string
              _to: string
            }
            Returns: Json
          }
        | {
            Args: {
              _company_id: string
              _from: string
              _loss_reason_id?: string
              _pipeline_id?: string
              _status?: string
              _to: string
              _user_id?: string
            }
            Returns: Json
          }
      get_pipeline_totals: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_pipeline_id: string
        }
        Returns: {
          count_lost: number
          count_open: number
          count_total: number
          count_won: number
          stage_id: string
          stage_name: string
          stage_position: number
          stage_type: string
          sum_lost: number
          sum_open: number
          sum_total: number
          sum_won: number
        }[]
      }
      get_platform_mrr: { Args: never; Returns: number }
      get_trial_reminder_targets: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          hours_left: number
          needs_12h_reminder: boolean
          needs_6h_reminder: boolean
          needs_expired_reminder: boolean
          trial_ends_at: string
        }[]
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_rankings: {
        Args: { _period_end: string; _period_start: string }
        Returns: {
          avatar_url: string
          conversions_count: number
          email: string
          full_name: string
          joined_at: string
          leads_count: number
          prev_conversions_count: number
          prev_leads_count: number
          prev_responses_count: number
          prev_value_won: number
          responses_count: number
          role: string
          target_conversions: number
          target_leads: number
          target_value: number
          user_id: string
          value_won: number
        }[]
      }
      get_user_unread_conversations_count: { Args: never; Returns: number }
      get_webhook_inbox_metrics: {
        Args: { _window_minutes?: number }
        Returns: {
          avg_duration_ms: number
          cnt: number
          max_age_seconds: number
          p95_duration_ms: number
          provider: string
          status: string
        }[]
      }
      get_webhook_retry_stats: { Args: { _company_id?: string }; Returns: Json }
      get_webhook_secret_plaintext: {
        Args: { _webhook_id: string }
        Returns: string
      }
      has_financial_access: { Args: { _company_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_outbound_retry: { Args: { _id: string }; Returns: undefined }
      is_ai_agent_enabled: { Args: { _company_id: string }; Returns: boolean }
      is_automations_enabled: {
        Args: { _company_id: string }
        Returns: boolean
      }
      is_company_active: { Args: { _company_id: string }; Returns: boolean }
      is_company_admin: { Args: { _user_id: string }; Returns: boolean }
      is_company_finance: { Args: { _user_id: string }; Returns: boolean }
      is_company_manager: { Args: { _user_id: string }; Returns: boolean }
      is_master: { Args: { _user_id: string }; Returns: boolean }
      is_off_business_hours: { Args: { _company_id: string }; Returns: boolean }
      is_off_business_hours_at: {
        Args: { _at: string; _business_hours: Json; _holidays: Json }
        Returns: boolean
      }
      is_pipeline_member: {
        Args: { _pipeline_id: string; _user_id: string }
        Returns: boolean
      }
      lead_is_closed:
        | {
            Args: {
              _stage_type: string
              _status: Database["public"]["Enums"]["lead_status"]
            }
            Returns: boolean
          }
        | { Args: { _stage_type: string; _status: string }; Returns: boolean }
      lead_is_lost:
        | {
            Args: {
              _stage_type: string
              _status: Database["public"]["Enums"]["lead_status"]
            }
            Returns: boolean
          }
        | { Args: { _stage_type: string; _status: string }; Returns: boolean }
      lead_is_won:
        | {
            Args: {
              _stage_type: string
              _status: Database["public"]["Enums"]["lead_status"]
            }
            Returns: boolean
          }
        | { Args: { _stage_type: string; _status: string }; Returns: boolean }
      lead_realized_value: {
        Args: { _net_value: number; _value: number }
        Returns: number
      }
      list_lead_budgets: {
        Args: {
          _assigned_to?: string
          _limit?: number
          _offset?: number
          _order_by?: string
          _order_dir?: string
          _period_end: string
          _period_start: string
          _pipeline_id?: string
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      log_ai_agent_history: {
        Args: { _agent_id: string; _change_summary?: string }
        Returns: string
      }
      log_conversation_access: {
        Args: {
          _access_type: string
          _conversation_id?: string
          _message_count?: number
          _metadata?: Json
        }
        Returns: string
      }
      log_instance_sync: {
        Args: { _instance_name: string; _phone: string; _success: boolean }
        Returns: undefined
      }
      mark_all_conversations_read: {
        Args: { _conversation_ids?: string[] }
        Returns: number
      }
      mark_chat_side_effect_done: { Args: { _id: string }; Returns: undefined }
      mark_chat_side_effect_failed: {
        Args: { _error: string; _id: string }
        Returns: string
      }
      mark_chat_side_effect_skipped: {
        Args: { _id: string; _reason?: string }
        Returns: undefined
      }
      mark_conversation_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      mark_invoice_overdue: {
        Args: { _asaas_payment_id: string }
        Returns: undefined
      }
      mark_media_fetch_done: {
        Args: { _id: string; _path: string }
        Returns: undefined
      }
      mark_media_fetch_failed: {
        Args: { _error: string; _id: string }
        Returns: string
      }
      mark_outbound_failed:
        | { Args: { _error: string; _id: string }; Returns: string }
        | {
            Args: { _already_sent?: boolean; _error: string; _id: string }
            Returns: string
          }
      mark_outbound_sent: {
        Args: { _id: string; _provider_message_id: string }
        Returns: undefined
      }
      mark_stale_users_offline: { Args: never; Returns: number }
      mark_webhook_inbox_done: { Args: { _id: string }; Returns: undefined }
      mark_webhook_inbox_failed: {
        Args: { _error: string; _id: string }
        Returns: string
      }
      mark_webhook_retry_done: { Args: { _id: string }; Returns: undefined }
      mark_webhook_retry_failed: {
        Args: { _error: string; _id: string }
        Returns: string
      }
      match_ai_knowledge: {
        Args: {
          _agent_id: string
          _document_ids?: string[]
          _match_count?: number
          _min_similarity?: number
          _query_embedding: string
        }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          file_name: string
          similarity: number
        }[]
      }
      merge_contacts: {
        Args: { duplicate_id: string; primary_id: string }
        Returns: undefined
      }
      next_invoice_number: { Args: never; Returns: string }
      notify_today_birthdays: {
        Args: never
        Returns: {
          contacts_processed: number
          notifications_created: number
        }[]
      }
      pick_reopen_assignee:
        | { Args: { _conversation_id: string }; Returns: string }
        | {
            Args: { _conversation_id: string; _preferred_user_id?: string }
            Returns: string
          }
      pick_triage_assignee: {
        Args: { _company_id: string; _instance_id: string; _mode: string }
        Returns: string
      }
      pipeline_has_members: { Args: { _pipeline_id: string }; Returns: boolean }
      presence_heartbeat: { Args: never; Returns: undefined }
      presence_set_offline: { Args: never; Returns: undefined }
      purge_chat_message_payloads: {
        Args: { _retention_days?: number }
        Returns: {
          updated: number
        }[]
      }
      reactivate_my_subscription: {
        Args: never
        Returns: {
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          asaas_subscription_id: string | null
          billing_cycle: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          card_brand: string | null
          card_last4: string | null
          company_id: string
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          monthly_price: number
          next_due_date: string | null
          payment_method: string | null
          pending_billing_cycle: string | null
          pending_plan_id: string | null
          plan_id: string | null
          plan_name: string
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_provider_outcome: {
        Args: {
          p_company_id: string
          p_error?: string
          p_provider: string
          p_success: boolean
        }
        Returns: undefined
      }
      record_ticket_rating_request: {
        Args: { _ticket_id: string }
        Returns: {
          comment: string | null
          company_id: string
          created_at: string
          id: string
          raw_response: string | null
          requested_at: string
          responded_at: string | null
          response_window_hours: number
          scale: string
          score: number | null
          status: string
          ticket_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_ticket_ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_lead_discount: {
        Args: {
          _discount_amount?: number
          _discount_pct?: number
          _lead_id: string
          _password?: string
          _reason?: string
        }
        Returns: Json
      }
      release_lead_procedure_discount: {
        Args: {
          _discount_amount?: number
          _discount_pct?: number
          _password?: string
          _proc_id: string
          _reason?: string
        }
        Returns: Json
      }
      remove_team_member: { Args: { _user_id: string }; Returns: undefined }
      render_template: {
        Args: { _body: string; _lead_id: string }
        Returns: string
      }
      renew_due_subscriptions: { Args: never; Returns: number }
      renew_subscription: {
        Args: { _subscription_id: string }
        Returns: undefined
      }
      reopen_attendance_ticket: {
        Args: { _ticket_id: string }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          category: string | null
          channel: string
          close_notes: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          contact_name: string | null
          contact_phone: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          lead_id: string | null
          priority: string
          priority_color: string | null
          rating_deadline: string | null
          reopened_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reorder_pipeline_stages: { Args: { p_ids: string[] }; Returns: undefined }
      reseed_company_demo: {
        Args: { p_company_id: string; p_days?: number }
        Returns: Json
      }
      retry_webhook_now: { Args: { _id: string }; Returns: undefined }
      run_chat_side_effect: {
        Args: { _chat_message_id: string; _effect_type: string }
        Returns: undefined
      }
      run_log_retention: {
        Args: never
        Returns: {
          moved: number
          purged: number
          table_name: string
        }[]
      }
      run_system_health_check: { Args: never; Returns: Json }
      search_chat_history: {
        Args: {
          p_from?: string
          p_limit?: number
          p_mode?: string
          p_offset?: number
          p_only_attachments?: boolean
          p_query?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          contact_name: string
          contact_photo_url: string
          conv_closed_at: string
          conversation_id: string
          last_message_at: string
          lead_id: string
          match_count: number
          phone: string
          snippets: Json
          ticket_assigned_to: string
          ticket_status: string
          unread_count: number
        }[]
      }
      seed_company_demo_data: { Args: { p_company_id: string }; Returns: Json }
      seed_company_realistic: {
        Args: { p_company_id: string; p_days?: number }
        Returns: Json
      }
      seed_default_lead_sources: {
        Args: { _company_id: string }
        Returns: undefined
      }
      set_alert_cron_frequency: {
        Args: { _job: string; _minutes: number }
        Returns: Json
      }
      set_chat_message_status: {
        Args: { _company_id: string; _message_id: string; _status: string }
        Returns: string
      }
      set_company_vertical: {
        Args: { p_company_id: string; p_vertical: string }
        Returns: string
      }
      set_webhook_secret: {
        Args: { _plaintext: string; _webhook_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_ticket_rating: {
        Args: {
          _comment?: string
          _raw_response?: string
          _score: number
          _ticket_id: string
        }
        Returns: {
          comment: string | null
          company_id: string
          created_at: string
          id: string
          raw_response: string | null
          requested_at: string
          responded_at: string | null
          response_window_hours: number
          scale: string
          score: number | null
          status: string
          ticket_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_ticket_ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      suggest_goal_target: {
        Args: {
          p_metric: string
          p_period_days: number
          p_pipeline_id: string
          p_user_ids: string[]
        }
        Returns: Json
      }
      sync_asaas_payment_to_lead: {
        Args: {
          _company_id: string
          _customer: Json
          _event: string
          _payment: Json
        }
        Returns: string
      }
      transfer_attendance_ticket: {
        Args: { _reason?: string; _ticket_id: string; _to_user_id: string }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          category: string | null
          channel: string
          close_notes: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          contact_name: string | null
          contact_phone: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          lead_id: string | null
          priority: string
          priority_color: string | null
          rating_deadline: string | null
          reopened_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      try_consume_provider_token: {
        Args: { p_company_id: string; p_cost?: number; p_provider: string }
        Returns: Json
      }
      update_lead_finance: {
        Args: { _lead_id: string; _patch: Json }
        Returns: Json
      }
      update_lead_procedure_discount: {
        Args: { _amount?: number; _pct?: number; _proc_id: string }
        Returns: Json
      }
      user_can_view_conversation: {
        Args: {
          _company_id: string
          _instance_id: string
          _lead_id: string
          _user_id: string
        }
        Returns: boolean
      }
      user_can_view_conversation_v2: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_instance_access: {
        Args: { _instance_id: string; _user_id: string }
        Returns: boolean
      }
      validate_user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      wipe_company_operational: {
        Args: { p_company_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "master" | "admin" | "agente" | "financeiro" | "gestor"
      appointment_reminder_kind:
        | "client_reminder"
        | "pro_daily_report"
        | "feedback_email"
      appointment_reminder_status: "pending" | "sent" | "failed" | "cancelled"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      dre_section:
        | "receita_consultas"
        | "receita_procedimentos"
        | "receita_cirurgias"
        | "receita_memberships"
        | "receita_convenios"
        | "receita_particular"
        | "receita_outros"
        | "deducao_glosas"
        | "deducao_cancelamentos"
        | "deducao_estornos"
        | "deducao_descontos"
        | "custo_comissao_medica"
        | "custo_materiais"
        | "custo_laboratorio"
        | "custo_equipamentos"
        | "custo_apis"
        | "custo_infraestrutura"
        | "custo_whatsapp"
        | "custo_ia"
        | "despesa_administrativo"
        | "despesa_comercial"
        | "despesa_marketing"
        | "despesa_rh"
        | "despesa_tecnologia"
        | "despesa_atendimento"
        | "despesa_financeiro"
        | "resultado_juros"
        | "resultado_tarifas"
        | "resultado_iof"
        | "resultado_antecipacao"
        | "impostos"
      lead_activity_type:
        | "lead_created"
        | "lead_transferred"
        | "field_updated"
        | "tag_added"
        | "tag_removed"
        | "attachment_added"
        | "attachment_removed"
        | "stage_changed"
        | "note_added"
        | "message_scheduled"
        | "message_sent"
        | "lead_won"
        | "lead_lost"
        | "lead_reopened"
        | "name_updated"
        | "contact_linked"
        | "contact_changed"
        | "contact_unlinked"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      message_status: "pending" | "sent" | "failed" | "cancelled"
      pipeline_stage_type: "open" | "won" | "lost"
      plan_status: "active" | "trial" | "suspended" | "cancelled"
      sequence_trigger_type:
        | "manual"
        | "lead_created"
        | "stage_changed"
        | "tag_added"
      ticket_status:
        | "open"
        | "in_progress"
        | "closed"
        | "reopened"
        | "awaiting_rating"
      webhook_audit_status: "received" | "processed" | "failed" | "ignored"
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
      app_role: ["master", "admin", "agente", "financeiro", "gestor"],
      appointment_reminder_kind: [
        "client_reminder",
        "pro_daily_report",
        "feedback_email",
      ],
      appointment_reminder_status: ["pending", "sent", "failed", "cancelled"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      dre_section: [
        "receita_consultas",
        "receita_procedimentos",
        "receita_cirurgias",
        "receita_memberships",
        "receita_convenios",
        "receita_particular",
        "receita_outros",
        "deducao_glosas",
        "deducao_cancelamentos",
        "deducao_estornos",
        "deducao_descontos",
        "custo_comissao_medica",
        "custo_materiais",
        "custo_laboratorio",
        "custo_equipamentos",
        "custo_apis",
        "custo_infraestrutura",
        "custo_whatsapp",
        "custo_ia",
        "despesa_administrativo",
        "despesa_comercial",
        "despesa_marketing",
        "despesa_rh",
        "despesa_tecnologia",
        "despesa_atendimento",
        "despesa_financeiro",
        "resultado_juros",
        "resultado_tarifas",
        "resultado_iof",
        "resultado_antecipacao",
        "impostos",
      ],
      lead_activity_type: [
        "lead_created",
        "lead_transferred",
        "field_updated",
        "tag_added",
        "tag_removed",
        "attachment_added",
        "attachment_removed",
        "stage_changed",
        "note_added",
        "message_scheduled",
        "message_sent",
        "lead_won",
        "lead_lost",
        "lead_reopened",
        "name_updated",
        "contact_linked",
        "contact_changed",
        "contact_unlinked",
      ],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      message_status: ["pending", "sent", "failed", "cancelled"],
      pipeline_stage_type: ["open", "won", "lost"],
      plan_status: ["active", "trial", "suspended", "cancelled"],
      sequence_trigger_type: [
        "manual",
        "lead_created",
        "stage_changed",
        "tag_added",
      ],
      ticket_status: [
        "open",
        "in_progress",
        "closed",
        "reopened",
        "awaiting_rating",
      ],
      webhook_audit_status: ["received", "processed", "failed", "ignored"],
    },
  },
} as const
