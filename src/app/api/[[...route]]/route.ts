import { handle } from "hono/vercel"
import appRouter from "@/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = handle(appRouter.handler)
export const POST = handle(appRouter.handler)
