import { prisma } from '../../prisma';
import { DEFAULT_ENGINE, engineSchema } from './policy';
export async function engineSettings() {
  const saved = await prisma.travellerConfig.findUnique({ where: { id: 'engine' } });
  return saved ? engineSchema.parse(saved.settings) : DEFAULT_ENGINE;
}
