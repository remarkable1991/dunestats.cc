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
      profiles: {
        Row: {
          availability_baseline: Json | null
          created_at: string
          discord_username: string | null
          has_used_reset: boolean
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          availability_baseline?: Json | null
          created_at?: string
          discord_username?: string | null
          has_used_reset?: boolean
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          availability_baseline?: Json | null
          created_at?: string
          discord_username?: string | null
          has_used_reset?: boolean
          id?: string
          updated_at?: string
          username?: string | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
