process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/ph_healthcare_test";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.RATE_LIMIT_MAX = "1000";
