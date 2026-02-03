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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      categorias: {
        Row: {
          categoria_pai_id: string | null
          cor: string
          created_at: string
          icone: string | null
          id: string
          is_default: boolean
          nome: string
          tipo: string
          user_id: string
        }
        Insert: {
          categoria_pai_id?: string | null
          cor?: string
          created_at?: string
          icone?: string | null
          id?: string
          is_default?: boolean
          nome: string
          tipo: string
          user_id: string
        }
        Update: {
          categoria_pai_id?: string | null
          cor?: string
          created_at?: string
          icone?: string | null
          id?: string
          is_default?: boolean
          nome?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_categoria_pai_id_fkey"
            columns: ["categoria_pai_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      contas: {
        Row: {
          cor: string
          created_at: string
          dia_fechamento: number | null
          dia_vencimento: number | null
          id: string
          limite: number | null
          nome_conta: string
          saldo_inicial: number
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cor?: string
          created_at?: string
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite?: number | null
          nome_conta: string
          saldo_inicial?: number
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cor?: string
          created_at?: string
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite?: number | null
          nome_conta?: string
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      faturas_cartao: {
        Row: {
          conta_cartao_id: string
          created_at: string
          id: string
          mes_referencia: string
          status: string
          updated_at: string
          user_id: string
          valor_pago: number
          valor_total: number
          vencimento_fatura: string
        }
        Insert: {
          conta_cartao_id: string
          created_at?: string
          id?: string
          mes_referencia: string
          status?: string
          updated_at?: string
          user_id: string
          valor_pago?: number
          valor_total?: number
          vencimento_fatura: string
        }
        Update: {
          conta_cartao_id?: string
          created_at?: string
          id?: string
          mes_referencia?: string
          status?: string
          updated_at?: string
          user_id?: string
          valor_pago?: number
          valor_total?: number
          vencimento_fatura?: string
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cartao_conta_cartao_id_fkey"
            columns: ["conta_cartao_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      financiamento: {
        Row: {
          created_at: string | null
          data_contratacao: string | null
          data_primeira_parcela: string
          id: string
          numero_parcelas: number
          taxa_diaria: number
          taxa_mensal: number
          updated_at: string | null
          user_id: string | null
          valor_financiado: number
          valor_parcela: number
        }
        Insert: {
          created_at?: string | null
          data_contratacao?: string | null
          data_primeira_parcela: string
          id?: string
          numero_parcelas: number
          taxa_diaria?: number
          taxa_mensal?: number
          updated_at?: string | null
          user_id?: string | null
          valor_financiado: number
          valor_parcela: number
        }
        Update: {
          created_at?: string | null
          data_contratacao?: string | null
          data_primeira_parcela?: string
          id?: string
          numero_parcelas?: number
          taxa_diaria?: number
          taxa_mensal?: number
          updated_at?: string | null
          user_id?: string | null
          valor_financiado?: number
          valor_parcela?: number
        }
        Relationships: []
      }
      orcamentos: {
        Row: {
          categoria_id: string
          created_at: string
          id: string
          mes_referencia: string
          user_id: string
          valor_limite: number
        }
        Insert: {
          categoria_id: string
          created_at?: string
          id?: string
          mes_referencia: string
          user_id: string
          valor_limite: number
        }
        Update: {
          categoria_id?: string
          created_at?: string
          id?: string
          mes_referencia?: string
          user_id?: string
          valor_limite?: number
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelas: {
        Row: {
          amortizacao: number | null
          antecipada: boolean | null
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string
          dias_antecedencia: number | null
          economia: number | null
          financiamento_id: string
          id: string
          juros: number | null
          numero_parcela: number
          pago: boolean | null
          updated_at: string | null
          valor_pago: number | null
          valor_parcela: number
        }
        Insert: {
          amortizacao?: number | null
          antecipada?: boolean | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          dias_antecedencia?: number | null
          economia?: number | null
          financiamento_id: string
          id?: string
          juros?: number | null
          numero_parcela: number
          pago?: boolean | null
          updated_at?: string | null
          valor_pago?: number | null
          valor_parcela: number
        }
        Update: {
          amortizacao?: number | null
          antecipada?: boolean | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          dias_antecedencia?: number | null
          economia?: number | null
          financiamento_id?: string
          id?: string
          juros?: number | null
          numero_parcela?: number
          pago?: boolean | null
          updated_at?: string | null
          valor_pago?: number | null
          valor_parcela?: number
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_financiamento_id_fkey"
            columns: ["financiamento_id"]
            isOneToOne: false
            referencedRelation: "financiamento"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes: {
        Row: {
          categoria_id: string | null
          conta_destino_id: string | null
          conta_id: string
          created_at: string
          data: string
          data_execucao_pagamento: string | null
          descricao: string | null
          external_id: string | null
          forma_pagamento: string
          id: string
          is_pago_executado: boolean | null
          parcela_atual: number | null
          parcelas_total: number | null
          recorrencia: string | null
          tipo: string
          transacao_origem_id: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          conta_destino_id?: string | null
          conta_id: string
          created_at?: string
          data: string
          data_execucao_pagamento?: string | null
          descricao?: string | null
          external_id?: string | null
          forma_pagamento: string
          id?: string
          is_pago_executado?: boolean | null
          parcela_atual?: number | null
          parcelas_total?: number | null
          recorrencia?: string | null
          tipo: string
          transacao_origem_id?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          conta_destino_id?: string | null
          conta_id?: string
          created_at?: string
          data?: string
          data_execucao_pagamento?: string | null
          descricao?: string | null
          external_id?: string | null
          forma_pagamento?: string
          id?: string
          is_pago_executado?: boolean | null
          parcela_atual?: number | null
          parcelas_total?: number | null
          recorrencia?: string | null
          tipo?: string
          transacao_origem_id?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_conta_destino_id_fkey"
            columns: ["conta_destino_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_transacao_origem_id_fkey"
            columns: ["transacao_origem_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
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
    Enums: {},
  },
} as const
