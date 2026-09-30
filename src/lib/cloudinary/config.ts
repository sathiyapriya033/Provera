const REQUIRED_SERVER_ENV_VARS = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

export class CloudinaryConfigError extends Error {
  readonly missingVariables: readonly string[];

  constructor(missingVariables: readonly string[]) {
    super(
      `Cloudinary is not configured. Missing environment variables: ${missingVariables.join(", ")}. ` +
        "Set them in .env.local (see .env.example) and restart the server.",
    );
    this.name = "CloudinaryConfigError";
    this.missingVariables = missingVariables;
  }
}

let cachedConfig: CloudinaryConfig | null = null;

/**
 * Reads and validates the Cloudinary credentials on the server only.
 * Throws a descriptive error listing missing variable NAMES — never values.
 */
export function getCloudinaryConfig(): CloudinaryConfig {
  if (cachedConfig) return cachedConfig;

  const missing = REQUIRED_SERVER_ENV_VARS.filter(
    (name) => !process.env[name] || process.env[name]!.trim() === "",
  );
  if (missing.length > 0) {
    throw new CloudinaryConfigError(missing);
  }

  cachedConfig = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!.trim(),
    apiKey: process.env.CLOUDINARY_API_KEY!.trim(),
    apiSecret: process.env.CLOUDINARY_API_SECRET!.trim(),
  };
  return cachedConfig;
}
