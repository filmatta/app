export const LOCATION_PHOTO_FINALIZATION_TIMEOUT_MS = 12_000;

export class LocationPhotoFinalizationTimeout extends Error {
  constructor() {
    super("Location photo finalization timed out");
    this.name = "LocationPhotoFinalizationTimeout";
  }
}

export async function withLocationPhotoDeadline<T>(
  operation: PromiseLike<T>,
  timeoutMs = LOCATION_PHOTO_FINALIZATION_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new LocationPhotoFinalizationTimeout()),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readLocationPhotoPrefix(
  response: Pick<Response, "arrayBuffer">,
  limit: number,
) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.subarray(0, limit);
}
