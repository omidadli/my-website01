/**
 * Which of the three tabs («شروع کنیم» / «بهتر بفروشیم» / «رشد کنیم») a service is shown in, on /services and on the
 * home page.
 *
 * Both pages used to filter by a hard-coded list of the ten built-in service ids, so a service the admin added
 * (id `service-<timestamp>`) — even a published one — appeared in no tab at all. Now every service has a path:
 * the admin picks it («نمایش در کدام تب؟»); the built-in services keep the tab they always had; anything else lands
 * in the first tab so it is never invisible.
 */

export type ServiceTab = 'start' | 'sell' | 'grow';

export const SERVICE_TABS: readonly ServiceTab[] = ['start', 'sell', 'grow'];

/** The tab every built-in service has always been listed under (what the pages hard-coded before). */
export const BUILT_IN_SERVICE_TAB: Readonly<Record<string, ServiceTab>> = {
  'web-app-design': 'start',
  'ui-ux-design': 'start',
  'social-media-strategy': 'start',
  'performance-marketing': 'sell',
  'cro-optimization': 'sell',
  'tracking-analytics': 'sell',
  'seo-growth': 'grow',
  'growth-strategy': 'grow',
  'marketing-automation': 'grow',
  'retention-strategy': 'grow',
};

export const isServiceTab = (value: unknown): value is ServiceTab => typeof value === 'string' && (SERVICE_TABS as readonly string[]).includes(value);

interface ServiceLike {
  id?: unknown;
  pathCategory?: unknown;
}

/** Explicit choice of the admin → built-in default for the id → first tab. */
export const serviceTab = (service: ServiceLike | null | undefined): ServiceTab => {
  if (!service) return 'start';
  if (isServiceTab(service.pathCategory)) return service.pathCategory;
  return BUILT_IN_SERVICE_TAB[String(service.id)] ?? 'start';
};

export const servicesInTab = <T extends ServiceLike>(services: readonly T[], tab: ServiceTab): T[] => services.filter((s) => serviceTab(s) === tab);

/** Make the path explicit on every service, so the admin's «نمایش در کدام تب؟» shows where each one really is. */
export const withServicePaths = <T extends ServiceLike>(services: readonly T[]): T[] =>
  services.map((s) => (s && typeof s === 'object' ? { ...s, pathCategory: serviceTab(s) } : s));
