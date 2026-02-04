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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center space-y-8 px-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold text-2xl shadow-lg">
            A
          </div>
          <h1 className="text-2xl font-bold text-gray-900">欢迎使用 Atoms</h1>
          <p className="text-center text-sm text-gray-500">
            AI 助手帮你构建产品
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full h-11 text-base"
          onClick={handleGoogleLogin}
        >
          <Chrome className="mr-2 h-5 w-5" />
          使用 Google 登录
        </Button>

        <p className="text-center text-xs text-gray-400">
          继续即表示你同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  )
}
