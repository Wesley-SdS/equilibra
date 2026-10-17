import { HTTPException } from "hono/http-exception"
import { ZodError } from "zod"
import { j } from "./jstack"
import { authRouter } from "./routers/auth-router"
import { channelRouter, surveyRouter } from "./routers/public-router"
import { companyRouter, teamRouter } from "./routers/team-router"
import { questionsRouter } from "./routers/questions-router"
import { billingRouter } from "./routers/billing-router"
import { accountRouter } from "./routers/account-router"
import {
  actionsRouter,
  campaignsRouter,
  channelAdminRouter,
  insightsRouter,
  reportRouter,
  sectorsRouter,
} from "./routers/workspace-router"

// Erros de validação viram 422 com a primeira mensagem do Zod, legível na UI.
function handleError(err: Error) {
  if (err instanceof ZodError) {
    return new Response(err.issues[0]?.message ?? "Dados inválidos", { status: 422 })
  }
  if (err instanceof HTTPException) return err.getResponse()
  console.error("[API Error]", err)
  return new Response("Erro inesperado. Tente novamente.", { status: 500 })
}

// O jStack 1.1 guarda o onError sem repassá-lo aos sub-routers (cada um é um app Hono
// próprio), então registramos o handler direto no campo do Hono de cada router.
function withErrors<T extends object>(router: T): T {
  ;(router as unknown as { errorHandler: typeof handleError }).errorHandler = handleError
  return router
}

const api = withErrors(j.router().basePath("/api").use(j.defaults.cors))

const appRouter = j.mergeRouters(api, {
  auth: withErrors(authRouter),
  sectors: withErrors(sectorsRouter),
  campaigns: withErrors(campaignsRouter),
  insights: withErrors(insightsRouter),
  actions: withErrors(actionsRouter),
  report: withErrors(reportRouter),
  survey: withErrors(surveyRouter),
  channel: withErrors(channelRouter),
  channelAdmin: withErrors(channelAdminRouter),
  team: withErrors(teamRouter),
  company: withErrors(companyRouter),
  questions: withErrors(questionsRouter),
  billing: withErrors(billingRouter),
  account: withErrors(accountRouter),
})

export type AppRouter = typeof appRouter

export default appRouter
