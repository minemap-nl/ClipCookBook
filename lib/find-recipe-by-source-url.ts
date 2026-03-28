import { prisma } from '@/lib/prisma';
import { canonicalSourceUrl } from '@/lib/normalize-source-url';

const RECENT_DEDUP_SCAN = 600;

/**
 * Find a recipe whose source URL is the same as `incomingRaw` after canonical normalization
 * (tracking params, playlist context, and `URL.href` serialization).
 */
export async function findExistingRecipeBySourceUrl(incomingRaw: string) {
    const canon = canonicalSourceUrl(incomingRaw);

    const byExact = await prisma.recipe.findFirst({ where: { originalUrl: canon } });
    if (byExact) return byExact;

    const byPrefix = await prisma.recipe.findFirst({ where: { originalUrl: { startsWith: canon } } });
    if (byPrefix) return byPrefix;

    const recent = await prisma.recipe.findMany({
        orderBy: { createdAt: 'desc' },
        take: RECENT_DEDUP_SCAN,
        where: { originalUrl: { not: null } },
        select: { id: true, originalUrl: true },
    });

    for (const r of recent) {
        if (!r.originalUrl) continue;
        if (canonicalSourceUrl(r.originalUrl) === canon) {
            return prisma.recipe.findUnique({ where: { id: r.id } });
        }
    }

    return null;
}
