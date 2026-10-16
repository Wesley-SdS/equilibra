"use client"

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "motion/react"
import { useState } from "react"
import { requestUpgrade, UpgradeDialog } from "./app/upgrade-dialog"
import { Toaster } from "./ui/toast"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
        // 402 = limite do plano ou teste encerrado: abre o diálogo de upgrade em qualquer tela.
        mutationCache: new MutationCache({
          onError: (error) => {
            if ((error as { status?: number }).status === 402) requestUpgrade(error.message)
          },
        }),
      })
  )
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <Toaster>
          {children}
          <UpgradeDialog />
        </Toaster>
      </MotionConfig>
    </QueryClientProvider>
  )
}
