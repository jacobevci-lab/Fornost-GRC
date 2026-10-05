import catalog53 from './catalog-data/nist-800-53.json';
import catalog171 from './catalog-data/nist-800-171.json';
import catalog172 from './catalog-data/nist-800-172.json';
import catalogSsdf from './catalog-data/nist-ssdf.json';
import type { FrameworkRequirement } from './framework-catalogs';
export const nistCatalogs = [catalog53, catalog171, catalog172, catalogSsdf];
export const nistRequirementCatalogs: Record<string, FrameworkRequirement[]> = Object.fromEntries(nistCatalogs.map(catalog => [catalog.name, catalog.requirements]));
