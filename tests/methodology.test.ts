import { describe, expect, it } from "vitest"
import { DIMENSIONS, QUESTIONS, inventoryRating, itemRisk, riskLevel, scoreDimensions } from "@/lib/methodology"

describe("metodologia", () => {
  it("tem 7 dimensões com 4 itens cada e ids únicos", () => {
    expect(DIMENSIONS).toHaveLength(7)
    for (const d of DIMENSIONS) expect(QUESTIONS.filter((q) => q.dimension === d.id)).toHaveLength(4)
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length)
  })

  it("inverte itens de proteção", () => {
    const risk = QUESTIONS.find((q) => q.risk)!
    const protective = QUESTIONS.find((q) => !q.risk)!
    expect(itemRisk(risk, 5)).toBe(4) // "Sempre" num fator de risco = risco máximo
    expect(itemRisk(risk, 1)).toBe(0)
    expect(itemRisk(protective, 5)).toBe(0) // "Sempre" num fator de proteção = sem risco
    expect(itemRisk(protective, 1)).toBe(4)
  })

  it("classifica nos limites do PRD", () => {
    expect(riskLevel(0)).toBe("baixo")
    expect(riskLevel(24)).toBe("baixo")
    expect(riskLevel(25)).toBe("moderado")
    expect(riskLevel(49)).toBe("moderado")
    expect(riskLevel(50)).toBe("alto")
    expect(riskLevel(74)).toBe("alto")
    expect(riskLevel(75)).toBe("critico")
    expect(riskLevel(100)).toBe("critico")
  })

  it("calcula 0 a 100 por dimensão", () => {
    const worst = QUESTIONS.map((q) => ({ questionId: q.id, value: q.risk ? 5 : 1 }))
    const best = QUESTIONS.map((q) => ({ questionId: q.id, value: q.risk ? 1 : 5 }))
    expect(Object.values(scoreDimensions(worst)).every((v) => v === 100)).toBe(true)
    expect(Object.values(scoreDimensions(best)).every((v) => v === 0)).toBe(true)
    expect(scoreDimensions([]).demandas).toBeNull()
  })

  it("gera probabilidade × severidade entre 1 e 25", () => {
    expect(inventoryRating(0, 3)).toEqual({ probability: 1, severity: 3, rating: 3 })
    expect(inventoryRating(100, 5)).toEqual({ probability: 5, severity: 5, rating: 25 })
    expect(inventoryRating(51, 4).probability).toBe(3)
  })
})
