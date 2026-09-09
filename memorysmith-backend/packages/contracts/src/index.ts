/**
 * The published language of the system: event contracts and API DTOs.
 * The frontend imports TYPES from here and nothing else (architecture-guide.md
 * section 5.1); the services import the schemas and validate with them at the
 * edge and on both ends of the event bus.
 */

export * from './common.js';
export * from './markdown.js';
export * from './events.js';
export * from './api/errors.js';
export * from './api/access.js';
export * from './api/knowledge.js';
export * from './api/discovery.js';
export * from './api/audit.js';
export * from './api/vault-document.js';
export * from './api/portability.js';
