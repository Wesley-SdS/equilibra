"use client"

import { animate, motion, useInView, useMotionValue, useScroll, useTransform } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const ease = [0.22, 1, 0.36, 1] as const

export function Reveal({
  children,
  delay = 0,
  className,
  y = 24,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  y?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease }}
    >
      {children}
    </motion.div>
  )
}

/** Título com entrada palavra por palavra. */
export function SplitHeadline({ text, className, muted = [] }: { text: string; className?: string; muted?: number[] }) {
  const words = text.split(" ")
  return (
    <h1 className={className}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className={cn("inline-block whitespace-pre", muted.includes(i) && "text-subtle")}
          initial={{ opacity: 0, y: "0.4em", filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.15 + i * 0.06, ease }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </h1>
  )
}

export function Counter({ to, suffix = "", className }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const value = useMotionValue(0)
  const [display, setDisplay] = useState("0")
  useEffect(() => {
    if (!inView) return
    const controls = animate(value, to, { duration: 1.6, ease })
    const unsub = value.on("change", (v) => setDisplay(Math.round(v).toLocaleString("pt-BR")))
    return () => {
      controls.stop()
      unsub()
    }
  }, [inView, to, value])
  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  )
}

/** Card com holofote que segue o cursor. */
export function SpotlightCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        ref.current!.style.setProperty("--x", `${e.clientX - r.left}px`)
        ref.current!.style.setProperty("--y", `${e.clientY - r.top}px`)
      }}
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-line bg-surface transition-colors duration-300 hover:border-line-strong",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(420px circle at var(--x) var(--y), rgba(198,245,111,0.09), transparent 60%)" }}
      />
      <div className="relative h-full">{children}</div>
    </div>
  )
}

/** Inclinação 3D suave do mockup do produto conforme o scroll. */
export function TiltOnScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 30%"] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [18, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1])
  const opacity = useTransform(scrollYProgress, [0, 0.4], [0.4, 1])
  return (
    <div ref={ref} className={className} style={{ perspective: 1400 }}>
      <motion.div style={{ rotateX, scale, opacity, transformOrigin: "50% 0%" }}>{children}</motion.div>
    </div>
  )
}
