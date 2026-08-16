import { z } from 'zod'

export const domainFileTransferHandleSchema = z.string()
  .regex(/^xfer_[A-Za-z0-9_-]{20,}$/u)

export const domainRendererUploadSelectionSchema = z.discriminatedUnion('cancelled', [
  z.object({ cancelled: z.literal(true) }).strict(),
  z.object({
    cancelled: z.literal(false),
    handle: domainFileTransferHandleSchema,
    name: z.string().trim().min(1).max(256),
    size: z.number().int().nonnegative().max(1_073_741_824)
  }).strict()
])

export const domainRendererDownloadSelectionSchema = z.discriminatedUnion('cancelled', [
  z.object({ cancelled: z.literal(true) }).strict(),
  z.object({
    cancelled: z.literal(false),
    handle: domainFileTransferHandleSchema,
    label: z.string().trim().min(1).max(256)
  }).strict()
])

export type DomainRendererFileTransferHost = Readonly<{
  pickUploadSource(input: Readonly<{ title: string; maxBytes: number }> ):
    Promise<z.infer<typeof domainRendererUploadSelectionSchema>>
  pickDownloadDestination(input: Readonly<{ title: string; suggestedName: string }> ):
    Promise<z.infer<typeof domainRendererDownloadSelectionSchema>>
}>

export type DomainMainFileTransferHost = Readonly<{
  openUploadSource(input: Readonly<{ handle: string; callerId: string; maxBytes: number }> ):
    Promise<Readonly<{
      name: string
      size: number
      read(input: Readonly<{ offset: number; length: number }>): Promise<Uint8Array>
    }>>
  openDownloadDestination(input: Readonly<{
    handle: string
    callerId: string
    maxBytes: number
  }>): Promise<Readonly<{
    label: string
    write(chunk: Uint8Array): Promise<void>
    commit(): Promise<void>
    abort(): Promise<void>
  }>>
}>
