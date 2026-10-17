import type { Metadata } from "next"
import { LegalPage } from "@/components/legal-page"

export const dynamic = "force-static"
export const metadata: Metadata = { title: "Termos de Uso · Equilibra" }

export default function Page() {
  return <LegalPage doc="termos-de-uso" />
}
