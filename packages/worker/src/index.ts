/**
 * GoToSocial Comment Embed Worker
 */

// Loaded as text by wrangler rules
import EMBED_SCRIPT from '../../embed/dist/fedi-comments.js';

interface Env {
    GTS_INSTANCE_URL: string;
    GTS_ACCESS_TOKEN: string;
    ALLOWED_ORIGINS: string;
    CACHE_TTL: string;
}

interface GtsAccount {
    id: string;
    username: string;
    acct: string;
    display_name: string;
    avatar: string;
    url: string;
}

interface GtsStatus {
    id: string;
    created_at: string;
    in_reply_to_id: string | null;
    content: string;
    url: string;
    account: GtsAccount;
    replies_count: number;
    reblogs_count: number;
    favourites_count: number;
    sensitive: boolean;
    spoiler_text: string;
    visibility: string;
    media_attachments: Array<{
        id: string;
        type: string;
        url: string;
        preview_url: string;
        description: string | null;
    }>;
}

interface GtsContext {
    ancestors: GtsStatus[];
    descendants: GtsStatus[];
}

function corsHeaders(origin: string, allowedOrigins: string): HeadersInit {
    const allowed = allowedOrigins === '*' ? '*' :
        allowedOrigins.split(',').includes(origin) ? origin : '';
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function json(data: unknown, status: number, origin: string, env: Env): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, env.ALLOWED_ORIGINS) },
    });
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '*';

        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin, env.ALLOWED_ORIGINS) });
        }

        if (request.method !== 'GET') {
            return json({ error: 'Method not allowed' }, 405, origin, env);
        }

        // Route: /embed.js - serve the embed script
        if (url.pathname === '/embed.js') {
            return new Response(EMBED_SCRIPT, {
                headers: {
                    'Content-Type': 'application/javascript',
                    'Cache-Control': 'public, max-age=86400',
                    ...corsHeaders(origin, env.ALLOWED_ORIGINS),
                },
            });
        }

        // Route: /comments/:id
        const match = url.pathname.match(/^\/comments\/([a-zA-Z0-9_-]+)$/);
        if (!match) {
            return json({ error: 'Use GET /comments/:statusId or /embed.js' }, 404, origin, env);
        }

        const statusId = match[1];

        // Check cache
        const cacheKey = new Request(url.toString());
        const cache = caches.default;
        const cached = await cache.match(cacheKey);
        if (cached) {
            const resp = new Response(cached.body, cached);
            Object.entries(corsHeaders(origin, env.ALLOWED_ORIGINS)).forEach(([k, v]) => resp.headers.set(k, v));
            return resp;
        }

        try {
            const headers = {
                'Authorization': `Bearer ${env.GTS_ACCESS_TOKEN}`,
                'Accept': 'application/json',
                'User-Agent': 'GTS-Comment-Embed/1.0',
            };

            const [statusRes, contextRes] = await Promise.all([
                fetch(`${env.GTS_INSTANCE_URL}/api/v1/statuses/${statusId}`, { headers }),
                fetch(`${env.GTS_INSTANCE_URL}/api/v1/statuses/${statusId}/context`, { headers }),
            ]);

            if (!statusRes.ok) {
                return json({ error: `Status fetch failed: ${statusRes.status}` }, 502, origin, env);
            }

            const status: GtsStatus = await statusRes.json();
            const context: GtsContext = contextRes.ok ? await contextRes.json() : { ancestors: [], descendants: [] };

            // Filter to only public/unlisted comments
            const allReplies = context.descendants;
            const visibleComments = allReplies.filter(c => c.visibility === 'public' || c.visibility === 'unlisted');
            const hiddenCount = allReplies.length - visibleComments.length;

            const data = {
                status,
                comments: visibleComments,
                visibleCount: visibleComments.length,
                hiddenCount: hiddenCount,
                canonicalUrl: status.url,
                instanceUrl: env.GTS_INSTANCE_URL,
            };

            const response = json(data, 200, origin, env);
            response.headers.set('Cache-Control', `public, max-age=${env.CACHE_TTL || 300}`);
            ctx.waitUntil(cache.put(cacheKey, response.clone()));

            return response;
        } catch (e) {
            return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500, origin, env);
        }
    },
};
