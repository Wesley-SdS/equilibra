import type { Metadata } from "next"
import { LegalPage } from "@/components/legal-page"

export const dynamic = "force-static"
export const metadata: Metadata = { title: "Política de Privacidade · Equilibra" }

export default function Page() {
  return <LegalPage doc="politica-de-privacidade" />
}
