import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import type { Express } from "express";

// Mounts the router exported by every src/features/<domain>/<slice>/endpoint.ts
// under /api/<domain>. Called once from app.ts at startup.
export async function registerFeatures(app: Express): Promise<void> {
  for (const domain of readdirSync(__dirname)) {
    const domainPath = join(__dirname, domain);
    if (!statSync(domainPath).isDirectory()) continue;

    for (const slice of readdirSync(domainPath)) {
      const endpointPath = join(domainPath, slice, "endpoint");
      if (!existsSync(`${endpointPath}.ts`) && !existsSync(`${endpointPath}.js`)) continue;

      const mod = await import(endpointPath);
      if (mod.router) app.use(`/api/${domain}`, mod.router);
    }
  }
}
