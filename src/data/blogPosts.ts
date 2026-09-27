import type { BlogPost } from '../types';
import { BATCH01_POSTS } from './batch01Posts';
import { BATCH02_POSTS } from './batch02Posts';

/**
 * blogPosts.ts — the generated 12-week article batches (batch01 + batch02).
 *
 * Kept as a SEPARATE module so bundlers can code-split it out of the initial
 * JS payload: ContentContext loads it with a background dynamic import and
 * merges it into the content state as DEFAULTS (CMS/localStorage posts always
 * win). Regenerate the batches with scripts/batch-to-posts.mjs.
 */
export const GENERATED_BATCH_POSTS: BlogPost[] = [...BATCH01_POSTS, ...BATCH02_POSTS];
