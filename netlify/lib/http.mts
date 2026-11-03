export const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers })

export const jsonError = (status: number, message: string) => json({ error: message }, status)
