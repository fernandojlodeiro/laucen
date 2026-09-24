import type { Config } from "drizzle-kit";

export default {
  schema: ["./db/tenancy.ts", "./db/coordinacion.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
