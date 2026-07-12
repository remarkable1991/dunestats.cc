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
          board_type: string | null
          channel_id: string
          created_at: string
          expansions: string[] | null
          guild_id: string
          host_id: string
          id: number
          last_prompted_at: string | null
          lobby_password: string | null
          message_id: string
          message_text: string
          notify_user_ids: string[] | null
          player_ids: string[] | null
          status: string
        }
        Insert: {
          board_type?: string | null
          channel_id: string
          created_at?: string
          expansions?: string[] | null
          guild_id: string
          host_id: string
          id?: number
          last_prompted_at?: string | null
          lobby_password?: string | null
          message_id: string
          message_text: string
          notify_user_ids?: string[] | null
          player_ids?: string[] | null
          status?: string
        }
        Update: {
          board_type?: string | null
          channel_id?: string
          created_at?: string
          expansions?: string[] | null
          guild_id?: string
          host_id?: string
          id?: number
          last_prompted_at?: string | null
          lobby_password?: string | null
          message_id?: string
          message_text?: string
          notify_user_ids?: string[] | null
          player_ids?: string[] | null
          status?: string
        }
        Relationships: []
      }
      game_results: {
        Row: {
          created_at: string
          elo_delta: number
          elo_delta_overall: number
          game_id: string
          id: string
          leader_name: string | null
          placement: number
          player_name: string
          points: number
        }
        Insert: {
          created_at?: string
          elo_delta?: number
          elo_delta_overall?: number
          game_id: string
          id?: string
          leader_name?: string | null
          placement: number
          player_name: string
          points?: number
        }
        Update: {
          created_at?: string
          elo_delta?: number
          elo_delta_overall?: number
          game_id?: string
          id?: string
          leader_name?: string | null
          placement?: number
          player_name?: string
          points?: number
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
          board_version: string | null
          created_at: string
          created_by: string | null
          game_version: Database["public"]["Enums"]["game_version"]
          has_base_leaders: boolean
          has_epic_mode: boolean
          has_immortality: boolean
          has_rise_of_ix: boolean
          id: string
          image_url: string | null
          source: string
          tournament_num: number | null
        }
        Insert: {
          board_version?: string | null
          created_at?: string
          created_by?: string | null
          game_version: Database["public"]["Enums"]["game_version"]
          has_base_leaders?: boolean
          has_epic_mode?: boolean
          has_immortality?: boolean
          has_rise_of_ix?: boolean
          id?: string
          image_url?: string | null
          source?: string
          tournament_num?: number | null
        }
        Update: {
          board_version?: string | null
          created_at?: string
          created_by?: string | null
          game_version?: Database["public"]["Enums"]["game_version"]
          has_base_leaders?: boolean
          has_epic_mode?: boolean
          has_immortality?: boolean
          has_rise_of_ix?: boolean
          id?: string
          image_url?: string | null
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
      tournament_matches: {
        Row: {
          created_at: string
          discord_username: string | null
          id: string
          leader_name: string | null
          placement: number | null
          player_name: string
          points: number | null
          round_type: string
          table_identifier: string
          tournament_num: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discord_username?: string | null
          id?: string
          leader_name?: string | null
          placement?: number | null
          player_name: string
          points?: number | null
          round_type: string
          table_identifier: string
          tournament_num: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discord_username?: string | null
          id?: string
          leader_name?: string | null
          placement?: number | null
          player_name?: string
          points?: number | null
          round_type?: string
          table_identifier?: string
          tournament_num?: number
          updated_at?: string
        }
        Relationships: []
      }
      tournament_registrations: {
        Row: {
          active_on_discord: boolean
          availability: Json
          created_at: string
          direwolf_name: string
          discord_username: string
          email: string | null
          id: string
          owns_expansions: boolean
          tournament_num: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active_on_discord?: boolean
          availability?: Json
          created_at?: string
          direwolf_name: string
          discord_username: string
          email?: string | null
          id?: string
          owns_expansions?: boolean
          tournament_num: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active_on_discord?: boolean
          availability?: Json
          created_at?: string
          direwolf_name?: string
          discord_username?: string
          email?: string | null
          id?: string
          owns_expansions?: boolean
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
      claim_player_name: {
        Args: { p_player_key: string; p_reset?: boolean }
        Returns: Json
      }
      delete_game_with_rating_revert: {
        Args: { p_game_id: string }
        Returns: Json
      }
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      app_role: ["admin", "moderator", "user"],
      game_version: ["base", "ix", "uprising", "overall"],
    },
  },
} as const
