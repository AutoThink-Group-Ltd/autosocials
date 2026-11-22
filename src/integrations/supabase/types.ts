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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      platform_alert_log: {
        Row: { alert_date: string; alert_type: string; created_at: string; details: Json }
        Insert: { alert_date: string; alert_type: string; created_at?: string; details?: Json }
        Update: { alert_date?: string; alert_type?: string; created_at?: string; details?: Json }
        Relationships: []
      }
      agency_activity_log: {
        Row: {
          action_label: string
          action_type: string
          actor_user_id: string
          agency_user_id: string
          client_name: string | null
          created_at: string | null
          details: Json | null
          id: string
          workspace_id: string | null
        }
        Insert: {
          action_label: string
          action_type: string
          actor_user_id: string
          agency_user_id: string
          client_name?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          workspace_id?: string | null
        }
        Update: {
          action_label?: string
          action_type?: string
          actor_user_id?: string
          agency_user_id?: string
          client_name?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_digests: {
        Row: {
          additional_to_emails: string[] | null
          agency_client_id: string
          agency_user_id: string
          bcc_emails: string[] | null
          cc_emails: string[] | null
          created_at: string | null
          custom_intro_text: string | null
          id: string
          include_campaign_breakdown: boolean | null
          include_deliverability: boolean | null
          is_enabled: boolean | null
          last_sent_at: string | null
          next_send_at: string | null
          recipient_email: string
          recipient_name: string | null
          schedule: string | null
          schedule_day: number | null
          schedule_hour: number | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          additional_to_emails?: string[] | null
          agency_client_id: string
          agency_user_id: string
          bcc_emails?: string[] | null
          cc_emails?: string[] | null
          created_at?: string | null
          custom_intro_text?: string | null
          id?: string
          include_campaign_breakdown?: boolean | null
          include_deliverability?: boolean | null
          is_enabled?: boolean | null
          last_sent_at?: string | null
          next_send_at?: string | null
          recipient_email: string
          recipient_name?: string | null
          schedule?: string | null
          schedule_day?: number | null
          schedule_hour?: number | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          additional_to_emails?: string[] | null
          agency_client_id?: string
          agency_user_id?: string
          bcc_emails?: string[] | null
          cc_emails?: string[] | null
          created_at?: string | null
          custom_intro_text?: string | null
          id?: string
          include_campaign_breakdown?: boolean | null
          include_deliverability?: boolean | null
          is_enabled?: boolean | null
          last_sent_at?: string | null
          next_send_at?: string | null
          recipient_email?: string
          recipient_name?: string | null
          schedule?: string | null
          schedule_day?: number | null
          schedule_hour?: number | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_digests_agency_client_id_fkey"
            columns: ["agency_client_id"]
            isOneToOne: false
            referencedRelation: "agency_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_digests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_invitations: {
        Row: {
          accepted_at: string | null
          agency_user_id: string
          client_company_name: string | null
          client_user_id: string | null
          contact_name: string | null
          created_at: string | null
          email: string
          id: string
          invitation_type: string | null
          link_last_opened_at: string | null
          link_opened_count: number | null
          notifications_sent: boolean | null
          permissions: Json | null
          role: string | null
          sent_at: string | null
          status: string | null
          token: string | null
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          agency_user_id: string
          client_company_name?: string | null
          client_user_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          email: string
          id?: string
          invitation_type?: string | null
          link_last_opened_at?: string | null
          link_opened_count?: number | null
          notifications_sent?: boolean | null
          permissions?: Json | null
          role?: string | null
          sent_at?: string | null
          status?: string | null
          token?: string | null
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          agency_user_id?: string
          client_company_name?: string | null
          client_user_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invitation_type?: string | null
          link_last_opened_at?: string | null
          link_opened_count?: number | null
          notifications_sent?: boolean | null
          permissions?: Json | null
          role?: string | null
          sent_at?: string | null
          status?: string | null
          token?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_links: {
        Row: {
          agency_client_id: string | null
          agency_user_id: string
          client_user_id: string | null
          connected_at: string | null
          created_at: string | null
          disconnected_at: string | null
          id: string
          status: string | null
          workspace_id: string
        }
        Insert: {
          agency_client_id?: string | null
          agency_user_id: string
          client_user_id?: string | null
          connected_at?: string | null
          created_at?: string | null
          disconnected_at?: string | null
          id?: string
          status?: string | null
          workspace_id: string
        }
        Update: {
          agency_client_id?: string | null
          agency_user_id?: string
          client_user_id?: string | null
          connected_at?: string | null
          created_at?: string | null
          disconnected_at?: string | null
          id?: string
          status?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_links_agency_client_id_fkey"
            columns: ["agency_client_id"]
            isOneToOne: false
            referencedRelation: "agency_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_clients: {
        Row: {
          workspace_kind: string
          agency_user_id: string
          social_profiles: Json
          billing_notes: string | null
          client_contact_email: string | null
          client_contact_name: string | null
          client_name: string
          client_user_id: string | null
          commission_rate: number | null
          created_at: string | null
          disconnected_at: string | null
          disconnected_by: string | null
          id: string
          monthly_fee: number | null
          onboarded_at: string | null
          status: string | null
          subscription_plan_key: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          workspace_kind?: string
          agency_user_id: string
          social_profiles?: Json
          billing_notes?: string | null
          client_contact_email?: string | null
          client_contact_name?: string | null
          client_name: string
          client_user_id?: string | null
          commission_rate?: number | null
          created_at?: string | null
          disconnected_at?: string | null
          disconnected_by?: string | null
          id?: string
          monthly_fee?: number | null
          onboarded_at?: string | null
          status?: string | null
          subscription_plan_key?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          workspace_kind?: string
          agency_user_id?: string
          social_profiles?: Json
          billing_notes?: string | null
          client_contact_email?: string | null
          client_contact_name?: string | null
          client_name?: string
          client_user_id?: string | null
          commission_rate?: number | null
          created_at?: string | null
          disconnected_at?: string | null
          disconnected_by?: string | null
          id?: string
          monthly_fee?: number | null
          onboarded_at?: string | null
          status?: string | null
          subscription_plan_key?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_commissions: {
        Row: {
          agency_client_id: string | null
          agency_user_id: string
          billing_period: string | null
          client_user_id: string
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          currency: string | null
          id: string
          invoice_amount: number | null
          invoice_date: string | null
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          plan_key: string | null
          status: string | null
          stripe_charge_id: string | null
          stripe_invoice_id: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          agency_client_id?: string | null
          agency_user_id: string
          billing_period?: string | null
          client_user_id: string
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          plan_key?: string | null
          status?: string | null
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          agency_client_id?: string | null
          agency_user_id?: string
          billing_period?: string | null
          client_user_id?: string
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          plan_key?: string | null
          status?: string | null
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_commissions_agency_client_id_fkey"
            columns: ["agency_client_id"]
            isOneToOne: false
            referencedRelation: "agency_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_commissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_employee_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          agency_user_id: string
          client_access: string | null
          client_ids: string[] | null
          created_at: string | null
          email: string
          expires_at: string | null
          full_name: string | null
          id: string
          link_last_opened_at: string | null
          link_opened_count: number | null
          role: string | null
          sent_at: string | null
          status: string | null
          token: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          agency_user_id: string
          client_access?: string | null
          client_ids?: string[] | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          full_name?: string | null
          id?: string
          link_last_opened_at?: string | null
          link_opened_count?: number | null
          role?: string | null
          sent_at?: string | null
          status?: string | null
          token?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          agency_user_id?: string
          client_access?: string | null
          client_ids?: string[] | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          full_name?: string | null
          id?: string
          link_last_opened_at?: string | null
          link_opened_count?: number | null
          role?: string | null
          sent_at?: string | null
          status?: string | null
          token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agency_employees: {
        Row: {
          agency_user_id: string
          client_access: string | null
          client_ids: string[] | null
          created_at: string | null
          email: string
          employee_user_id: string
          full_name: string | null
          id: string
          invitation_id: string | null
          is_active: boolean | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          agency_user_id: string
          client_access?: string | null
          client_ids?: string[] | null
          created_at?: string | null
          email: string
          employee_user_id: string
          full_name?: string | null
          id?: string
          invitation_id?: string | null
          is_active?: boolean | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_user_id?: string
          client_access?: string | null
          client_ids?: string[] | null
          created_at?: string | null
          email?: string
          employee_user_id?: string
          full_name?: string | null
          id?: string
          invitation_id?: string | null
          is_active?: boolean | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_employees_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "agency_employee_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_notification_preferences: {
        Row: {
          agency_user_id: string
          bcc_emails: string[] | null
          bcc_on_autopilot: boolean | null
          bcc_on_autopilot_notifications: boolean | null
          bcc_on_bounces: boolean | null
          bcc_on_campaigns: boolean | null
          bcc_on_clicks: boolean | null
          bcc_on_dm_autopilot: boolean | null
          bcc_on_dm_autopilot_notifications: boolean | null
          bcc_on_dm_clicks: boolean | null
          bcc_on_follow_ups: boolean | null
          bcc_on_replies: boolean | null
          client_workspace_id: string
          created_at: string | null
          id: string
          mktg_on_autopilot: boolean | null
          mktg_on_autopilot_notifications: boolean | null
          mktg_on_bounces: boolean | null
          mktg_on_campaigns: boolean | null
          mktg_on_clicks: boolean | null
          mktg_on_follow_ups: boolean | null
          mktg_on_replies: boolean | null
          updated_at: string | null
        }
        Insert: {
          agency_user_id: string
          bcc_emails?: string[] | null
          bcc_on_autopilot?: boolean | null
          bcc_on_autopilot_notifications?: boolean | null
          bcc_on_bounces?: boolean | null
          bcc_on_campaigns?: boolean | null
          bcc_on_clicks?: boolean | null
          bcc_on_dm_autopilot?: boolean | null
          bcc_on_dm_autopilot_notifications?: boolean | null
          bcc_on_dm_clicks?: boolean | null
          bcc_on_follow_ups?: boolean | null
          bcc_on_replies?: boolean | null
          client_workspace_id: string
          created_at?: string | null
          id?: string
          mktg_on_autopilot?: boolean | null
          mktg_on_autopilot_notifications?: boolean | null
          mktg_on_bounces?: boolean | null
          mktg_on_campaigns?: boolean | null
          mktg_on_clicks?: boolean | null
          mktg_on_follow_ups?: boolean | null
          mktg_on_replies?: boolean | null
          updated_at?: string | null
        }
        Update: {
          agency_user_id?: string
          bcc_emails?: string[] | null
          bcc_on_autopilot?: boolean | null
          bcc_on_autopilot_notifications?: boolean | null
          bcc_on_bounces?: boolean | null
          bcc_on_campaigns?: boolean | null
          bcc_on_clicks?: boolean | null
          bcc_on_dm_autopilot?: boolean | null
          bcc_on_dm_autopilot_notifications?: boolean | null
          bcc_on_dm_clicks?: boolean | null
          bcc_on_follow_ups?: boolean | null
          bcc_on_replies?: boolean | null
          client_workspace_id?: string
          created_at?: string | null
          id?: string
          mktg_on_autopilot?: boolean | null
          mktg_on_autopilot_notifications?: boolean | null
          mktg_on_bounces?: boolean | null
          mktg_on_campaigns?: boolean | null
          mktg_on_clicks?: boolean | null
          mktg_on_follow_ups?: boolean | null
          mktg_on_replies?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_notification_preferences_client_workspace_id_fkey"
            columns: ["client_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_profiles: {
        Row: {
          agency_logo_url: string | null
          agency_name: string
          agency_website: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_iban: string | null
          bank_sort_code: string | null
          booking_url: string | null
          commission_rate: number | null
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          id: string
          notes: string | null
          notify_on_report_views: boolean | null
          payout_email: string | null
          payout_method: string | null
          paypal_email: string | null
          phone: string | null
          referral_code: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agency_logo_url?: string | null
          agency_name: string
          agency_website?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_iban?: string | null
          bank_sort_code?: string | null
          booking_url?: string | null
          commission_rate?: number | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          notify_on_report_views?: boolean | null
          payout_email?: string | null
          payout_method?: string | null
          paypal_email?: string | null
          phone?: string | null
          referral_code?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agency_logo_url?: string | null
          agency_name?: string
          agency_website?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_iban?: string | null
          bank_sort_code?: string | null
          booking_url?: string | null
          commission_rate?: number | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          notify_on_report_views?: boolean | null
          payout_email?: string | null
          payout_method?: string | null
          paypal_email?: string | null
          phone?: string | null
          referral_code?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agency_referral_clicks: {
        Row: {
          agency_profile_id: string
          clicked_at: string | null
          id: string
          ip_address: string | null
          referral_code: string
          referral_link_id: string | null
          referrer: string | null
          slug: string | null
          user_agent: string | null
        }
        Insert: {
          agency_profile_id: string
          clicked_at?: string | null
          id?: string
          ip_address?: string | null
          referral_code: string
          referral_link_id?: string | null
          referrer?: string | null
          slug?: string | null
          user_agent?: string | null
        }
        Update: {
          agency_profile_id?: string
          clicked_at?: string | null
          id?: string
          ip_address?: string | null
          referral_code?: string
          referral_link_id?: string | null
          referrer?: string | null
          slug?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_referral_clicks_agency_profile_id_fkey"
            columns: ["agency_profile_id"]
            isOneToOne: false
            referencedRelation: "agency_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_referral_clicks_referral_link_id_fkey"
            columns: ["referral_link_id"]
            isOneToOne: false
            referencedRelation: "agency_referral_links"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_referral_links: {
        Row: {
          agency_profile_id: string
          agency_user_id: string
          click_count: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string | null
          last_clicked_at: string | null
          signup_count: number | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          agency_profile_id: string
          agency_user_id: string
          click_count?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          last_clicked_at?: string | null
          signup_count?: number | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          agency_profile_id?: string
          agency_user_id?: string
          click_count?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          last_clicked_at?: string | null
          signup_count?: number | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_referral_links_agency_profile_id_fkey"
            columns: ["agency_profile_id"]
            isOneToOne: false
            referencedRelation: "agency_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_reports: {
        Row: {
          agency_client_id: string | null
          agency_user_id: string
          campaign_ids: string[] | null
          cc_emails: string[] | null
          created_at: string | null
          custom_message: string | null
          date_from: string | null
          date_to: string | null
          id: string
          is_active: boolean | null
          last_viewed_at: string | null
          sent_at: string | null
          sent_to: string[] | null
          title: string | null
          token: string | null
          updated_at: string | null
          view_count: number | null
          workspace_id: string
        }
        Insert: {
          agency_client_id?: string | null
          agency_user_id: string
          campaign_ids?: string[] | null
          cc_emails?: string[] | null
          created_at?: string | null
          custom_message?: string | null
          date_from?: string | null
          date_to?: string | null
          id?: string
          is_active?: boolean | null
          last_viewed_at?: string | null
          sent_at?: string | null
          sent_to?: string[] | null
          title?: string | null
          token?: string | null
          updated_at?: string | null
          view_count?: number | null
          workspace_id: string
        }
        Update: {
          agency_client_id?: string | null
          agency_user_id?: string
          campaign_ids?: string[] | null
          cc_emails?: string[] | null
          created_at?: string | null
          custom_message?: string | null
          date_from?: string | null
          date_to?: string | null
          id?: string
          is_active?: boolean | null
          last_viewed_at?: string | null
          sent_at?: string | null
          sent_to?: string[] | null
          title?: string | null
          token?: string | null
          updated_at?: string | null
          view_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_reports_agency_client_id_fkey"
            columns: ["agency_client_id"]
            isOneToOne: false
            referencedRelation: "agency_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_todos: {
        Row: {
          agency_user_id: string
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          agency_user_id: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          agency_user_id?: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_todos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "agency_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_usage_tracking: {
        Row: {
          agency_user_id: string
          campaigns_active: number
          created_at: string | null
          discoveries_run: number
          emails_sent: number
          id: string
          leads_count: number
          period_end: string
          period_start: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          agency_user_id: string
          campaigns_active?: number
          created_at?: string | null
          discoveries_run?: number
          emails_sent?: number
          id?: string
          leads_count?: number
          period_end: string
          period_start: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          agency_user_id?: string
          campaigns_active?: number
          created_at?: string | null
          discoveries_run?: number
          emails_sent?: number
          id?: string
          leads_count?: number
          period_end?: string
          period_start?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_usage_tracking_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_action_traces: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          intent: string
          outcome: string
          payload: Json
          risk_level: Database["public"]["Enums"]["agent_action_risk"]
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          intent: string
          outcome: string
          payload?: Json
          risk_level?: Database["public"]["Enums"]["agent_action_risk"]
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          intent?: string
          outcome?: string
          payload?: Json
          risk_level?: Database["public"]["Enums"]["agent_action_risk"]
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      agent_messages: {
        Row: {
          canvas_id: string | null
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          workspace_id: string
          api_data_expires_at: string | null
        }
        Insert: {
          canvas_id?: string | null
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          workspace_id: string
          api_data_expires_at?: string | null
        }
        Update: {
          canvas_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          workspace_id?: string
          api_data_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          cost_usd: number | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          parent_run_id: string | null
          prompt_version: string | null
          request: Json | null
          response: Json | null
          skill_id: string | null
          state: Database["public"]["Enums"]["agent_run_state"]
          updated_at: string
          user_id: string
          workflow_id: string | null
          workspace_id: string
        }
        Insert: {
          agent_id: string
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          parent_run_id?: string | null
          prompt_version?: string | null
          request?: Json | null
          response?: Json | null
          skill_id?: string | null
          state?: Database["public"]["Enums"]["agent_run_state"]
          updated_at?: string
          user_id: string
          workflow_id?: string | null
          workspace_id: string
        }
        Update: {
          agent_id?: string
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          parent_run_id?: string | null
          prompt_version?: string | null
          request?: Json | null
          response?: Json | null
          skill_id?: string | null
          state?: Database["public"]["Enums"]["agent_run_state"]
          updated_at?: string
          user_id?: string
          workflow_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_threads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          module: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          module: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          module?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      agent_trace_events: {
        Row: {
          cost_usd: number | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          inputs: Json | null
          kind: string
          latency_ms: number | null
          name: string | null
          ok: boolean | null
          outputs: Json | null
          run_id: string
          seq: number
          workspace_id: string
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          inputs?: Json | null
          kind: string
          latency_ms?: number | null
          name?: string | null
          ok?: boolean | null
          outputs?: Json | null
          run_id: string
          seq: number
          workspace_id: string
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          inputs?: Json | null
          kind?: string
          latency_ms?: number | null
          name?: string | null
          ok?: boolean | null
          outputs?: Json | null
          run_id?: string
          seq?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_trace_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_trace_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_system: boolean
          name: string
          parent_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          name: string
          parent_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          name?: string
          parent_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "asset_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      best_post_times: {
        Row: {
          day_of_week: number
          hour: number
          id: string
          platform: string
          score: number
          source: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          day_of_week: number
          hour: number
          id?: string
          platform: string
          score?: number
          source?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          day_of_week?: number
          hour?: number
          id?: string
          platform?: string
          score?: number
          source?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_post_times_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_contacts: {
        Row: {
          blocked_at: string | null
          created_at: string | null
          details: string | null
          email: string
          id: string
          reason: string
          workspace_id: string
        }
        Insert: {
          blocked_at?: string | null
          created_at?: string | null
          details?: string | null
          email: string
          id?: string
          reason?: string
          workspace_id: string
        }
        Update: {
          blocked_at?: string | null
          created_at?: string | null
          details?: string | null
          email?: string
          id?: string
          reason?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_asset_folders: {
        Row: {
          created_at: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_asset_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "brand_asset_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_facts: {
        Row: {
          banned_claims: string[]
          banned_colours: string[]
          does: string[]
          does_not: string[]
          sources: Json
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          banned_claims?: string[]
          banned_colours?: string[]
          does?: string[]
          does_not?: string[]
          sources?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          banned_claims?: string[]
          banned_colours?: string[]
          does?: string[]
          does_not?: string[]
          sources?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      brand_files: {
        Row: {
          ai_label: string | null
          ai_summary: string | null
          bg_tone: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          duration_s: number | null
          extracted_text: string | null
          folder_id: string | null
          has_alpha: boolean | null
          height: number | null
          id: string
          inspected_at: string | null
          kind: string
          labelled_at: string | null
          media_id: string | null
          media_role: string | null
          mime: string | null
          name: string
          size_bytes: number
          source: string
          storage_path: string
          subject: string | null
          transcript_status: string | null
          updated_at: string
          width: number | null
          workspace_id: string
        }
        Insert: {
          ai_label?: string | null
          ai_summary?: string | null
          bg_tone?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          duration_s?: number | null
          extracted_text?: string | null
          folder_id?: string | null
          has_alpha?: boolean | null
          height?: number | null
          id?: string
          inspected_at?: string | null
          kind?: string
          labelled_at?: string | null
          media_id?: string | null
          media_role?: string | null
          mime?: string | null
          name: string
          size_bytes?: number
          source?: string
          storage_path: string
          subject?: string | null
          transcript_status?: string | null
          updated_at?: string
          width?: number | null
          workspace_id: string
        }
        Update: {
          ai_label?: string | null
          ai_summary?: string | null
          bg_tone?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          duration_s?: number | null
          extracted_text?: string | null
          folder_id?: string | null
          has_alpha?: boolean | null
          height?: number | null
          id?: string
          inspected_at?: string | null
          kind?: string
          labelled_at?: string | null
          media_id?: string | null
          media_role?: string | null
          mime?: string | null
          name?: string
          size_bytes?: number
          source?: string
          storage_path?: string
          subject?: string | null
          transcript_status?: string | null
          updated_at?: string
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "asset_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_guidelines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          tokens: Json
          updated_at: string
          ux_principles: Json
          version: number
          voice: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          tokens?: Json
          updated_at?: string
          ux_principles?: Json
          version?: number
          voice?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          tokens?: Json
          updated_at?: string
          ux_principles?: Json
          version?: number
          voice?: Json
        }
        Relationships: []
      }
      brand_profiles: {
        Row: {
          profile: Json
          strength: number
          suggestions: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          profile?: Json
          strength?: number
          suggestions?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          profile?: Json
          strength?: number
          suggestions?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_releases: {
        Row: {
          agent: Json
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          published: boolean
          published_at: string | null
          tokens: Json
          version: string
          voice: Json
        }
        Insert: {
          agent?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published?: boolean
          published_at?: string | null
          tokens: Json
          version: string
          voice?: Json
        }
        Update: {
          agent?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published?: boolean
          published_at?: string | null
          tokens?: Json
          version?: string
          voice?: Json
        }
        Relationships: []
      }
      cancellation_events: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          details: string | null
          id: string
          plan_key: string | null
          reason: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          details?: string | null
          id?: string
          plan_key?: string | null
          reason?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          details?: string | null
          id?: string
          plan_key?: string | null
          reason?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      canvases: {
        Row: {
          archived: boolean
          blocks: Json
          created_at: string
          id: string
          module: string
          pinned: boolean
          title: string
          updated_at: string
          updated_by: string
          version: number
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          blocks?: Json
          created_at?: string
          id?: string
          module: string
          pinned?: boolean
          title: string
          updated_at?: string
          updated_by?: string
          version?: number
          workspace_id: string
        }
        Update: {
          archived?: boolean
          blocks?: Json
          created_at?: string
          id?: string
          module?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          updated_by?: string
          version?: number
          workspace_id?: string
        }
        Relationships: []
      }
      collaboration_cards: {
        Row: {
          column_id: string
          created_at: string | null
          creator_avatar_url: string | null
          creator_handle: string | null
          creator_list: string | null
          creator_name: string
          deal_value: number | null
          id: string
          notes: string | null
          position: number
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          column_id: string
          created_at?: string | null
          creator_avatar_url?: string | null
          creator_handle?: string | null
          creator_list?: string | null
          creator_name: string
          deal_value?: number | null
          id?: string
          notes?: string | null
          position?: number
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          column_id?: string
          created_at?: string | null
          creator_avatar_url?: string | null
          creator_handle?: string | null
          creator_list?: string | null
          creator_name?: string
          deal_value?: number | null
          id?: string
          notes?: string | null
          position?: number
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_cards_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "collaboration_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_cards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_columns: {
        Row: {
          color: string
          created_at: string | null
          id: string
          position: number
          title: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          position?: number
          title: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_columns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          action: string
          created_at: string | null
          id: string
          is_active: boolean | null
          match_value: string
          override_flat_fee: number | null
          override_percentage: number | null
          override_type: string | null
          position: number | null
          rule_type: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          action?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          match_value: string
          override_flat_fee?: number | null
          override_percentage?: number | null
          override_type?: string | null
          position?: number | null
          rule_type?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          match_value?: string
          override_flat_fee?: number | null
          override_percentage?: number | null
          override_type?: string | null
          position?: number | null
          rule_type?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settings: {
        Row: {
          commission_type: string
          created_at: string | null
          currency: string | null
          default_flat_fee: number | null
          default_percentage: number | null
          enable_tiers: boolean | null
          id: string
          notes: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          commission_type?: string
          created_at?: string | null
          currency?: string | null
          default_flat_fee?: number | null
          default_percentage?: number | null
          enable_tiers?: boolean | null
          id?: string
          notes?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          commission_type?: string
          created_at?: string | null
          currency?: string | null
          default_flat_fee?: number | null
          default_percentage?: number | null
          enable_tiers?: boolean | null
          id?: string
          notes?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_tiers: {
        Row: {
          commission_type: string
          created_at: string | null
          flat_fee: number | null
          id: string
          label: string | null
          max_followers: number | null
          min_followers: number
          percentage: number | null
          position: number | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          commission_type?: string
          created_at?: string | null
          flat_fee?: number | null
          id?: string
          label?: string | null
          max_followers?: number | null
          min_followers?: number
          percentage?: number | null
          position?: number | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          commission_type?: string
          created_at?: string | null
          flat_fee?: number | null
          id?: string
          label?: string | null
          max_followers?: number | null
          min_followers?: number
          percentage?: number | null
          position?: number | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_tiers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_batches: {
        Row: {
          active_plan_id: string | null
          audience: string
          created_at: string
          created_by: string | null
          days: number
          destination: string
          goal: string
          id: string
          narratives: Json
          offer: string
          stage: string
          starts_on: string | null
          status: string
          title: string
          updated_at: string
          voice_id: string | null
          voice_reason: string | null
          workspace_id: string
        }
        Insert: {
          active_plan_id?: string | null
          audience?: string
          created_at?: string
          created_by?: string | null
          days?: number
          destination?: string
          goal?: string
          id?: string
          narratives?: Json
          offer?: string
          stage?: string
          starts_on?: string | null
          status?: string
          title?: string
          updated_at?: string
          voice_id?: string | null
          voice_reason?: string | null
          workspace_id: string
        }
        Update: {
          active_plan_id?: string | null
          audience?: string
          created_at?: string
          created_by?: string | null
          days?: number
          destination?: string
          goal?: string
          id?: string
          narratives?: Json
          offer?: string
          stage?: string
          starts_on?: string | null
          status?: string
          title?: string
          updated_at?: string
          voice_id?: string | null
          voice_reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_variants: {
        Row: {
          angle: string
          argument: string | null
          batch_id: string
          beats: Json
          build_prompt: string | null
          build_prompt_issues: Json
          build_report: Json | null
          caption: string
          captions: string
          composition_html: string | null
          created_at: string
          cta: string
          design_mode: string | null
          duration_s: number
          file_ids: string[]
          format: string
          hook: string
          id: string
          is_reference: boolean
          lineage_id: string
          narrative: string
          opening_visual: string | null
          planned_for: string | null
          position: number
          primary_render_id: string | null
          production_plan: Json
          qa_score: number | null
          review_note: string | null
          review_state: string
          review_stills: Json | null
          script: string
          selected: boolean
          size: string
          updated_at: string
          version: number
          voice_id: string | null
          voiceover: string
          workspace_id: string
        }
        Insert: {
          angle?: string
          argument?: string | null
          batch_id: string
          beats?: Json
          build_prompt?: string | null
          build_prompt_issues?: Json
          build_report?: Json | null
          caption?: string
          captions?: string
          composition_html?: string | null
          created_at?: string
          cta?: string
          design_mode?: string | null
          duration_s?: number
          file_ids?: string[]
          format?: string
          hook?: string
          id?: string
          is_reference?: boolean
          lineage_id?: string
          narrative?: string
          opening_visual?: string | null
          planned_for?: string | null
          position?: number
          primary_render_id?: string | null
          production_plan?: Json
          qa_score?: number | null
          review_note?: string | null
          review_state?: string
          review_stills?: Json | null
          script?: string
          selected?: boolean
          size?: string
          updated_at?: string
          version?: number
          voice_id?: string | null
          voiceover?: string
          workspace_id: string
        }
        Update: {
          angle?: string
          argument?: string | null
          batch_id?: string
          beats?: Json
          build_prompt?: string | null
          build_prompt_issues?: Json
          build_report?: Json | null
          caption?: string
          captions?: string
          composition_html?: string | null
          created_at?: string
          cta?: string
          design_mode?: string | null
          duration_s?: number
          file_ids?: string[]
          format?: string
          hook?: string
          id?: string
          is_reference?: boolean
          lineage_id?: string
          narrative?: string
          opening_visual?: string | null
          planned_for?: string | null
          position?: number
          primary_render_id?: string | null
          production_plan?: Json
          qa_score?: number | null
          review_note?: string | null
          review_state?: string
          review_stills?: Json | null
          script?: string
          selected?: boolean
          size?: string
          updated_at?: string
          version?: number
          voice_id?: string | null
          voiceover?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_variants_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "creative_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_variants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_lists: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_lists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          avatar_url: string | null
          avg_views: number | null
          bio: string | null
          contact_email: string | null
          contact_source: string | null
          content_themes: string[] | null
          created_at: string | null
          display_name: string | null
          engagement_rate: number | null
          follower_count: number | null
          following_count: number | null
          id: string
          last_post_at: string | null
          last_scraped_at: string | null
          latest_video_description: string | null
          latest_video_url: string | null
          location: string | null
          niches: string[] | null
          platform: string
          profile_url: string | null
          raw_data: Json | null
          source_query: string | null
          thumbnail_url: string | null
          total_likes: number | null
          updated_at: string | null
          username: string
          video_count: number | null
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          avg_views?: number | null
          bio?: string | null
          contact_email?: string | null
          contact_source?: string | null
          content_themes?: string[] | null
          created_at?: string | null
          display_name?: string | null
          engagement_rate?: number | null
          follower_count?: number | null
          following_count?: number | null
          id?: string
          last_post_at?: string | null
          last_scraped_at?: string | null
          latest_video_description?: string | null
          latest_video_url?: string | null
          location?: string | null
          niches?: string[] | null
          platform?: string
          profile_url?: string | null
          raw_data?: Json | null
          source_query?: string | null
          thumbnail_url?: string | null
          total_likes?: number | null
          updated_at?: string | null
          username: string
          video_count?: number | null
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          avg_views?: number | null
          bio?: string | null
          contact_email?: string | null
          contact_source?: string | null
          content_themes?: string[] | null
          created_at?: string | null
          display_name?: string | null
          engagement_rate?: number | null
          follower_count?: number | null
          following_count?: number | null
          id?: string
          last_post_at?: string | null
          last_scraped_at?: string | null
          latest_video_description?: string | null
          latest_video_url?: string | null
          location?: string | null
          niches?: string[] | null
          platform?: string
          profile_url?: string | null
          raw_data?: Json | null
          source_query?: string | null
          thumbnail_url?: string | null
          total_likes?: number | null
          updated_at?: string | null
          username?: string
          video_count?: number | null
          website_url?: string | null
        }
        Relationships: []
      }
      dossier_documents: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          source: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_folders: {
        Row: {
          color: string
          created_at: string | null
          id: string
          name: string
          position: number
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_replies: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string | null
          folder_id: string | null
          from_email: string
          from_name: string | null
          id: string
          is_read: boolean
          original_message_id: string | null
          received_at: string | null
          subject: string | null
          workspace_id: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          folder_id?: string | null
          from_email: string
          from_name?: string | null
          id?: string
          is_read?: boolean
          original_message_id?: string | null
          received_at?: string | null
          subject?: string | null
          workspace_id: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          folder_id?: string | null
          from_email?: string
          from_name?: string | null
          id?: string
          is_read?: boolean
          original_message_id?: string | null
          received_at?: string | null
          subject?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_replies_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "email_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_replies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          body_html: string | null
          created_at: string | null
          folder_id: string | null
          id: string
          message_id: string | null
          sender_identity_id: string | null
          sent_at: string | null
          status: string
          subject: string
          to_email: string
          to_name: string | null
          workspace_id: string
        }
        Insert: {
          body_html?: string | null
          created_at?: string | null
          folder_id?: string | null
          id?: string
          message_id?: string | null
          sender_identity_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          to_email: string
          to_name?: string | null
          workspace_id: string
        }
        Update: {
          body_html?: string | null
          created_at?: string | null
          folder_id?: string | null
          id?: string
          message_id?: string | null
          sender_identity_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
          to_name?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "email_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_log_sender_identity_id_fkey"
            columns: ["sender_identity_id"]
            isOneToOne: false
            referencedRelation: "sender_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_signatures: {
        Row: {
          created_at: string | null
          html_content: string
          id: string
          is_default: boolean
          name: string
          sender_identity_id: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          html_content?: string
          id?: string
          is_default?: boolean
          name?: string
          sender_identity_id?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          html_content?: string
          id?: string
          is_default?: boolean
          name?: string
          sender_identity_id?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_signatures_sender_identity_id_fkey"
            columns: ["sender_identity_id"]
            isOneToOne: false
            referencedRelation: "sender_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_signatures_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_allowances: {
        Row: {
          monthly_clip_limit: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          monthly_clip_limit?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          monthly_clip_limit?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_allowances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string
          id: string
          refresh_token: string
          service: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at: string
          id?: string
          refresh_token: string
          service: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          refresh_token?: string
          service?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      gsc_digest_log: {
        Row: {
          created_at: string
          digest_date: string
          growing_count: number
          id: string
          new_count: number
          reason: string | null
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          digest_date: string
          growing_count?: number
          id?: string
          new_count?: number
          reason?: string | null
          sent_at?: string | null
          status: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          digest_date?: string
          growing_count?: number
          id?: string
          new_count?: number
          reason?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      gsc_intent_snapshots: {
        Row: {
          avg_position: number
          created_at: string
          description: string
          id: string
          intent_name: string
          queries: string[]
          query_count: number
          snapshot_date: string
          total_clicks: number
          total_impressions: number
        }
        Insert: {
          avg_position?: number
          created_at?: string
          description?: string
          id?: string
          intent_name: string
          queries?: string[]
          query_count?: number
          snapshot_date: string
          total_clicks?: number
          total_impressions?: number
        }
        Update: {
          avg_position?: number
          created_at?: string
          description?: string
          id?: string
          intent_name?: string
          queries?: string[]
          query_count?: number
          snapshot_date?: string
          total_clicks?: number
          total_impressions?: number
        }
        Relationships: []
      }
      gsc_intents: {
        Row: {
          avg_position: number
          built_at: string | null
          built_url: string | null
          description: string
          id: string
          name: string
          product_potential: string
          queries: string[]
          query_count: number
          synced_at: string
          total_clicks: number
          total_impressions: number
        }
        Insert: {
          avg_position?: number
          built_at?: string | null
          built_url?: string | null
          description?: string
          id?: string
          name: string
          product_potential?: string
          queries?: string[]
          query_count?: number
          synced_at?: string
          total_clicks?: number
          total_impressions?: number
        }
        Update: {
          avg_position?: number
          built_at?: string | null
          built_url?: string | null
          description?: string
          id?: string
          name?: string
          product_potential?: string
          queries?: string[]
          query_count?: number
          synced_at?: string
          total_clicks?: number
          total_impressions?: number
        }
        Relationships: []
      }
      hashtag_groups: {
        Row: {
          created_at: string
          created_by: string | null
          hashtags: string[]
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hashtags?: string[]
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hashtags?: string[]
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_events: {
        Row: {
          actor_id: string
          ended_at: string | null
          id: string
          started_at: string
          target_id: string
        }
        Insert: {
          actor_id: string
          ended_at?: string | null
          id?: string
          started_at?: string
          target_id: string
        }
        Update: {
          actor_id?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          target_id?: string
        }
        Relationships: []
      }
      indexnow_log: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          ok: boolean
          status: number | null
          submitted: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          ok?: boolean
          status?: number | null
          submitted?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          ok?: boolean
          status?: number | null
          submitted?: number
        }
        Relationships: []
      }
      integration_credentials: {
        Row: {
          ciphertext: string
          id: string
          iv: string
          last4: string
          provider: string
          scope: string
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          workspace_id: string | null
        }
        Insert: {
          ciphertext: string
          id?: string
          iv: string
          last4: string
          provider: string
          scope: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          ciphertext?: string
          id?: string
          iv?: string
          last4?: string
          provider?: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          action: string
          created_at: string
          id: string
          provider: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          provider: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          provider?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      internal_job_secrets: {
        Row: {
          created_at: string
          name: string
          secret: string
        }
        Insert: {
          created_at?: string
          name: string
          secret?: string
        }
        Update: {
          created_at?: string
          name?: string
          secret?: string
        }
        Relationships: []
      }
      list_members: {
        Row: {
          added_at: string | null
          creator_id: string
          id: string
          list_id: string
        }
        Insert: {
          added_at?: string | null
          creator_id: string
          id?: string
          list_id: string
        }
        Update: {
          added_at?: string | null
          creator_id?: string
          id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_members_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "creator_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt: string
          created_at: string
          created_by: string | null
          filename: string
          height: number | null
          id: string
          image_id: string | null
          license_id: string | null
          mime_type: string | null
          public_url: string
          query: string | null
          source: string
          storage_path: string
          updated_at: string
          width: number | null
          workspace_id: string | null
        }
        Insert: {
          alt: string
          created_at?: string
          created_by?: string | null
          filename: string
          height?: number | null
          id?: string
          image_id?: string | null
          license_id?: string | null
          mime_type?: string | null
          public_url: string
          query?: string | null
          source?: string
          storage_path: string
          updated_at?: string
          width?: number | null
          workspace_id?: string | null
        }
        Update: {
          alt?: string
          created_at?: string
          created_by?: string | null
          filename?: string
          height?: number | null
          id?: string
          image_id?: string | null
          license_id?: string | null
          mime_type?: string | null
          public_url?: string
          query?: string | null
          source?: string
          storage_path?: string
          updated_at?: string
          width?: number | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      meta_data_sources: {
        Row: {
          access_token: string
          connection_metadata: Json | null
          connection_status: string | null
          created_at: string
          id: string
          identifier: string | null
          is_connected: boolean
          source_type: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          connection_metadata?: Json | null
          connection_status?: string | null
          created_at?: string
          id?: string
          identifier?: string | null
          is_connected?: boolean
          source_type?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          connection_metadata?: Json | null
          connection_status?: string | null
          created_at?: string
          id?: string
          identifier?: string | null
          is_connected?: boolean
          source_type?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_oauth_pending: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          pages: Json
          user_access_token: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          pages?: Json
          user_access_token: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          pages?: Json
          user_access_token?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          bcc_on_bounces: boolean | null
          bcc_on_campaigns: boolean | null
          bcc_on_clicks: boolean | null
          bcc_on_replies: boolean | null
          bcc_on_reply_sends: boolean | null
          created_at: string | null
          email: string
          id: string
          is_sender_identity: boolean | null
          name: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          bcc_on_bounces?: boolean | null
          bcc_on_campaigns?: boolean | null
          bcc_on_clicks?: boolean | null
          bcc_on_replies?: boolean | null
          bcc_on_reply_sends?: boolean | null
          created_at?: string | null
          email: string
          id?: string
          is_sender_identity?: boolean | null
          name?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          bcc_on_bounces?: boolean | null
          bcc_on_campaigns?: boolean | null
          bcc_on_clicks?: boolean | null
          bcc_on_replies?: boolean | null
          bcc_on_reply_sends?: boolean | null
          created_at?: string | null
          email?: string
          id?: string
          is_sender_identity?: boolean | null
          name?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          platform: string
          redirect_to: string | null
          state: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          platform: string
          redirect_to?: string | null
          state: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          platform?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      outreach_templates: {
        Row: {
          body: string
          created_at: string | null
          description: string | null
          emoji: string
          id: string
          is_default: boolean
          name: string
          position: number
          subject: string
          template_type: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          body?: string
          created_at?: string | null
          description?: string | null
          emoji?: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
          subject?: string
          template_type?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          description?: string | null
          emoji?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          subject?: string
          template_type?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_agent_actions: {
        Row: {
          confirmation_message: string | null
          created_at: string
          id: string
          intent: string
          label: string
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          result: Json | null
          risk_level: Database["public"]["Enums"]["agent_action_risk"]
          status: Database["public"]["Enums"]["agent_action_status"]
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          confirmation_message?: string | null
          created_at?: string
          id?: string
          intent: string
          label: string
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          result?: Json | null
          risk_level?: Database["public"]["Enums"]["agent_action_risk"]
          status?: Database["public"]["Enums"]["agent_action_status"]
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          confirmation_message?: string | null
          created_at?: string
          id?: string
          intent?: string
          label?: string
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          result?: Json | null
          risk_level?: Database["public"]["Enums"]["agent_action_risk"]
          status?: Database["public"]["Enums"]["agent_action_status"]
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      platform_publish_log: {
        Row: {
          id: string
          platform: string
          published_at: string
          social_account_id: string
        }
        Insert: {
          id?: string
          platform: string
          published_at?: string
          social_account_id: string
        }
        Update: {
          id?: string
          platform?: string
          published_at?: string
          social_account_id?: string
        }
        Relationships: []
      }
      post_agent_events: {
        Row: {
          actor_user_id: string | null
          agent_run_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          post_id: string
          skill: string | null
          tool: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          agent_run_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          post_id: string
          skill?: string | null
          tool?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          agent_run_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          post_id?: string
          skill?: string | null
          tool?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_agent_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_approval_events: {
        Row: {
          action: string
          actor_id: string
          comment: string | null
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          action: string
          actor_id: string
          comment?: string | null
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_approval_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          alt_text: string | null
          created_at: string
          duration_ms: number | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["post_media_kind"]
          mime: string | null
          position: number
          post_id: string
          storage_path: string
          thumb_offset_ms: number | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["post_media_kind"]
          mime?: string | null
          position?: number
          post_id: string
          storage_path: string
          thumb_offset_ms?: number | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["post_media_kind"]
          mime?: string | null
          position?: number
          post_id?: string
          storage_path?: string
          thumb_offset_ms?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_targets: {
        Row: {
          attempts: number
          caption_override: string | null
          created_at: string
          error: string | null
          first_comment_override: string | null
          id: string
          last_attempt_at: string | null
          next_retry_at: string | null
          permalink: string | null
          platform: string
          platform_post_id: string | null
          post_id: string
          published_at: string | null
          social_account_id: string
          status: Database["public"]["Enums"]["post_target_status"]
          updated_at: string
          youtube_upload_bytes: number | null
          youtube_upload_total_bytes: number | null
        }
        Insert: {
          attempts?: number
          caption_override?: string | null
          created_at?: string
          error?: string | null
          first_comment_override?: string | null
          id?: string
          last_attempt_at?: string | null
          next_retry_at?: string | null
          permalink?: string | null
          platform: string
          platform_post_id?: string | null
          post_id: string
          published_at?: string | null
          social_account_id: string
          status?: Database["public"]["Enums"]["post_target_status"]
          updated_at?: string
          youtube_upload_bytes?: number | null
          youtube_upload_total_bytes?: number | null
        }
        Update: {
          attempts?: number
          caption_override?: string | null
          created_at?: string
          error?: string | null
          first_comment_override?: string | null
          id?: string
          last_attempt_at?: string | null
          next_retry_at?: string | null
          permalink?: string | null
          platform?: string
          platform_post_id?: string | null
          post_id?: string
          published_at?: string | null
          social_account_id?: string
          status?: Database["public"]["Enums"]["post_target_status"]
          updated_at?: string
          youtube_upload_bytes?: number | null
          youtube_upload_total_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_targets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_targets_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          agent_run_id: string | null
          ai_disclosure: boolean
          approved_at: string | null
          approved_by: string | null
          branded_content: boolean
          caption: string
          collaborators: Json
          comments_disabled: boolean
          created_at: string
          created_by: string
          created_via: string | null
          duet_disabled: boolean
          first_comment: string | null
          hashtags: string[]
          id: string
          location_id: string | null
          post_type: string
          privacy_level: string | null
          published_at: string | null
          rejection_reason: string | null
          scheduled_at: string | null
          youtube_title: string
          youtube_description: string
          youtube_visibility: string
          status: Database["public"]["Enums"]["post_status"]
          stitch_disabled: boolean
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          user_tags: Json
          variant_id: string | null
          workspace_id: string
          youtube_made_for_kids: boolean
        }
        Insert: {
          agent_run_id?: string | null
          ai_disclosure?: boolean
          approved_at?: string | null
          approved_by?: string | null
          branded_content?: boolean
          caption?: string
          collaborators?: Json
          comments_disabled?: boolean
          created_at?: string
          created_by: string
          created_via?: string | null
          duet_disabled?: boolean
          first_comment?: string | null
          hashtags?: string[]
          id?: string
          location_id?: string | null
          post_type?: string
          privacy_level?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          scheduled_at?: string | null
          youtube_title?: string
          youtube_description?: string
          youtube_visibility?: string
          status?: Database["public"]["Enums"]["post_status"]
          stitch_disabled?: boolean
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          user_tags?: Json
          variant_id?: string | null
          workspace_id: string
          youtube_made_for_kids?: boolean
        }
        Update: {
          agent_run_id?: string | null
          ai_disclosure?: boolean
          approved_at?: string | null
          approved_by?: string | null
          branded_content?: boolean
          caption?: string
          collaborators?: Json
          comments_disabled?: boolean
          created_at?: string
          created_by?: string
          created_via?: string | null
          duet_disabled?: boolean
          first_comment?: string | null
          hashtags?: string[]
          id?: string
          location_id?: string | null
          post_type?: string
          privacy_level?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          scheduled_at?: string | null
          youtube_title?: string
          youtube_description?: string
          youtube_visibility?: string
          status?: Database["public"]["Enums"]["post_status"]
          stitch_disabled?: boolean
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          user_tags?: Json
          variant_id?: string | null
          workspace_id?: string
          youtube_made_for_kids?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "posts_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "creative_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed: boolean | null
          pending_onboarding_data: Json | null
          primary_workspace_id: string | null
          starred_workspace_ids: string[] | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          account_type?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          onboarding_completed?: boolean | null
          pending_onboarding_data?: Json | null
          primary_workspace_id?: string | null
          starred_workspace_ids?: string[] | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          account_type?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          pending_onboarding_data?: Json | null
          primary_workspace_id?: string | null
          starred_workspace_ids?: string[] | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_workspace_id_fkey"
            columns: ["primary_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      public_creator_pages: {
        Row: {
          ai_audience_interests: string[] | null
          ai_collaboration_notes: string | null
          ai_content_topics: string[] | null
          ai_summary: string | null
          created_at: string | null
          creator_profile_id: string
          display_name: string | null
          duplicate_risk: boolean | null
          generated_at: string | null
          id: string
          is_indexable: boolean | null
          last_viewed_at: string | null
          low_data_warning: boolean | null
          meta_description: string | null
          page_title: string | null
          page_views: number | null
          platform: string
          published_at: string | null
          review_status: string
          slug: string
          status: string
          updated_at: string | null
          username: string
        }
        Insert: {
          ai_audience_interests?: string[] | null
          ai_collaboration_notes?: string | null
          ai_content_topics?: string[] | null
          ai_summary?: string | null
          created_at?: string | null
          creator_profile_id: string
          display_name?: string | null
          duplicate_risk?: boolean | null
          generated_at?: string | null
          id?: string
          is_indexable?: boolean | null
          last_viewed_at?: string | null
          low_data_warning?: boolean | null
          meta_description?: string | null
          page_title?: string | null
          page_views?: number | null
          platform: string
          published_at?: string | null
          review_status?: string
          slug: string
          status?: string
          updated_at?: string | null
          username: string
        }
        Update: {
          ai_audience_interests?: string[] | null
          ai_collaboration_notes?: string | null
          ai_content_topics?: string[] | null
          ai_summary?: string | null
          created_at?: string | null
          creator_profile_id?: string
          display_name?: string | null
          duplicate_risk?: boolean | null
          generated_at?: string | null
          id?: string
          is_indexable?: boolean | null
          last_viewed_at?: string | null
          low_data_warning?: boolean | null
          meta_description?: string | null
          page_title?: string | null
          page_views?: number | null
          platform?: string
          published_at?: string | null
          review_status?: string
          slug?: string
          status?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_creator_pages_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          phase_claimed_at: string | null
          production_state: Json
          technical_status: string
          creative_status: string
          audio_path: string | null
          brief_snapshot: Json | null
          caption_mode: string | null
          composition_html: string | null
          created_at: string
          created_by: string | null
          error: string | null
          frame_qa: Json | null
          id: string
          model: string | null
          phase: string | null
          progress: number | null
          provider_job_id: string | null
          qa_issues: Json
          revision_note: string | null
          started_at: string | null
          status: string
          storage_path: string | null
          updated_at: string
          variant_id: string
          version: number | null
          video_url: string | null
          workspace_id: string
        }
        Insert: {
          audio_path?: string | null
          phase_claimed_at?: string | null
          production_state?: Json
          technical_status?: string
          creative_status?: string
          brief_snapshot?: Json | null
          caption_mode?: string | null
          composition_html?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          frame_qa?: Json | null
          id?: string
          model?: string | null
          phase?: string | null
          progress?: number | null
          provider_job_id?: string | null
          qa_issues?: Json
          revision_note?: string | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          variant_id: string
          version?: number | null
          video_url?: string | null
          workspace_id: string
        }
        Update: {
          audio_path?: string | null
          phase_claimed_at?: string | null
          production_state?: Json
          technical_status?: string
          creative_status?: string
          brief_snapshot?: Json | null
          caption_mode?: string | null
          composition_html?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          frame_qa?: Json | null
          id?: string
          model?: string | null
          phase?: string | null
          progress?: number | null
          provider_job_id?: string | null
          qa_issues?: Json
          revision_note?: string | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          variant_id?: string
          version?: number | null
          video_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "creative_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          creator_ids: string[] | null
          id: string
          platform: string
          query: string
          result_count: number | null
          searched_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          creator_ids?: string[] | null
          id?: string
          platform?: string
          query: string
          result_count?: number | null
          searched_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          creator_ids?: string[] | null
          id?: string
          platform?: string
          query?: string
          result_count?: number | null
          searched_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_queries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sender_identities: {
        Row: {
          contact_name: string | null
          created_at: string | null
          id: string
          is_default: boolean
          is_verified: boolean
          sender_email: string
          sender_name: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean
          is_verified?: boolean
          sender_email: string
          sender_name: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean
          is_verified?: boolean
          sender_email?: string
          sender_name?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sender_identities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_audits: {
        Row: {
          counts: Json
          created_at: string
          created_by: string | null
          discovery: Json
          emailed_at: string | null
          id: string
          issues: Json
          pages: Json
          score: number
        }
        Insert: {
          counts?: Json
          created_at?: string
          created_by?: string | null
          discovery?: Json
          emailed_at?: string | null
          id?: string
          issues?: Json
          pages?: Json
          score: number
        }
        Update: {
          counts?: Json
          created_at?: string
          created_by?: string | null
          discovery?: Json
          emailed_at?: string | null
          id?: string
          issues?: Json
          pages?: Json
          score?: number
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          access_token: string
          avatar_url: string | null
          connected_by: string | null
          created_at: string
          display_name: string | null
          expires_at: string | null
          external_id: string
          handle: string | null
          id: string
          is_enabled: boolean
          last_error: string | null
          metadata: Json
          platform: string
          refresh_token: string | null
          scopes: string[] | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          external_id: string
          handle?: string | null
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          metadata?: Json
          platform: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          external_id?: string
          handle?: string | null
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          metadata?: Json
          platform?: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string | null
          id: string
          ip_address: string | null
          logged_in_at: string | null
          logged_out_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          logged_in_at?: string | null
          logged_out_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          logged_in_at?: string | null
          logged_out_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vibe_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_searches: {
        Row: {
          created_at: string
          creator_types: string[] | null
          id: string
          keywords: string[]
          message: string | null
          platform: string
          pro_tips: string[] | null
          query: string
          results_count: number | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          creator_types?: string[] | null
          id?: string
          keywords?: string[]
          message?: string | null
          platform?: string
          pro_tips?: string[] | null
          query: string
          results_count?: number | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          creator_types?: string[] | null
          id?: string
          keywords?: string[]
          message?: string | null
          platform?: string
          pro_tips?: string[] | null
          query?: string
          results_count?: number | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_searches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      video_shares: {
        Row: {
          created_at: string
          created_by: string
          id: string
          revoked: boolean
          title: string | null
          token: string
          variant_ids: string[]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          revoked?: boolean
          title?: string | null
          token: string
          variant_ids: string[]
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          revoked?: boolean
          title?: string | null
          token?: string
          variant_ids?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      website_engagement_events: {
        Row: {
          anonymous_id: string
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          page_path: string
          session_id: string
        }
        Insert: {
          anonymous_id: string
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          page_path: string
          session_id: string
        }
        Update: {
          anonymous_id?: string
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          page_path?: string
          session_id?: string
        }
        Relationships: []
      }
      website_page_views: {
        Row: {
          anonymous_id: string
          country: string | null
          created_at: string
          cta_clicked: boolean
          cta_visible: boolean
          dead_clicks: number
          engagement_score: number
          id: string
          is_bounce: boolean
          is_entry_page: boolean
          language: string | null
          page_load_time_ms: number | null
          page_path: string
          page_title: string | null
          rage_clicks: number
          referrer: string | null
          screen_height: number | null
          screen_width: number | null
          scroll_depth_100: boolean
          scroll_depth_25: boolean
          scroll_depth_50: boolean
          scroll_depth_75: boolean
          scroll_depth_max: number
          session_id: string
          time_on_page_seconds: number
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          anonymous_id: string
          country?: string | null
          created_at?: string
          cta_clicked?: boolean
          cta_visible?: boolean
          dead_clicks?: number
          engagement_score?: number
          id?: string
          is_bounce?: boolean
          is_entry_page?: boolean
          language?: string | null
          page_load_time_ms?: number | null
          page_path: string
          page_title?: string | null
          rage_clicks?: number
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          scroll_depth_100?: boolean
          scroll_depth_25?: boolean
          scroll_depth_50?: boolean
          scroll_depth_75?: boolean
          scroll_depth_max?: number
          session_id: string
          time_on_page_seconds?: number
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          anonymous_id?: string
          country?: string | null
          created_at?: string
          cta_clicked?: boolean
          cta_visible?: boolean
          dead_clicks?: number
          engagement_score?: number
          id?: string
          is_bounce?: boolean
          is_entry_page?: boolean
          language?: string | null
          page_load_time_ms?: number | null
          page_path?: string
          page_title?: string | null
          rage_clicks?: number
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          scroll_depth_100?: boolean
          scroll_depth_25?: boolean
          scroll_depth_50?: boolean
          scroll_depth_75?: boolean
          scroll_depth_max?: number
          session_id?: string
          time_on_page_seconds?: number
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      workspace_domains: {
        Row: {
          created_at: string | null
          dns_records: Json | null
          domain: string
          id: string
          sendgrid_domain_id: number | null
          status: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          dns_records?: Json | null
          domain: string
          id?: string
          sendgrid_domain_id?: number | null
          status?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          dns_records?: Json | null
          domain?: string
          id?: string
          sendgrid_domain_id?: number | null
          status?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_domains_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          invited_by: string | null
          role: string
          sent_at: string | null
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          sent_at?: string | null
          status?: string
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          sent_at?: string | null
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_sendgrid_config: {
        Row: {
          api_key: string
          created_at: string | null
          id: string
          ip_pool: string
          pause_reason: string | null
          sending_paused: boolean
          subuser_id: number | null
          subuser_username: string
          total_sends_lifetime: number
          updated_at: string | null
          warmup_stage: string
          workspace_id: string
        }
        Insert: {
          api_key: string
          created_at?: string | null
          id?: string
          ip_pool?: string
          pause_reason?: string | null
          sending_paused?: boolean
          subuser_id?: number | null
          subuser_username: string
          total_sends_lifetime?: number
          updated_at?: string | null
          warmup_stage?: string
          workspace_id: string
        }
        Update: {
          api_key?: string
          created_at?: string | null
          id?: string
          ip_pool?: string
          pause_reason?: string | null
          sending_paused?: boolean
          subuser_id?: number | null
          subuser_username?: string
          total_sends_lifetime?: number
          updated_at?: string | null
          warmup_stage?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_sendgrid_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_sending_metrics: {
        Row: {
          bounces: number | null
          clicks: number | null
          emails_sent: number | null
          id: string
          metric_date: string
          opens: number | null
          spam_reports: number | null
          workspace_id: string
        }
        Insert: {
          bounces?: number | null
          clicks?: number | null
          emails_sent?: number | null
          id?: string
          metric_date: string
          opens?: number | null
          spam_reports?: number | null
          workspace_id: string
        }
        Update: {
          bounces?: number | null
          clicks?: number | null
          emails_sent?: number | null
          id?: string
          metric_date?: string
          opens?: number | null
          spam_reports?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_sending_metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          billing_period: string | null
          courtesy_granted_by: string | null
          courtesy_plan_expires_at: string | null
          courtesy_plan_key: string | null
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          has_managed_service: boolean | null
          id: string
          plan_key: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          billing_period?: string | null
          courtesy_granted_by?: string | null
          courtesy_plan_expires_at?: string | null
          courtesy_plan_key?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          has_managed_service?: boolean | null
          id?: string
          plan_key?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          billing_period?: string | null
          courtesy_granted_by?: string | null
          courtesy_plan_expires_at?: string | null
          courtesy_plan_key?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          has_managed_service?: boolean | null
          id?: string
          plan_key?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_voice_settings: {
        Row: {
          allowed: Json
          auto_pick: boolean
          brand_voice_id: string | null
          brand_voice_name: string | null
          provider: string
          updated_at: string
          use_own_key: boolean
          workspace_id: string
        }
        Insert: {
          allowed?: Json
          auto_pick?: boolean
          brand_voice_id?: string | null
          brand_voice_name?: string | null
          provider?: string
          updated_at?: string
          use_own_key?: boolean
          workspace_id: string
        }
        Update: {
          allowed?: Json
          auto_pick?: boolean
          brand_voice_id?: string | null
          brand_voice_name?: string | null
          provider?: string
          updated_at?: string
          use_own_key?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_voice_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          social_profiles: Json
          address: string | null
          bcc_on_outreach: boolean
          bcc_outreach_email: string | null
          booking_link: string | null
          business_model: string | null
          contact_name: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          requires_approval: boolean
          software_name: string | null
          software_url: string | null
          timezone: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          social_profiles?: Json
          address?: string | null
          bcc_on_outreach?: boolean
          bcc_outreach_email?: string | null
          booking_link?: string | null
          business_model?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          requires_approval?: boolean
          software_name?: string | null
          software_url?: string | null
          timezone?: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          social_profiles?: Json
          address?: string | null
          bcc_on_outreach?: boolean
          bcc_outreach_email?: string | null
          booking_link?: string | null
          business_model?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          requires_approval?: boolean
          software_name?: string | null
          software_url?: string | null
          timezone?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_creative_provider_slot: {
        Args: { _render_job_id: string; _step_key: string; _provider: string; _model: string; _provider_limit: number; _model_limit: number; _lease_seconds?: number; _account_key?: string }
        Returns: Json
      }
      touch_creative_provider_slot: {
        Args: { _slot_id: string; _lease_token: string; _submitted?: boolean; _lease_seconds?: number }
        Returns: boolean
      }
      release_creative_provider_slot: {
        Args: { _slot_id: string; _lease_token: string }
        Returns: boolean
      }
      admit_creative_render: {
        Args: { _variant_id: string; _expected_version: number; _user_id: string; _brief_snapshot: Json; _revision_note?: string | null }
        Returns: Json
      }
      claim_creative_render_jobs: {
        Args: { _max_claims?: number; _global_limit?: number }
        Returns: string[]
      }
      advance_creative_engine_jobs: {
        Args: never
        Returns: undefined
      }
      enqueue_asset_revision: {
        Args: { _variant_id: string; _expected_version: number; _brief: Json; _revision_note: string; _user_id: string }
        Returns: Json
      }
      review_asset_render: {
        Args: { _variant_id: string; _render_id: string | null; _state: string; _note: string | null; _user_id: string }
        Returns: Json
      }
      set_primary_asset_render: {
        Args: { _variant_id: string; _render_id: string; _user_id: string }
        Returns: Json
      }
      accept_client_invitation: {
        Args: { _token: string; _workspace_id: string }
        Returns: boolean
      }
      admin_creator_page_stats: {
        Args: never
        Returns: {
          needs_review: number
          published: number
          total: number
          total_views: number
        }[]
      }
      admin_overview_stats: { Args: { _days: number }; Returns: Json }
      agency_staff_owner: { Args: { _user_id: string }; Returns: string }
      agency_staff_role: { Args: { _user_id: string }; Returns: string }
      can_access_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      can_manage_workspace_logo: {
        Args: { _folder: string; _user_id: string }
        Returns: boolean
      }
      employee_can_access_client: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      get_client_invitation: {
        Args: { _token: string }
        Returns: {
          agency_user_id: string
          client_company_name: string
          contact_name: string
          email: string
          id: string
          invitation_type: string
          role: string
          status: string
          workspace_id: string
        }[]
      }
      get_workspace_members_with_email: {
        Args: { _workspace_id: string }
        Returns: {
          email: string
          full_name: string
          role: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_agency_admin_of: {
        Args: { _agency_owner: string; _user_id: string }
        Returns: boolean
      }
      is_workspace_agency: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      can_confirm_creation_schedule: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      track_client_invitation_open: {
        Args: { _token: string }
        Returns: undefined
      }
    }
    Enums: {
      agent_action_risk: "low" | "medium" | "high" | "destructive"
      agent_action_status:
        | "pending"
        | "approved"
        | "rejected"
        | "executed"
        | "failed"
        | "cancelled"
      agent_run_state:
        | "draft"
        | "awaiting_approval"
        | "running"
        | "blocked"
        | "complete"
        | "failed"
      app_role: "super_admin" | "admin" | "moderator" | "user"
      post_media_kind: "image" | "video" | "document"
      post_status:
        | "draft"
        | "awaiting_approval"
        | "scheduled"
        | "publishing"
        | "published"
        | "failed"
        | "partially_published"
        | "needs_attention"
      post_target_status:
        | "pending"
        | "publishing"
        | "published"
        | "failed"
        | "skipped"
        | "retrying"
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
    Enums: {
      agent_action_risk: ["low", "medium", "high", "destructive"],
      agent_action_status: [
        "pending",
        "approved",
        "rejected",
        "executed",
        "failed",
        "cancelled",
      ],
      agent_run_state: [
        "draft",
        "awaiting_approval",
        "running",
        "blocked",
        "complete",
        "failed",
      ],
      app_role: ["super_admin", "admin", "moderator", "user"],
      post_media_kind: ["image", "video", "document"],
      post_status: [
        "draft",
        "awaiting_approval",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "partially_published",
        "needs_attention",
      ],
      post_target_status: [
        "pending",
        "publishing",
        "published",
        "failed",
        "skipped",
        "retrying",
      ],
    },
  },
} as const
