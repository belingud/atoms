import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/types/database'

interface ProjectState {
  projects: Project[]
  activeProject: Project | null
  isLoading: boolean
  error: string | null

  fetchProjects: () => Promise<void>
  createProject: (name: string) => Promise<Project | null>
  setActiveProject: (project: Project | null) => void
  deleteProject: (id: string) => Promise<void>
  renameProject: (id: string, newName: string) => Promise<boolean>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  isLoading: false,
  error: null,

  fetchProjects: async () => {
    set({ isLoading: true, error: null })
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error

      set({ projects: data || [], isLoading: false })

      // Don't auto-select project - let user choose or stay on welcome page
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  createProject: async (name: string) => {
    set({ isLoading: true, error: null })
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('projects')
        .insert({ name, user_id: user.id })
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        projects: [data, ...state.projects],
        activeProject: data,
        isLoading: false,
      }))

      return data
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return null
    }
  },

  setActiveProject: (project) => {
    set({ activeProject: project })
  },

  deleteProject: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)

      if (error) throw error

      set((state) => {
        const projects = state.projects.filter((p) => p.id !== id)
        const activeProject = state.activeProject?.id === id
          ? projects[0] || null
          : state.activeProject
        return { projects, activeProject, isLoading: false }
      })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  renameProject: async (id: string, newName: string) => {
    const trimmedName = newName.trim()
    if (!trimmedName) return false

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .update({ name: trimmedName })
        .eq('id', id)

      if (error) throw error

      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === id ? { ...p, name: trimmedName } : p
        )
        const activeProject = state.activeProject?.id === id
          ? { ...state.activeProject, name: trimmedName }
          : state.activeProject
        return { projects, activeProject }
      })

      return true
    } catch (error) {
      set({ error: (error as Error).message })
      return false
    }
  },
}))
