import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { ProjectVersion } from '@/lib/types/database'
import { usePreviewStore } from './preview-store'

interface VersionState {
  versions: ProjectVersion[]
  currentVersionNumber: number | null
  isLoading: boolean

  fetchVersions: (projectId: string) => Promise<void>
  createSnapshot: (
    projectId: string,
    agentId?: string,
    description?: string,
    messageId?: string
  ) => Promise<ProjectVersion | null>
  restoreVersion: (projectId: string, versionId: string) => Promise<boolean>
  clearVersions: () => void
}

export const useVersionStore = create<VersionState>((set, get) => ({
  versions: [],
  currentVersionNumber: null,
  isLoading: false,

  fetchVersions: async (projectId: string) => {
    set({ isLoading: true })
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('project_versions')
        .select('*')
        .eq('project_id', projectId)
        .order('version_number', { ascending: false })

      if (error) throw error

      const versions = data || []
      const latestVersion = versions.length > 0 ? versions[0].version_number : null

      set({
        versions,
        currentVersionNumber: latestVersion,
        isLoading: false,
      })
    } catch (error) {
      console.error('Failed to fetch versions:', error)
      set({ isLoading: false })
    }
  },

  createSnapshot: async (projectId: string, agentId?: string, description?: string, messageId?: string) => {
    try {
      const supabase = createClient()

      // Get the next version number
      const { versions } = get()
      const nextVersionNumber = versions.length > 0
        ? Math.max(...versions.map(v => v.version_number)) + 1
        : 1

      // Get current files from preview store
      const previewStore = usePreviewStore.getState()
      const files = previewStore.files

      if (files.length === 0) {
        return null
      }

      // Create version record
      const { data: versionData, error: versionError } = await supabase
        .from('project_versions')
        .insert({
          project_id: projectId,
          version_number: nextVersionNumber,
          description: description || null,
          agent_id: agentId || null,
          message_id: messageId || null,
        })
        .select()
        .single()

      if (versionError) throw versionError

      // Copy all current files to version_files
      const versionFiles = files.map(f => ({
        version_id: versionData.id,
        path: f.path,
        content: f.content,
      }))

      const { error: filesError } = await supabase
        .from('version_files')
        .insert(versionFiles)

      if (filesError) {
        // Rollback version if files insert failed
        await supabase
          .from('project_versions')
          .delete()
          .eq('id', versionData.id)
        throw filesError
      }

      // Update local state
      set((state) => ({
        versions: [versionData, ...state.versions],
        currentVersionNumber: nextVersionNumber,
      }))

      return versionData
    } catch (error) {
      console.error('Failed to create snapshot:', error)
      return null
    }
  },

  restoreVersion: async (projectId: string, versionId: string) => {
    set({ isLoading: true })
    try {
      const supabase = createClient()

      // Get version files
      const { data: versionFiles, error: fetchError } = await supabase
        .from('version_files')
        .select('*')
        .eq('version_id', versionId)

      if (fetchError) throw fetchError
      if (!versionFiles || versionFiles.length === 0) {
        throw new Error('Version files not found')
      }

      // Delete all current files for the project
      const { error: deleteError } = await supabase
        .from('files')
        .delete()
        .eq('project_id', projectId)

      if (deleteError) throw deleteError

      // Insert version files as current files
      const newFiles = versionFiles.map(vf => ({
        project_id: projectId,
        path: vf.path,
        content: vf.content,
      }))

      const { error: insertError } = await supabase
        .from('files')
        .insert(newFiles)

      if (insertError) throw insertError

      // Refresh preview store files
      const previewStore = usePreviewStore.getState()
      await previewStore.fetchFiles(projectId)

      // Get the restored version number
      const restoredVersion = get().versions.find(v => v.id === versionId)
      if (restoredVersion) {
        set({ currentVersionNumber: restoredVersion.version_number })
      }

      set({ isLoading: false })
      return true
    } catch (error) {
      console.error('Failed to restore version:', error)
      set({ isLoading: false })
      return false
    }
  },

  clearVersions: () => {
    set({
      versions: [],
      currentVersionNumber: null,
      isLoading: false,
    })
  },
}))
