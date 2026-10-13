export const formatJson = value => JSON.stringify(value, null, 2);

export function parseJson(source) {
  try {
    return { ok: true, value: JSON.parse(source) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
