"use client"

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ProductPreview } from "@/components/landing/product-preview"
import { RoiCalculator } from "@/components/landing/roi-calculator"
import { Counter, Reveal, SpotlightCard, SplitHeadline, TiltOnScroll } from "@/components/landing/motion-bits"
import { ThemeToggle } from "@/components/theme"
import { ButtonLink, Eyebrow, Logo } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"

const ENFORCEMENT_START = new Date("2026-05-26T00:00:00-03:00")

export default function LandingPage() {
  // Calculado no cliente para não divergir do HTML pré-renderizado no build.
  const [daysActive, setDaysActive] = useState(0)
  useEffect(() => {
    setDaysActive(Math.max(0, Math.floor((Date.now() - ENFORCEMENT_START.getTime()) / 86_400_000)))
  }, [])

  return (
    <div className="relative overflow-x-clip">
      <Nav />

      {/* HERO */}
      <section className="relative">
        <div aria-hidden="true" className="bg-grid absolute inset-0 h-[900px]" />
        <motion.div
          aria-hidden="true"
          className="absolute left-1/2 top-[-280px] h-[720px] w-[1200px] -translate-x-1/2 rounded-full bg-glow"
          animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.05, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-20 pt-36 text-center sm:px-6 sm:pt-44">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Link
              href="#nr1"
              className="group inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-tint/[0.04] py-1.5 pl-1.5 pr-4 text-[13px] text-muted backdrop-blur transition-colors hover:text-fg"
            >
              <span className="relative flex items-center gap-1.5 rounded-full bg-risk-crit/15 px-2 py-0.5 font-mono text-xs text-risk-crit-fg">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-risk-crit-fg opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-risk-crit-fg" />
                </span>
                NR-1
              </span>
              {daysActive ? `Fiscalização ativa há ${daysActive} dias` : "Fiscalização ativa desde 26/05/2026"}
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </motion.div>

          <SplitHeadline
            text="Riscos psicossociais mapeados. PGR pronto em 7 dias."
            muted={[2]}
            className="mt-8 max-w-5xl text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-7xl lg:text-[88px]"
          />

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.7 }}
            className="mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-muted sm:text-xl"
          >
            Questionário anônimo, mapa de risco por setor e plano de ação 5W2H prontos para a fiscalização. Sem consultoria cara, sem planilha.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.7 }}
            className="mt-10 flex flex-wrap justify-center gap-3"
          >
            <ButtonLink href="/comecar" size="lg">
              Criar avaliação grátis
            </ButtonLink>
            <ButtonLink href="/entrar?demo=1" size="lg" variant="secondary">
              Ver painel de demonstração
            </ButtonLink>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.8 }}
            className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-subtle"
          >
            {["Anonimato com k-anonimato", "Relatório pronto para o PGR", "Conforme LGPD"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check /> {t}
              </li>
            ))}
          </motion.ul>
        </div>

        <TiltOnScroll className="relative mx-auto max-w-6xl px-4 pb-28 sm:px-6">
          <ProductPreview />
        </TiltOnScroll>
      </section>

      {/* MARQUEE */}
      <section aria-label="Segmentos atendidos" className="border-y border-line bg-surface/40 py-6">
        <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]">
          <div className="flex w-max animate-marquee gap-12 whitespace-nowrap text-lg text-subtle">
            {[...SEGMENTS, ...SEGMENTS].map((s, i) => (
              <span key={i} className="flex items-center gap-12">
                {s}
                <span className="size-1 rounded-full bg-line-strong" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* POR QUE AGORA */}
      <section id="nr1" className="mx-auto max-w-6xl px-4 py-28 sm:px-6">
        <Reveal className="flex max-w-3xl flex-col gap-4">
          <Eyebrow>{"// POR QUE AGORA"}</Eyebrow>
          <h2 className="text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
            A NR-1 mudou. O período educativo acabou.
          </h2>
          <p className="text-lg leading-relaxed text-muted">
            Desde 26 de maio de 2026, os fatores de risco psicossociais precisam estar identificados, avaliados e com plano de ação dentro do GRO/PGR. Vale para toda empresa com empregado CLT.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
          {[
            { n: 100, s: "%", t: "das empresas com CLT estão sujeitas à exigência, de qualquer porte." },
            { n: daysActive, s: " dias", t: "de fiscalização punitiva ativa, sem previsão de novo adiamento." },
            { n: 7, s: " dias", t: "é o tempo médio para sair do zero ao relatório com o Equilibra." },
          ].map((item, i) => (
            <Reveal key={i} delay={i * 0.1} className="flex flex-col gap-3 bg-bg p-8">
              <Counter to={item.n} suffix={item.s} className="text-5xl font-semibold tracking-tight" />
              <p className="leading-relaxed text-muted">{item.t}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BENTO */}
      <section id="produto" className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        <Reveal className="flex max-w-3xl flex-col gap-4">
          <Eyebrow>{"// PRODUTO"}</Eyebrow>
          <h2 className="text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
            Compliance que roda sozinho, do link ao relatório.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          <Reveal className="md:col-span-2">
            <SpotlightCard className="min-h-72 p-8">
              <BentoBody n="01" title="Anonimato de verdade" text="Setores com menos de 5 respostas nunca aparecem isolados. Não guardamos IP, e-mail nem horário exato.">
                <div className="mt-6 flex flex-wrap gap-2">
                  {["sem IP", "sem e-mail", "k ≥ 5", "data truncada"].map((t) => (
                    <span key={t} className="rounded-full border border-line-strong px-3 py-1 font-mono text-xs text-muted">
                      {t}
                    </span>
                  ))}
                </div>
              </BentoBody>
            </SpotlightCard>
          </Reveal>
          <Reveal delay={0.08}>
            <SpotlightCard className="min-h-72 p-8">
              <BentoBody n="02" title="6 minutos no celular" text="28 perguntas, uma por tela, sem login. Taxa de resposta acima de 55%." />
            </SpotlightCard>
          </Reveal>
          <Reveal delay={0.04}>
            <SpotlightCard className="min-h-72 p-8">
              <BentoBody n="03" title="7 dimensões por setor" text="Demandas, autonomia, liderança, colegas, assédio, clareza de papel e reconhecimento." />
            </SpotlightCard>
          </Reveal>
          <Reveal delay={0.1} className="md:col-span-2">
            <SpotlightCard className="min-h-72 border-brand/25 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(198,245,111,0.13),transparent_60%)] p-8">
              <BentoBody n="04" title="Inventário e plano 5W2H prontos" text="Ações sugeridas por dimensão crítica, responsáveis, prazos e um relatório imprimível para anexar ao PGR." accent />
            </SpotlightCard>
          </Reveal>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        <Reveal className="flex max-w-3xl flex-col gap-4">
          <Eyebrow>{"// COMO FUNCIONA"}</Eyebrow>
          <h2 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Quatro passos. Zero planilha.</h2>
        </Reveal>
        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.t} delay={i * 0.08}>
              <li className="relative flex h-full flex-col gap-3 rounded-3xl border border-line p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-tint/[0.05] font-mono text-sm text-brand-fg">{i + 1}</span>
                <h3 className="text-lg font-semibold">{s.t}</h3>
                <p className="leading-relaxed text-muted">{s.d}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* PRIVACIDADE */}
      <section id="seguranca" className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <Reveal className="flex flex-col gap-4">
            <Eyebrow>{"// PRIVACIDADE E LGPD"}</Eyebrow>
            <h2 className="text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Anonimato por arquitetura, não por promessa.</h2>
            <p className="text-lg leading-relaxed text-muted">
              Quem responde precisa confiar. Por isso a identificação é impossível por desenho do sistema, e não depende de alguém “não olhar”.
            </p>
          </Reveal>
          <div className="grid gap-3 sm:grid-cols-2">
            {PRIVACY.map((p, i) => (
              <Reveal key={p.t} delay={i * 0.06}>
                <div className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-fg" aria-hidden="true">
                    <path d={p.icon} />
                  </svg>
                  <h3 className="font-semibold">{p.t}</h3>
                  <p className="text-sm leading-relaxed text-muted">{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CALCULADORA */}
      <section id="economia" className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        <Reveal className="mb-12 flex max-w-3xl flex-col gap-4">
          <Eyebrow>{"// QUANTO VOCÊ ECONOMIZA"}</Eyebrow>
          <h2 className="text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Contínuo custa menos que pontual.</h2>
        </Reveal>
        <Reveal>
          <RoiCalculator />
        </Reveal>
      </section>

      {/* PLANOS */}
      <section id="planos" className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        <Reveal className="flex flex-col gap-4">
          <Eyebrow>{"// PLANOS"}</Eyebrow>
          <h2 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Preço simples, por porte.</h2>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <div
                className={cn(
                  "relative flex h-full flex-col gap-6 rounded-3xl border p-8",
                  p.featured ? "border-brand/40 bg-brand/[0.05]" : "border-line"
                )}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-8 rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-ink">Mais escolhido</span>
                )}
                <div>
                  <h3 className={cn("font-medium", p.featured ? "text-brand-fg" : "text-muted")}>{p.name}</h3>
                  <p className="text-sm text-subtle">{p.size}</p>
                </div>
                <p className="text-5xl font-semibold tracking-tight">
                  {p.price}
                  <span className="text-base font-normal text-subtle">/mês</span>
                </p>
                <ul className="flex flex-1 flex-col gap-3 text-[15px] text-muted">
                  {p.items.map((it) => (
                    <li key={it} className="flex gap-2.5">
                      <Check /> {it}
                    </li>
                  ))}
                </ul>
                <ButtonLink href="/comecar" variant={p.featured ? "primary" : "secondary"}>
                  {p.cta}
                </ButtonLink>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-28 sm:px-6">
        <Reveal className="mb-10 flex flex-col gap-4">
          <Eyebrow>{"// PERGUNTAS FREQUENTES"}</Eyebrow>
          <h2 className="text-4xl font-semibold tracking-[-0.035em]">Dúvidas comuns</h2>
        </Reveal>
        <Faq />
      </section>

      {/* CTA PARCEIROS */}
      <section id="parceiros" className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] border border-line bg-surface px-8 py-16 text-center sm:px-16">
            <div aria-hidden="true" className="bg-grid absolute inset-0 opacity-60" />
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-full h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: "radial-gradient(closest-side, rgba(198,245,111,0.18), transparent)" }}
            />
            <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
              <h2 className="text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Contador ou consultoria de SST?</h2>
              <p className="text-lg text-muted">Atenda toda a sua carteira num painel só, com a sua marca. A partir de 10 empresas.</p>
              <div className="flex flex-wrap justify-center gap-3">
                <ButtonLink href="/comecar" size="lg">
                  Quero ser parceiro
                </ButtonLink>
                <ButtonLink href="/entrar?demo=1" size="lg" variant="secondary">
                  Ver demonstração
                </ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-subtle sm:px-6">
          <Logo />
          <span>O Equilibra apoia a gestão de riscos. A responsabilidade técnica do PGR é da empresa.</span>
          <span>© 2026 Equilibra</span>
        </div>
      </footer>
    </div>
  )
}

function Nav() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24))
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3">
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl border px-4 py-2.5 transition-all duration-300",
          scrolled ? "border-line-strong bg-bg/70 shadow-2xl shadow-[var(--shadow)] backdrop-blur-xl" : "border-transparent"
        )}
      >
        <Link href="/" aria-label="Equilibra, página inicial">
          <Logo />
        </Link>
        <div className="hidden items-center gap-1 text-sm text-muted md:flex">
          {[
            ["#produto", "Produto"],
            ["#nr1", "NR-1"],
            ["#economia", "Economia"],
            ["#planos", "Planos"],
            ["#parceiros", "Parceiros"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 transition-colors hover:bg-tint/[0.05] hover:text-fg">
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle className="mr-1 hidden sm:inline-flex" />
          <ButtonLink href="/entrar" variant="ghost" size="sm">
            Entrar
          </ButtonLink>
          <ButtonLink href="/comecar" size="sm">
            Começar grátis
          </ButtonLink>
        </div>
      </motion.nav>
    </header>
  )
}

function BentoBody({
  n,
  title,
  text,
  accent,
  children,
}: {
  n: string
  title: string
  text: string
  accent?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-10">
      <span className={cn("font-mono text-xs", accent ? "text-brand-fg" : "text-subtle")}>{n}</span>
      <div className="flex flex-col gap-2">
        <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
        <p className="max-w-lg leading-relaxed text-muted">{text}</p>
        {children}
      </div>
    </div>
  )
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="divide-y divide-line rounded-3xl border border-line">
      {FAQ.map((f, i) => {
        const isOpen = open === i
        return (
          <div key={f.q}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left text-[17px] font-medium transition-colors hover:text-brand-fg"
            >
              {f.q}
              <motion.span animate={{ rotate: isOpen ? 45 : 0 }} className="text-2xl leading-none text-subtle">
                +
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-6 leading-relaxed text-muted">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 shrink-0 text-brand-fg" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const PRIVACY = [
  { t: "Nada que identifique", d: "Sem nome, e-mail, telefone, IP ou user-agent. A data da resposta é guardada só como dia.", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" },
  { t: "k-anonimato (k ≥ 5)", d: "Grupos com menos de 5 respostas nunca aparecem isolados; são somados ou ficam só no índice geral.", icon: "M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8" },
  { t: "Isolamento entre empresas", d: "Cada consulta é filtrada pela empresa da sessão, validada no banco a cada requisição.", icon: "M3 7h18v13H3zM8 7V4h8v3" },
  { t: "Trilha de auditoria", d: "Toda alteração no painel fica registrada com autor e data: evidência para a fiscalização.", icon: "M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11" },
]

const SEGMENTS = ["Indústria", "Varejo", "Clínicas e saúde", "Logística", "Restaurantes", "Tecnologia", "Construção", "Educação", "Escritórios contábeis", "Call centers"]

const STEPS = [
  { t: "Cadastre setores", d: "Informe áreas e quantidade de pessoas. Leva 2 minutos." },
  { t: "Envie o link anônimo", d: "Por WhatsApp, e-mail ou QR code no mural. Sem login." },
  { t: "Acompanhe o mapa", d: "Respostas entram em tempo real, com grupos pequenos protegidos." },
  { t: "Exporte o PGR", d: "Inventário de riscos e plano de ação prontos para anexar." },
]

const PLANS = [
  { name: "Essencial", size: "até 50 funcionários", price: "R$ 249", cta: "Começar", items: ["2 campanhas por ano", "Mapa de risco por setor", "Plano de ação 5W2H", "Relatório PGR"] },
  { name: "Profissional", size: "até 200 funcionários", price: "R$ 590", cta: "Começar", featured: true, items: ["Campanhas ilimitadas", "Canal de relato anônimo", "Histórico e evolução", "Suporte prioritário"] },
  { name: "Empresa", size: "200 a 500 funcionários", price: "R$ 1.290", cta: "Falar com vendas", items: ["Multiunidades", "SSO e auditoria", "Gerente de sucesso", "Integrações de SST"] },
]

const FAQ = [
  { q: "O questionário é realmente anônimo?", a: "Sim. Não coletamos nome, e-mail, IP nem horário exato. Os resultados só aparecem para grupos com 5 ou mais respostas; setores menores são agrupados." },
  { q: "Isso substitui o responsável técnico pelo PGR?", a: "Não. O Equilibra organiza a identificação, a avaliação e o plano de ação dos riscos psicossociais e gera a documentação. A assinatura do PGR continua com o responsável técnico da empresa." },
  { q: "Em quanto tempo consigo o relatório?", a: "Em média 7 dias: 5 minutos de configuração, cerca de 5 dias de coleta e o relatório é gerado na hora em que a campanha encerra." },
  { q: "Qual metodologia vocês usam?", a: "Um instrumento de 28 itens em 7 dimensões, inspirado em referências internacionais de avaliação psicossocial, com classificação de risco de 0 a 100 por dimensão e por setor." },
]
