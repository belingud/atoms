export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          project_id: string
          role: 'user' | 'assistant'
          content: string
          agent_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          role: 'user' | 'assistant'
          content: string
          agent_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          role?: 'user' | 'assistant'
          content?: string
          agent_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'messages_project_id_fkey'
            columns: ['project_id']
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      files: {
        Row: {
          id: string
          project_id: string
          path: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          path: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          path?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'files_project_id_fkey'
            columns: ['project_id']
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      project_versions: {
        Row: {
          id: string
          project_id: string
          version_number: number
          description: string | null
          agent_id: string | null
          message_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          version_number: number
          description?: string | null
          agent_id?: string | null
          message_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          version_number?: number
          description?: string | null
          agent_id?: string | null
          message_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'project_versions_project_id_fkey'
            columns: ['project_id']
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'project_versions_message_id_fkey'
            columns: ['message_id']
            referencedRelation: 'messages'
            referencedColumns: ['id']
          }
        ]
      }
      version_files: {
        Row: {
          id: string
          version_id: string
          path: string
          content: string
        }
        Insert: {
          id?: string
          version_id: string
          path: string
          content: string
        }
        Update: {
          id?: string
          version_id?: string
          path?: string
          content?: string
        }
        Relationships: [
          {
            foreignKeyName: 'version_files_version_id_fkey'
            columns: ['version_id']
            referencedRelation: 'project_versions'
            referencedColumns: ['id']
          }
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

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type Project = Tables<'projects'>
export type Message = Tables<'messages'>
export type File = Tables<'files'>
export type ProjectVersion = Tables<'project_versions'>
export type VersionFile = Tables<'version_files'>
