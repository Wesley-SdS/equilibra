import type { Metadata } from "next"
import { LegalPage } from "@/components/legal-page"

export const dynamic = "force-static"
export const metadata: Metadata = { title: "Acordo de Tratamento de Dados (DPA) · Equilibra" }

export default function Page() {
  return <LegalPage doc="dpa" />
}
