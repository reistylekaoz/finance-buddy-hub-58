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
      accounts: {
        Row: {
          account_number: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          bank_connection_id: string | null
          branch_number: string | null
          color: string
          created_at: string
          currency: string
          id: string
          initial_balance: number
          institution: string | null
          is_active: boolean
          name: string
          owner_name: string | null
          pluggy_account_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["account_type"]
          bank_connection_id?: string | null
          branch_number?: string | null
          color?: string
          created_at?: string
          currency?: string
          id?: string
          initial_balance?: number
          institution?: string | null
          is_active?: boolean
          name: string
          owner_name?: string | null
          pluggy_account_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["account_type"]
          bank_connection_id?: string | null
          branch_number?: string | null
          color?: string
          created_at?: string
          currency?: string
          id?: string
          initial_balance?: number
          institution?: string | null
          is_active?: boolean
          name?: string
          owner_name?: string | null
          pluggy_account_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_class: string
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          asset_class: string
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          asset_class?: string
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      bank_connections: {
        Row: {
          connector_name: string | null
          created_at: string
          id: string
          last_synced_at: string | null
          pluggy_item_id: string
          provider: string
          status: string
          status_detail: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connector_name?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          pluggy_item_id: string
          provider?: string
          status?: string
          status_detail?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connector_name?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          pluggy_item_id?: string
          provider?: string
          status?: string
          status_detail?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_alerts_sent: {
        Row: {
          alert_type: string
          budget_id: string
          id: string
          period_end: string
          period_start: string
          sent_at: string
          user_id: string
        }
        Insert: {
          alert_type: string
          budget_id: string
          id?: string
          period_end: string
          period_start: string
          sent_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          budget_id?: string
          id?: string
          period_end?: string
          period_start?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_alerts_sent_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_recipients: {
        Row: {
          budget_id: string
          created_at: string
          id: string
          recipient_id: string
          user_id: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          id?: string
          recipient_id: string
          user_id: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          id?: string
          recipient_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_recipients_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_recipients_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "telegram_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          alert_daily_report: boolean
          alert_exceeded_enabled: boolean
          alert_threshold_enabled: boolean
          alert_threshold_percent: number | null
          amount: number
          category_id: string | null
          cost_center_id: string | null
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          period_type: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_daily_report?: boolean
          alert_exceeded_enabled?: boolean
          alert_threshold_enabled?: boolean
          alert_threshold_percent?: number | null
          amount: number
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          period_type: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_daily_report?: boolean
          alert_exceeded_enabled?: boolean
          alert_threshold_enabled?: boolean
          alert_threshold_percent?: number | null
          amount?: number
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          period_type?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          category_type: Database["public"]["Enums"]["category_type"]
          color: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category_type: Database["public"]["Enums"]["category_type"]
          color?: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category_type?: Database["public"]["Enums"]["category_type"]
          color?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          center_type: Database["public"]["Enums"]["cost_center_type"]
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          center_type?: Database["public"]["Enums"]["cost_center_type"]
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          center_type?: Database["public"]["Enums"]["cost_center_type"]
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_card_transactions: {
        Row: {
          amount: number
          card_id: string
          category_id: string | null
          cost_center_id: string | null
          created_at: string
          description: string
          external_id: string | null
          id: string
          installment_number: number
          installment_total: number
          notes: string | null
          paid_at: string | null
          purchase_date: string
          reviewed_at: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          card_id: string
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          description: string
          external_id?: string | null
          id?: string
          installment_number?: number
          installment_total?: number
          notes?: string | null
          paid_at?: string | null
          purchase_date?: string
          reviewed_at?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          card_id?: string
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          description?: string
          external_id?: string | null
          id?: string
          installment_number?: number
          installment_total?: number
          notes?: string | null
          paid_at?: string | null
          purchase_date?: string
          reviewed_at?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          bank_connection_id: string | null
          closing_day: number
          color: string
          created_at: string
          credit_limit: number
          due_day: number
          id: string
          institution: string | null
          is_active: boolean
          name: string
          pluggy_account_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_connection_id?: string | null
          closing_day?: number
          color?: string
          created_at?: string
          credit_limit?: number
          due_day?: number
          id?: string
          institution?: string | null
          is_active?: boolean
          name: string
          pluggy_account_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_connection_id?: string | null
          closing_day?: number
          color?: string
          created_at?: string
          credit_limit?: number
          due_day?: number
          id?: string
          institution?: string | null
          is_active?: boolean
          name?: string
          pluggy_account_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          currency: string
          fetched_at: string
          rate_date: string | null
          rate_to_brl: number
        }
        Insert: {
          currency: string
          fetched_at?: string
          rate_date?: string | null
          rate_to_brl: number
        }
        Update: {
          currency?: string
          fetched_at?: string
          rate_date?: string | null
          rate_to_brl?: number
        }
        Relationships: []
      }
      investment_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          external_id: string
          id: string
          investment_id: string
          matched_transaction_id: string | null
          movement_type: string
          quantity: number | null
          trade_date: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          external_id: string
          id?: string
          investment_id: string
          matched_transaction_id?: string | null
          movement_type: string
          quantity?: number | null
          trade_date: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          external_id?: string
          id?: string
          investment_id?: string
          matched_transaction_id?: string | null
          movement_type?: string
          quantity?: number | null
          trade_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_transactions_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          amount_original: number | null
          amount_profit: number | null
          balance: number
          bank_connection_id: string | null
          created_at: string
          currency: string
          id: string
          investment_subtype: string | null
          investment_type: string
          last_synced_at: string | null
          name: string
          pluggy_investment_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_original?: number | null
          amount_profit?: number | null
          balance?: number
          bank_connection_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          investment_subtype?: string | null
          investment_type: string
          last_synced_at?: string | null
          name: string
          pluggy_investment_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_original?: number | null
          amount_profit?: number | null
          balance?: number
          bank_connection_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          investment_subtype?: string | null
          investment_type?: string
          last_synced_at?: string | null
          name?: string
          pluggy_investment_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      pluggy_credentials: {
        Row: {
          client_id: string
          client_secret: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          client_secret: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          dashboard_filters: Json | null
          display_name: string
          id: string
          pluggy_configured: boolean
          preferred_currency: string
          transactions_filters: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dashboard_filters?: Json | null
          display_name?: string
          id: string
          pluggy_configured?: boolean
          preferred_currency?: string
          transactions_filters?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dashboard_filters?: Json | null
          display_name?: string
          id?: string
          pluggy_configured?: boolean
          preferred_currency?: string
          transactions_filters?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          bank_connection_id: string | null
          created_at: string
          description: string | null
          id: string
          source: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_connection_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          source?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_connection_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_digests: {
        Row: {
          card_transaction_ids: Json
          chat_id: string
          id: string
          recipient_id: string | null
          resolved_at: string | null
          sent_at: string
          transaction_ids: Json
          user_id: string
        }
        Insert: {
          card_transaction_ids?: Json
          chat_id: string
          id?: string
          recipient_id?: string | null
          resolved_at?: string | null
          sent_at?: string
          transaction_ids?: Json
          user_id: string
        }
        Update: {
          card_transaction_ids?: Json
          chat_id?: string
          id?: string
          recipient_id?: string | null
          resolved_at?: string | null
          sent_at?: string
          transaction_ids?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_digests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "telegram_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_recipients: {
        Row: {
          account_ids: Json
          all_accounts: boolean
          card_ids: Json
          created_at: string
          id: string
          label: string
          link_token: string
          notify_daily: boolean
          notify_monthly: boolean
          notify_weekly: boolean
          telegram_chat_id: string | null
          telegram_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_ids?: Json
          all_accounts?: boolean
          card_ids?: Json
          created_at?: string
          id?: string
          label?: string
          link_token?: string
          notify_daily?: boolean
          notify_monthly?: boolean
          notify_weekly?: boolean
          telegram_chat_id?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_ids?: Json
          all_accounts?: boolean
          card_ids?: Json
          created_at?: string
          id?: string
          label?: string
          link_token?: string
          notify_daily?: boolean
          notify_monthly?: boolean
          notify_weekly?: boolean
          telegram_chat_id?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          cost_center_id: string | null
          created_at: string
          description: string
          destination_account_id: string | null
          external_id: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          source: string
          status: string
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          description: string
          destination_account_id?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          source?: string
          status?: string
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          description?: string
          destination_account_id?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          source?: string
          status?: string
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_type: "checking" | "savings" | "cash" | "investment" | "credit"
      asset_type: "asset" | "liability"
      category_type: "income" | "expense"
      cost_center_type: "property" | "business" | "personal" | "other"
      transaction_type: "income" | "expense" | "transfer"
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
      account_type: ["checking", "savings", "cash", "investment", "credit"],
      asset_type: ["asset", "liability"],
      category_type: ["income", "expense"],
      cost_center_type: ["property", "business", "personal", "other"],
      transaction_type: ["income", "expense", "transfer"],
    },
  },
} as const
