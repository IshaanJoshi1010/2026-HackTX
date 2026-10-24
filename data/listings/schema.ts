import { z } from "zod";

export const ListingSnapshotSchema = z.object({
  id: z.string().min(1), capturedOn: z.iso.date(), source: z.literal("synthetic"),
  disclosure: z.string().min(1),
  fields: z.object({
    vehicleId: z.string().min(1), vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/),
    make: z.string().min(1), model: z.string().min(1), year: z.number().int().min(1886),
    trim: z.string().min(1), powertrain: z.enum(["gas", "hybrid"]), drive: z.enum(["FWD", "AWD"]),
    paint: z.string().min(1), paintCode: z.string().min(1), paintHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    mileage: z.number().finite().nonnegative(), priceUsd: z.number().finite().positive(),
  }).strict(),
  provenance: z.object({
    vehicleId: z.literal("synthetic"), vin: z.literal("synthetic"), make: z.literal("synthetic"),
    model: z.literal("synthetic"), year: z.literal("synthetic"), trim: z.literal("synthetic"),
    powertrain: z.literal("synthetic"), drive: z.literal("synthetic"), paint: z.literal("synthetic"),
    paintCode: z.literal("synthetic"), paintHex: z.literal("synthetic"), mileage: z.literal("synthetic"), priceUsd: z.literal("synthetic"),
  }).strict(),
}).strict();
export type ListingSnapshot = z.infer<typeof ListingSnapshotSchema>;
export const listingSnapshotJsonSchema = z.toJSONSchema(ListingSnapshotSchema);
