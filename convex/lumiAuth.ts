const MIN_SECRET_LENGTH = 32;

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
export function requireLumiWorkspaceSecret(provided: string): void {
  const expected = process.env.LUMI_WORKSPACE_SECRET;
  if (!expected || expected.length < MIN_SECRET_LENGTH) {
    throw new Error("Lumi workspace security is not configured");
  }
  if (!constantTimeEqual(provided, expected)) {
    throw new Error("Unauthorized Lumi workspace request");
  }
}
