export function isDemoModeEnabled(): boolean {
  return process.env.AETERNA_DEMO_MODE === "true";
}

/** Demo data is never seeded automatically. Callers must opt in explicitly. */
export function assertDemoModeEnabled(): void {
  if (!isDemoModeEnabled()) throw new Error("Demo mode non attiva.");
}
