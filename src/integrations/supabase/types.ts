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
      active_async_matches: {
        Row: {
          auto_start_at: string | null
          board_type: string | null
          channel_id: string
          created_at: string
          expansions: string[] | null
          expires_at: string | null
          guest_players: string[] | null
          guild_id: string
          host_id: string
          id: number
          last_prompted_at: string | null
          lobby_password: string | null
          match_id: string | null
          message_id: string
          message_text: string
          modules: string[] | null
          notify_user_ids: string[] | null
          player_ids: string[] | null
          status: string
        }
        Insert: {
          auto_start_at?: string | null
          board_type?: string | null
          channel_id: string
          created_at?: string
          expansions?: string[] | null
          expires_at?: string | null
          guest_players?: string[] | null
          guild_id: string
          host_id: string
          id?: number
          last_prompted_at?: string | null
          lobby_password?: string | null
          match_id?: string | null
          message_id: string
          message_text: string
          modules?: string[] | null
          notify_user_ids?: string[] | null
          player_ids?: string[] | null
          status?: string
        }
        Update: {
          auto_start_at?: string | null
          board_type?: string | null
          channel_id?: string
          created_at?: string
          expansions?: string[] | null
          expires_at?: string | null
          guest_players?: string[] | null
          guild_id?: string
          host_id?: string
          id?: number
          last_prompted_at?: string | null
          lobby_password?: string | null
          match_id?: string | null
          message_id?: string
          message_text?: string
          modules?: string[] | null
          notify_user_ids?: string[] | null
          player_ids?: string[] | null
          status?: string
        }
        Relationships: []
      }
      game_results: {
        Row: {
          bene_gesserit_alliance: boolean | null
          bene_gesserit_level: number | null
          combat_strength: number | null
          created_at: string
          elo_delta: number
          elo_delta_overall: number
          emperor_alliance: boolean | null
          emperor_level: number | null
          fremen_alliance: boolean | null
          fremen_level: number | null
          game_id: string
          garrison_troops: number | null
          has_first_player: boolean | null
          has_high_council: boolean | null
          has_swordmaster: boolean | null
          id: string
          is_leaver: boolean | null
          leader_name: string | null
          placement: number
          player_color: string | null
          player_name: string
          player_slot: number | null
          points: number
          solaris: number | null
          spacing_guild_alliance: boolean | null
          spacing_guild_level: number | null
          spice: number | null
          turn_order: number | null
          water: number | null
        }
        Insert: {
          bene_gesserit_alliance?: boolean | null
          bene_gesserit_level?: number | null
          combat_strength?: number | null
          created_at?: string
          elo_delta?: number
          elo_delta_overall?: number
          emperor_alliance?: boolean | null
          emperor_level?: number | null
          fremen_alliance?: boolean | null
          fremen_level?: number | null
          game_id: string
          garrison_troops?: number | null
          has_first_player?: boolean | null
          has_high_council?: boolean | null
          has_swordmaster?: boolean | null
          id?: string
          is_leaver?: boolean | null
          leader_name?: string | null
          placement: number
          player_color?: string | null
          player_name: string
          player_slot?: number | null
          points?: number
          solaris?: number | null
          spacing_guild_alliance?: boolean | null
          spacing_guild_level?: number | null
          spice?: number | null
          turn_order?: number | null
          water?: number | null
        }
        Update: {
          bene_gesserit_alliance?: boolean | null
          bene_gesserit_level?: number | null
          combat_strength?: number | null
          created_at?: string
          elo_delta?: number
          elo_delta_overall?: number
          emperor_alliance?: boolean | null
          emperor_level?: number | null
          fremen_alliance?: boolean | null
          fremen_level?: number | null
          game_id?: string
          garrison_troops?: number | null
          has_first_player?: boolean | null
          has_high_council?: boolean | null
          has_swordmaster?: boolean | null
          id?: string
          is_leaver?: boolean | null
          leader_name?: string | null
          placement?: number
          player_color?: string | null
          player_name?: string
          player_slot?: number | null
          points?: number
          solaris?: number | null
          spacing_guild_alliance?: boolean | null
          spacing_guild_level?: number | null
          spice?: number | null
          turn_order?: number | null
          water?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          ai_scan_status: string | null
          ai_scan_summary: string | null
          announced_to_discord: boolean | null
          board_version: string | null
          conflict_title: string | null
          created_at: string
          created_by: string | null
          end_round: number | null
          game_version: Database["public"]["Enums"]["game_version"]
          has_base_leaders: boolean
          has_epic_mode: boolean
          has_immortality: boolean
          has_rise_of_ix: boolean
          id: string
          image_url: string | null
          public_match_id: string | null
          source: string
          tournament_num: number | null
        }
        Insert: {
          ai_scan_status?: string | null
          ai_scan_summary?: string | null
          announced_to_discord?: boolean | null
          board_version?: string | null
          conflict_title?: string | null
          created_at?: string
          created_by?: string | null
          end_round?: number | null
          game_version: Database["public"]["Enums"]["game_version"]
          has_base_leaders?: boolean
          has_epic_mode?: boolean
          has_immortality?: boolean
          has_rise_of_ix?: boolean
          id?: string
          image_url?: string | null
          public_match_id?: string | null
          source?: string
          tournament_num?: number | null
        }
        Update: {
          ai_scan_status?: string | null
          ai_scan_summary?: string | null
          announced_to_discord?: boolean | null
          board_version?: string | null
          conflict_title?: string | null
          created_at?: string
          created_by?: string | null
          end_round?: number | null
          game_version?: Database["public"]["Enums"]["game_version"]
          has_base_leaders?: boolean
          has_epic_mode?: boolean
          has_immortality?: boolean
          has_rise_of_ix?: boolean
          id?: string
          image_url?: string | null
          public_match_id?: string | null
          source?: string
          tournament_num?: number | null
        }
        Relationships: []
      }
      past_tournament_results: {
        Row: {
          board_version: string
          created_at: string
          filename: string | null
          has_epic_mode: boolean
          has_immortality: boolean
          has_rise_of_ix: boolean
          id: string
          leader_name: string | null
          placement: number
          player_name: string
          points: number
          round_type: string
          table_identifier: string
          tournament_num: number
        }
        Insert: {
          board_version?: string
          created_at?: string
          filename?: string | null
          has_epic_mode?: boolean
          has_immortality?: boolean
          has_rise_of_ix?: boolean
          id?: string
          leader_name?: string | null
          placement: number
          player_name: string
          points?: number
          round_type: string
          table_identifier: string
          tournament_num: number
        }
        Update: {
          board_version?: string
          created_at?: string
          filename?: string | null
          has_epic_mode?: boolean
          has_immortality?: boolean
          has_rise_of_ix?: boolean
          id?: string
          leader_name?: string | null
          placement?: number
          player_name?: string
          points?: number
          round_type?: string
          table_identifier?: string
          tournament_num?: number
        }
        Relationships: []
      }
      player_discord_map: {
        Row: {
          claimed_by: string | null
          created_at: string
          discord_user_id: string | null
          discord_username: string | null
          display_name: string | null
          id: number
          player_key: string | null
          source: string
          updated_at: string
          username: string | null
        }
        Insert: {
          claimed_by?: string | null
          created_at?: string
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          id?: number
          player_key?: string | null
          source?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          claimed_by?: string | null
          created_at?: string
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          id?: number
          player_key?: string | null
          source?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      player_ratings: {
        Row: {
          claimed_by: string | null
          display_name: string
          elo: number
          game_version: Database["public"]["Enums"]["game_version"]
          games_played: number
          id: string
          player_key: string
          top2: number
          total_points: number
          updated_at: string
          wins: number
        }
        Insert: {
          claimed_by?: string | null
          display_name: string
          elo?: number
          game_version: Database["public"]["Enums"]["game_version"]
          games_played?: number
          id?: string
          player_key: string
          top2?: number
          total_points?: number
          updated_at?: string
          wins?: number
        }
        Update: {
          claimed_by?: string | null
          display_name?: string
          elo?: number
          game_version?: Database["public"]["Enums"]["game_version"]
          games_played?: number
          id?: string
          player_key?: string
          top2?: number
          total_points?: number
          updated_at?: string
          wins?: number
        }
        Relationships: []
      }
      player_sp: {
        Row: {
          claimed_by: string | null
          created_at: string
          display_name: string
          is_claimed: boolean
          lifetime_sp: number
          player_key: string
          season_id: number
          seasonal_sp: number
          updated_at: string
        }
        Insert: {
          claimed_by?: string | null
          created_at?: string
          display_name: string
          is_claimed?: boolean
          lifetime_sp?: number
          player_key: string
          season_id?: number
          seasonal_sp?: number
          updated_at?: string
        }
        Update: {
          claimed_by?: string | null
          created_at?: string
          display_name?: string
          is_claimed?: boolean
          lifetime_sp?: number
          player_key?: string
          season_id?: number
          seasonal_sp?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_sp_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "sp_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          availability_baseline: Json | null
          created_at: string
          discord_username: string | null
          has_used_reset: boolean
          id: string
          last_sign_in_at: string | null
          last_sp_checkin_at: string | null
          pending_signup_sp: number
          referral_phase1_paid: boolean
          referral_phase2_paid: boolean
          referred_by_player_key: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          availability_baseline?: Json | null
          created_at?: string
          discord_username?: string | null
          has_used_reset?: boolean
          id: string
          last_sign_in_at?: string | null
          last_sp_checkin_at?: string | null
          pending_signup_sp?: number
          referral_phase1_paid?: boolean
          referral_phase2_paid?: boolean
          referred_by_player_key?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          availability_baseline?: Json | null
          created_at?: string
          discord_username?: string | null
          has_used_reset?: boolean
          id?: string
          last_sign_in_at?: string | null
          last_sp_checkin_at?: string | null
          pending_signup_sp?: number
          referral_phase1_paid?: boolean
          referral_phase2_paid?: boolean
          referred_by_player_key?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      sandbox_game_results: {
        Row: {
          created_at: string | null
          elo_delta: number | null
          elo_delta_overall: number | null
          game_id: string
          id: string | null
          leader_name: string | null
          placement: number | null
          player_name: string
          points: number | null
          vp_overall_delta: number | null
        }
        Insert: {
          created_at?: string | null
          elo_delta?: number | null
          elo_delta_overall?: number | null
          game_id: string
          id?: string | null
          leader_name?: string | null
          placement?: number | null
          player_name: string
          points?: number | null
          vp_overall_delta?: number | null
        }
        Update: {
          created_at?: string | null
          elo_delta?: number | null
          elo_delta_overall?: number | null
          game_id?: string
          id?: string | null
          leader_name?: string | null
          placement?: number | null
          player_name?: string
          points?: number | null
          vp_overall_delta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_game_results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "sandbox_games"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_games: {
        Row: {
          announced_to_discord: boolean | null
          board_version: string | null
          created_at: string | null
          created_by: string | null
          game_version: Database["public"]["Enums"]["game_version"] | null
          has_base_leaders: boolean | null
          has_epic_mode: boolean | null
          has_immortality: boolean | null
          has_rise_of_ix: boolean | null
          id: string
          image_url: string | null
          public_match_id: string | null
          source: string | null
          tournament_num: number | null
        }
        Insert: {
          announced_to_discord?: boolean | null
          board_version?: string | null
          created_at?: string | null
          created_by?: string | null
          game_version?: Database["public"]["Enums"]["game_version"] | null
          has_base_leaders?: boolean | null
          has_epic_mode?: boolean | null
          has_immortality?: boolean | null
          has_rise_of_ix?: boolean | null
          id?: string
          image_url?: string | null
          public_match_id?: string | null
          source?: string | null
          tournament_num?: number | null
        }
        Update: {
          announced_to_discord?: boolean | null
          board_version?: string | null
          created_at?: string | null
          created_by?: string | null
          game_version?: Database["public"]["Enums"]["game_version"] | null
          has_base_leaders?: boolean | null
          has_epic_mode?: boolean | null
          has_immortality?: boolean | null
          has_rise_of_ix?: boolean | null
          id?: string
          image_url?: string | null
          public_match_id?: string | null
          source?: string | null
          tournament_num?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_games_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_player_ratings: {
        Row: {
          claimed_by: string | null
          display_name: string | null
          elo: number | null
          game_version: Database["public"]["Enums"]["game_version"]
          games_played: number | null
          id: string | null
          overall_vp_elo: number | null
          player_key: string
          top2: number | null
          total_points: number | null
          updated_at: string | null
          wins: number | null
        }
        Insert: {
          claimed_by?: string | null
          display_name?: string | null
          elo?: number | null
          game_version: Database["public"]["Enums"]["game_version"]
          games_played?: number | null
          id?: string | null
          overall_vp_elo?: number | null
          player_key: string
          top2?: number | null
          total_points?: number | null
          updated_at?: string | null
          wins?: number | null
        }
        Update: {
          claimed_by?: string | null
          display_name?: string | null
          elo?: number | null
          game_version?: Database["public"]["Enums"]["game_version"]
          games_played?: number | null
          id?: string | null
          overall_vp_elo?: number | null
          player_key?: string
          top2?: number | null
          total_points?: number | null
          updated_at?: string | null
          wins?: number | null
        }
        Relationships: []
      }
      sp_events: {
        Row: {
          action_type: string
          amount: number
          created_at: string
          id: string
          is_legacy: boolean
          metadata: Json | null
          player_key: string
          ref_game_id: string | null
          ref_tournament_num: number | null
          season_id: number | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          amount: number
          created_at?: string
          id?: string
          is_legacy?: boolean
          metadata?: Json | null
          player_key: string
          ref_game_id?: string | null
          ref_tournament_num?: number | null
          season_id?: number | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          amount?: number
          created_at?: string
          id?: string
          is_legacy?: boolean
          metadata?: Json | null
          player_key?: string
          ref_game_id?: string | null
          ref_tournament_num?: number | null
          season_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "sp_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_seasons: {
        Row: {
          created_at: string
          ends_at: string
          id: number
          name: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id: number
          name: string
          starts_at: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: number
          name?: string
          starts_at?: string
        }
        Relationships: []
      }
      tournament_match_schedules: {
        Row: {
          confirmed_slot: string | null
          confirmed_time_text: string | null
          confirmed_timestamp: string | null
          created_at: string | null
          id: string
          match_code: string
          message_id: string
          mode: string
          player_discord_ids: string[]
          player_names: string[]
          reminders_sent: string[] | null
          round_type: string
          status: string
          suggested_slots: Json
          table_identifier: string
          thread_id: string
          tournament_num: number
          updated_at: string | null
          votes: Json
          votes_count: number
        }
        Insert: {
          confirmed_slot?: string | null
          confirmed_time_text?: string | null
          confirmed_timestamp?: string | null
          created_at?: string | null
          id?: string
          match_code: string
          message_id: string
          mode?: string
          player_discord_ids?: string[]
          player_names?: string[]
          reminders_sent?: string[] | null
          round_type: string
          status?: string
          suggested_slots?: Json
          table_identifier: string
          thread_id: string
          tournament_num: number
          updated_at?: string | null
          votes?: Json
          votes_count?: number
        }
        Update: {
          confirmed_slot?: string | null
          confirmed_time_text?: string | null
          confirmed_timestamp?: string | null
          created_at?: string | null
          id?: string
          match_code?: string
          message_id?: string
          mode?: string
          player_discord_ids?: string[]
          player_names?: string[]
          reminders_sent?: string[] | null
          round_type?: string
          status?: string
          suggested_slots?: Json
          table_identifier?: string
          thread_id?: string
          tournament_num?: number
          updated_at?: string | null
          votes?: Json
          votes_count?: number
        }
        Relationships: []
      }
      tournament_matches: {
        Row: {
          created_at: string
          discord_username: string | null
          id: string
          is_backup: boolean
          leader_name: string | null
          placement: number | null
          player_availability: Json | null
          player_compatibility_score: number | null
          player_name: string
          points: number | null
          round_type: string
          table_identifier: string
          table_score: number | null
          tournament_num: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discord_username?: string | null
          id?: string
          is_backup?: boolean
          leader_name?: string | null
          placement?: number | null
          player_availability?: Json | null
          player_compatibility_score?: number | null
          player_name: string
          points?: number | null
          round_type: string
          table_identifier: string
          table_score?: number | null
          tournament_num: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discord_username?: string | null
          id?: string
          is_backup?: boolean
          leader_name?: string | null
          placement?: number | null
          player_availability?: Json | null
          player_compatibility_score?: number | null
          player_name?: string
          points?: number | null
          round_type?: string
          table_identifier?: string
          table_score?: number | null
          tournament_num?: number
          updated_at?: string
        }
        Relationships: []
      }
      tournament_pending_matches: {
        Row: {
          created_at: string
          detected_players: Json
          game_id: string | null
          id: string
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          round_type: string | null
          status: string
          submitted_by: string | null
          table_identifier: string | null
          tournament_num: number
          unmatched: Json
        }
        Insert: {
          created_at?: string
          detected_players?: Json
          game_id?: string | null
          id?: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_type?: string | null
          status?: string
          submitted_by?: string | null
          table_identifier?: string | null
          tournament_num: number
          unmatched?: Json
        }
        Update: {
          created_at?: string
          detected_players?: Json
          game_id?: string | null
          id?: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_type?: string | null
          status?: string
          submitted_by?: string | null
          table_identifier?: string | null
          tournament_num?: number
          unmatched?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tournament_pending_matches_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_registrations: {
        Row: {
          active_on_discord: boolean
          availability: Json
          consents: Json
          created_at: string
          direwolf_name: string
          discord_username: string
          email: string | null
          id: string
          owns_expansions: boolean
          timezone: string | null
          tournament_num: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active_on_discord?: boolean
          availability?: Json
          consents?: Json
          created_at?: string
          direwolf_name: string
          discord_username: string
          email?: string | null
          id?: string
          owns_expansions?: boolean
          timezone?: string | null
          tournament_num: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active_on_discord?: boolean
          availability?: Json
          consents?: Json
          created_at?: string
          direwolf_name?: string
          discord_username?: string
          email?: string | null
          id?: string
          owns_expansions?: boolean
          timezone?: string | null
          tournament_num?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tournament_table_screenshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          image_url: string
          round_type: string
          table_identifier: string
          tournament_num: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_url: string
          round_type: string
          table_identifier: string
          tournament_num: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string
          round_type?: string
          table_identifier?: string
          tournament_num?: number
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          board_version: string
          checkboxes: Json
          checkin_start_at: string | null
          created_at: string
          direct_to_grand_final: number | null
          end_date: string
          grand_final_spots: number | null
          has_base_leaders: boolean
          has_epic_mode: boolean
          has_immortality: boolean
          has_rise_of_ix: boolean
          info_text: string | null
          info_title: string | null
          name: string
          prizes_summary: string | null
          prizes_text: string | null
          registration_open: boolean
          required_availability_pct: number
          required_weekly_pct: number
          semifinal_seeding: string
          semifinal_tables: number | null
          start_date: string
          to_semifinal: number | null
          total_players: number | null
          tournament_num: number
          updated_at: string
        }
        Insert: {
          board_version?: string
          checkboxes?: Json
          checkin_start_at?: string | null
          created_at?: string
          direct_to_grand_final?: number | null
          end_date: string
          grand_final_spots?: number | null
          has_base_leaders?: boolean
          has_epic_mode?: boolean
          has_immortality?: boolean
          has_rise_of_ix?: boolean
          info_text?: string | null
          info_title?: string | null
          name: string
          prizes_summary?: string | null
          prizes_text?: string | null
          registration_open?: boolean
          required_availability_pct?: number
          required_weekly_pct?: number
          semifinal_seeding?: string
          semifinal_tables?: number | null
          start_date: string
          to_semifinal?: number | null
          total_players?: number | null
          tournament_num: number
          updated_at?: string
        }
        Update: {
          board_version?: string
          checkboxes?: Json
          checkin_start_at?: string | null
          created_at?: string
          direct_to_grand_final?: number | null
          end_date?: string
          grand_final_spots?: number | null
          has_base_leaders?: boolean
          has_epic_mode?: boolean
          has_immortality?: boolean
          has_rise_of_ix?: boolean
          info_text?: string | null
          info_title?: string | null
          name?: string
          prizes_summary?: string | null
          prizes_text?: string | null
          registration_open?: boolean
          required_availability_pct?: number
          required_weekly_pct?: number
          semifinal_seeding?: string
          semifinal_tables?: number | null
          start_date?: string
          to_semifinal?: number | null
          total_players?: number | null
          tournament_num?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_dismissed_notifications: {
        Row: {
          dismissed_at: string | null
          id: string
          notification_type: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          id?: string
          notification_type: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          id?: string
          notification_type?: string
          reference_id?: string | null
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
          role: Database["public"]["Enums"]["app_role"]
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
      [_ in never]: never
    }
    Functions: {
      admin_set_table_roster: {
        Args: {
          p_players: Json
          p_round_type: string
          p_table_identifier: string
          p_tournament_num: number
        }
        Returns: Json
      }
      approve_pending_tournament_match: {
        Args: {
          p_id: string
          p_match_code?: string
          p_name_fixes?: Json
          p_round?: string
          p_table?: string
        }
        Returns: Json
      }
      archive_tournament: {
        Args: {
          p_board: string
          p_epic: boolean
          p_immo: boolean
          p_ix: boolean
          p_tournament_num: number
        }
        Returns: Json
      }
      claim_player_name: {
        Args: { p_player_key: string; p_reset?: boolean }
        Returns: Json
      }
      delete_game_with_rating_revert: {
        Args: { p_game_id: string }
        Returns: Json
      }
      dismiss_user_notification: {
        Args: { p_notification_type: string; p_reference_id?: string }
        Returns: undefined
      }
      get_all_storage_files: {
        Args: { bucket_name: string }
        Returns: {
          created_at: string
          file_path: string
        }[]
      }
      get_player_achievements: { Args: { p_player_key: string }; Returns: Json }
      get_player_favorite_leaders_for_stats: {
        Args: { p_player_key: string }
        Returns: {
          game_version: string
          leader_name: string
          plays: number
          wins: number
        }[]
      }
      get_player_ranks_for_stats: {
        Args: { p_player_key: string }
        Returns: {
          game_version: string
          rank: number
        }[]
      }
      get_player_top_opponents_for_stats: {
        Args: { p_player_key: string }
        Returns: {
          game_version: string
          games_played: number
          opponent_name: string
        }[]
      }
      get_recruitment_leaderboard: {
        Args: never
        Returns: {
          image_upload_count: number
          player_key: string
          prize_rank: number
          referral_jackpot_count: number
          referral_signup_count: number
          total_points: number
          total_qualifying_events: number
          user_id: string
        }[]
      }
      get_user_notifications: { Args: { p_user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_async_game_started: {
        Args: {
          p_round_type: string
          p_table_identifier: string
          p_tournament_num: number
        }
        Returns: Json
      }
      promote_to_grandfinal: {
        Args: { p_players: string[]; p_tournament_num: number }
        Returns: Json
      }
      promote_to_semifinals: {
        Args: { p_semi1: string[]; p_semi2: string[]; p_tournament_num: number }
        Returns: Json
      }
      promote_to_semifinals_n: {
        Args: { p_tables: Json; p_tournament_num: number }
        Returns: Json
      }
      recalculate_sandbox_overall_vp_elo: { Args: never; Returns: undefined }
      reject_pending_tournament_match: {
        Args: { p_id: string; p_note?: string }
        Returns: Json
      }
      save_game_with_ratings: {
        Args: {
          p_board_version: string
          p_has_base_leaders: boolean
          p_has_epic_mode: boolean
          p_has_immortality: boolean
          p_has_rise_of_ix: boolean
          p_match_screenshot_url: string
          p_results: Json
          p_tournament_num: number
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sp_award: {
        Args: {
          p_action_type: string
          p_amount: number
          p_at: string
          p_metadata?: Json
          p_player_name: string
          p_ref_game_id?: string
          p_ref_tournament_num?: number
        }
        Returns: undefined
      }
      sp_backfill: { Args: never; Returns: Json }
      sp_daily_checkin: { Args: never; Returns: Json }
      sp_register_referral: { Args: { p_referrer_key: string }; Returns: Json }
      sp_season_for: { Args: { ts: string }; Returns: number }
      sync_new_game_to_sandbox_by_id: {
        Args: { p_game_id: string }
        Returns: undefined
      }
      touch_last_sign_in: { Args: never; Returns: undefined }
      tournament_player_availability: {
        Args: { p_player_name: string; p_tournament_num: number }
        Returns: Json
      }
      tournament_roster_registration_availability: {
        Args: { p_player_names: string[]; p_tournament_num: number }
        Returns: {
          availability: Json
          player_name: string
        }[]
      }
      update_match_details:
        | {
            Args: {
              p_board_version: string
              p_conflict_title?: string
              p_end_round: number
              p_game_id: string
              p_has_base_leaders: boolean
              p_has_epic_mode: boolean
              p_has_immortality: boolean
              p_has_rise_of_ix: boolean
              p_players: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_ai_scan_status?: string
              p_board_version: string
              p_conflict_title?: string
              p_end_round: number
              p_game_id: string
              p_has_base_leaders: boolean
              p_has_epic_mode: boolean
              p_has_immortality: boolean
              p_has_rise_of_ix: boolean
              p_players: Json
            }
            Returns: Json
          }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      game_version: "base" | "ix" | "uprising" | "overall"
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
      app_role: ["admin", "moderator", "user"],
      game_version: ["base", "ix", "uprising", "overall"],
    },
  },
} as const
