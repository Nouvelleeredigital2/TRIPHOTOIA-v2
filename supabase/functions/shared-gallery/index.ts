import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// P1-1 : galerie de partage anonyme. Reçoit un token de partage, le valide
// côté serveur via get_shared_link (SECURITY DEFINER, expiry-aware) avec la
// service role, puis renvoie des URLs SIGNÉES courtes (5 min) pour chaque photo
// du bucket privé shared-photos. Aucune URL publique durable n'est exposée.
// Déployée sur le projet staging via MCP (verify_jwt=true : le visiteur dispose
// de la clé anon ; le token de partage dans le corps est la vraie autorisation).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let token = '';
  try {
    const body = await req.json();
    token = typeof body?.token === 'string' ? body.token : '';
  } catch {
    return json({ error: 'invalid body' }, 400);
  }
  if (!token) return json({ error: 'token required' }, 400);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'server misconfigured' }, 500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('get_shared_link', {
    target_token: token,
  });
  if (error) return json({ error: 'lookup failed' }, 500);

  const link = Array.isArray(data) ? data[0] : data;
  if (!link || !link.user_id) return json({ error: 'invalid or expired' }, 404);

  const userId: string = link.user_id;
  const hashes: string[] = Array.isArray(link.photo_file_hashes)
    ? link.photo_file_hashes
    : [];

  const photos: { hash: string; url: string | null }[] = [];
  for (const hash of hashes) {
    const { data: signed } = await supabase.storage
      .from('shared-photos')
      .createSignedUrl(`${userId}/${hash}`, 300);
    photos.push({ hash, url: signed?.signedUrl ?? null });
  }

  return json({
    name: link.name ?? null,
    expiresAt: link.expires_at ?? null,
    photos,
  });
});
