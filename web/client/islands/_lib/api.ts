/**
 * Reading this app's API responses, for the islands — paired with `sessionStore.api` in
 * `session.ts`, which sends the requests.
 */

/** A response that was not `2xx`, with the server's `{ error }` as the message. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/**
 * @param response What `sessionStore.api` answered
 * @returns The JSON body
 * @throws {ApiError} When the response is not `2xx`
 */
export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as
      | { error?: string }
      | null;
    throw new ApiError(
      response.status,
      body?.error ?? `${response.status} ${response.statusText}`,
    );
  }
  return await response.json() as T;
}
