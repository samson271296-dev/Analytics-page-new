/** Cache API GET responses for 1 hour (Next.js 16 defaults to no cache). */
const CACHE_MAX_AGE = 3600; // 1 hour in seconds

export const cacheHeaders = {
  "Cache-Control": `public, s-maxage=${CACHE_MAX_AGE}, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_MAX_AGE}`,
};
