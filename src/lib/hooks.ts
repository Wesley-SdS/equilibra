"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "./client"

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await client.auth.me.$get()).json(),
    retry: false,
  })
}

/** Permissões do usuário na empresa ativa (o servidor também valida cada ação). */
export function useCan() {
  const role = useMe().data?.role
  return {
    role,
    edit: role === "owner" || role === "admin",
    manage: role === "owner",
  }
}

export const ROLE_LABEL = { owner: "Dono", admin: "Admin", viewer: "Leitor" } as const
