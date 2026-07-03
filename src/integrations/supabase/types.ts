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
      clientes: {
        Row: {
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          nome_fantasia: string | null
          owner_id: string
          razao_social: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          nome_fantasia?: string | null
          owner_id: string
          razao_social: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          nome_fantasia?: string | null
          owner_id?: string
          razao_social?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      demonstrativos: {
        Row: {
          arquivo_nome: string | null
          arquivo_path: string | null
          cliente_id: string | null
          competencia: string | null
          created_at: string
          dados: Json
          erro_mensagem: string | null
          id: string
          owner_id: string
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["demo_status"]
          updated_at: string
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          cliente_id?: string | null
          competencia?: string | null
          created_at?: string
          dados?: Json
          erro_mensagem?: string | null
          id?: string
          owner_id: string
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["demo_status"]
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          cliente_id?: string | null
          competencia?: string | null
          created_at?: string
          dados?: Json
          erro_mensagem?: string | null
          id?: string
          owner_id?: string
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["demo_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demonstrativos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          escritorio_logo_url: string | null
          escritorio_nome: string | null
          id: string
          nome: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          escritorio_logo_url?: string | null
          escritorio_nome?: string | null
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          escritorio_logo_url?: string | null
          escritorio_nome?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prospeccoes: {
        Row: {
          cliente_id: string | null
          cnpj: string | null
          created_at: string
          dossie: Json
          faturamento_estimado: string | null
          google_rating: number | null
          id: string
          municipio: string | null
          nome_fantasia: string | null
          observacoes: string | null
          owner_id: string
          porte: string | null
          razao_social: string
          status: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          cnpj?: string | null
          created_at?: string
          dossie?: Json
          faturamento_estimado?: string | null
          google_rating?: number | null
          id?: string
          municipio?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          owner_id: string
          porte?: string | null
          razao_social: string
          status?: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          cnpj?: string | null
          created_at?: string
          dossie?: Json
          faturamento_estimado?: string | null
          google_rating?: number | null
          id?: string
          municipio?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          owner_id?: string
          porte?: string | null
          razao_social?: string
          status?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospeccoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
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
      demo_status: "processando" | "pendente" | "publicado" | "erro"
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
      demo_status: ["processando", "pendente", "publicado", "erro"],
    },
  },
} as const
