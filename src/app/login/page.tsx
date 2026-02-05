'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Chrome } from 'lucide-react'

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        queryParams: {
          prompt: 'select_account',
        },
      },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center space-y-8 px-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white font-bold text-3xl shadow-xl shadow-blue-500/20 ring-4 ring-white/50">
            A
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">欢迎使用 Atoms</h1>
          <p className="text-center text-sm text-gray-500 max-w-[240px]">
            AI 助手帮你构建产品，让创意快速落地
          </p>
        </div>

        <div className="w-full space-y-4">
          <Button
            variant="outline"
            className="w-full h-12 text-base bg-white hover:bg-gray-50 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 rounded-xl"
            onClick={handleGoogleLogin}
          >
            <Chrome className="mr-3 h-5 w-5 text-red-500" />
            使用 Google 登录
          </Button>
        </div>

        <p className="text-center text-xs text-gray-400">
          继续即表示你同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  )
}
