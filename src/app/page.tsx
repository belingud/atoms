import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MainApp } from '@/components/layout/main-app'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <MainApp
      user={{
        name: user.user_metadata?.full_name || user.email?.split('@')[0],
        email: user.email,
        avatarUrl: user.user_metadata?.avatar_url,
      }}
    />
  )
}
