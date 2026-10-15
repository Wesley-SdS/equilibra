"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "motion/react"
import { useState } from "react"
import { Toaster } from "./ui/toast"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
      })
  )
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <Toaster>{children}</Toaster>
      </MotionConfig>
    </QueryClientProvider>
  )
}
