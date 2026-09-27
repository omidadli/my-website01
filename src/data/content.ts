/**
 * content.ts — FULL synchronous content defaults (core + generated batches).
 *
 * Used by Node scripts and tests (gen-default-content, sitemap test, …) where
 * bundle size is irrelevant. The web app's runtime imports go to
 * './contentCore' (eager) + './blogPosts' (lazy) instead.
 */
export * from './contentCore';
import type { BlogPost } from '../types';
import { GENERATED_BATCH_POSTS } from './blogPosts';
import { CORE_BLOG_POSTS } from './contentCore';

export const BLOG_POSTS: BlogPost[] = [...GENERATED_BATCH_POSTS, ...CORE_BLOG_POSTS];
