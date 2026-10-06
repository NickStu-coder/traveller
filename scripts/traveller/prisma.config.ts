// Runtime configuration needs no devDependency import or network download.
export default {
  schema: '../../apps/web/prisma/schema.prisma',
  migrations: { path: '../../apps/web/prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
};
