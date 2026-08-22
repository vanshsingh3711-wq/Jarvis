import { defineConfig } from "@prisma/config";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // The CLI needs the direct connection (Session pooler - port 5432) for pushing the schema
    url: process.env.DIRECT_URL,
  },
});
