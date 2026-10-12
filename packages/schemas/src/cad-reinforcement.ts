import { z } from "zod";
import { CadPointSchema } from "./cad-import.js";

export const ReinforcementLayoutSchema = z.object({
  mode: z.enum(["beam", "mesh"]), origin: CadPointSchema,
  lengthMm: z.number().finite().positive().max(100000),
  widthMm: z.number().finite().positive().max(100000),
  coverMm: z.number().finite().positive(),
  diameterMm: z.number().finite().positive().max(100),
  transverseDiameterMm: z.number().finite().positive().max(100),
  spacingMm: z.number().finite().positive().max(10000),
  longitudinalCount: z.number().int().min(2).max(100),
  steelGrade: z.string().trim().min(1).max(160),
  designReference: z.string().trim().min(1).max(240),
  heightMm: z.number().finite().positive().max(100000).optional(),
  topBarCount: z.number().int().min(1).max(99).optional(),
}).strict().superRefine((value, ctx) => {
  if (2 * value.coverMm + Math.max(value.diameterMm, value.transverseDiameterMm) >= Math.min(value.widthMm, value.lengthMm)) {
    ctx.addIssue({ code: "custom", message: "Otulina i średnica nie mieszczą się w podanym elemencie." });
  }
  if (Math.ceil(value.lengthMm / value.spacingMm) + Math.ceil(value.widthMm / value.spacingMm) > 1000) {
    ctx.addIssue({ code: "custom", message: "Układ przekracza limit 1000 linii. Zwiększ rozstaw lub podziel rysunek." });
  }
  if (value.heightMm && 2 * (value.coverMm + value.transverseDiameterMm + value.diameterMm / 2) >= Math.min(value.widthMm, value.heightMm)) {
    ctx.addIssue({ code: "custom", message: "Pręty i strzemiona nie mieszczą się w przekroju belki." });
  }
  if (value.topBarCount !== undefined && value.topBarCount >= value.longitudinalCount) {
    ctx.addIssue({ code: "custom", message: "Podaj co najmniej jeden pręt dolny i górny." });
  }
  if (value.heightMm && value.topBarCount !== undefined) {
    const usable = value.widthMm - 2 * (value.coverMm + value.transverseDiameterMm + value.diameterMm / 2);
    if ((Math.max(value.topBarCount, value.longitudinalCount - value.topBarCount) - 1) * value.diameterMm > usable) {
      ctx.addIssue({ code: "custom", message: "Pręty w jednym rzędzie nachodzą na siebie. Sprawdź przekrój i ich liczbę." });
    }
  }
});
export type ReinforcementLayout = z.infer<typeof ReinforcementLayoutSchema>;
