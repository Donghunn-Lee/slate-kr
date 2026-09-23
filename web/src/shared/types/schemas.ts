import { z } from "zod";

export const MarketSchema = z.enum(["KOSPI", "KOSDAQ"]);
export const TickerSchema = z.string().regex(/^[0-9A-Z]{6}$/);
export const AnonIdSchema = z.uuid();
