import * as http from 'http';
import Fastify from 'fastify';

declare function buildServer(): Promise<Fastify.FastifyInstance<http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>, http.IncomingMessage, http.ServerResponse<http.IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault>>;

export { buildServer };
