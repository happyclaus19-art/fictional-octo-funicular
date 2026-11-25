export type KnownSecret = { name: string; value: string };
export declare const SECRET_PATTERNS: { name: string; regex: RegExp }[];
export declare const SERVER_ONLY_NAMES: string[];
export declare function secretValuesFromEnv(envText: string): KnownSecret[];
export declare function scanText(
  text: string,
  opts?: { knownSecrets?: KnownSecret[]; clientBundle?: boolean },
): string[];
