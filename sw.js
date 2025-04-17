const CACHE_NAME = 'shadow-gate-v10';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/home.html',
  '/dashboard.html',
  '/app.js',
  '/dashboard.js',
  '/dashboard.css',
  '/_redirects'
];

const supabaseUrl = 'https://nwoswxbtlquiekyangbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53b3N3eGJ0bHF1aWVreWFuZ2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3ODEwMjcsImV4cCI6MjA2MDM1NzAyN30.KarBv9AopQpldzGPamlj3zu9eScKltKKHH2JJblpoCE';

async function sendAlertToClient(message, type) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SHOW_ALERT',
      payload: { message, type }
    });
  });
}

async function verifyProjectExists(projectId) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/project_tokens?project_id=eq.${projectId}`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    const data = await response.json();
    return data && data.length > 0;
  } catch (error) {
    console.error('Error verifying project:', error);
    return false;
  }
}

async function incrementRequestCount(projectId) {
  try {
    // Atualizar no localStorage (se disponível)
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'INCREMENT_REQUEST',
        payload: { projectId }
      });
    });

    // Atualizar no Supabase
    const today = new Date().toISOString().split('T')[0];
    const { data: existingData, error: fetchError } = await fetch(`${supabaseUrl}/rest/v1/project_requests?project_id=eq.${projectId}`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    }).then(res => res.json());

    if (fetchError) throw fetchError;

    const currentData = existingData && existingData[0] ? existingData[0] : {
      project_id: projectId,
      requests_today: 0,
      total_requests: 0,
      daily_requests: {}
    };

    const updatedData = {
      requests_today: (currentData.requests_today || 0) + 1,
      total_requests: (currentData.total_requests || 0) + 1,
      last_request_date: today,
      daily_requests: {
        ...currentData.daily_requests,
        [today]: (currentData.daily_requests?.[today] || 0) + 1
      },
      updated_at: new Date().toISOString()
    };

    // Verificar level up
    const currentLevel = currentData.level || 1;
    if (updatedData.total_requests >= currentLevel * 100) {
      updatedData.level = currentLevel + 1;
    }

    const { error } = await fetch(`${supabaseUrl}/rest/v1/project_requests`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        ...updatedData,
        project_id: projectId
      })
    });

    if (error) throw error;

  } catch (error) {
    console.error('Error incrementing request count:', error);
    await sendAlertToClient(`Error updating request count: ${error.message}`, 'danger');
  }
}

async function handleAnimeRequest(event) {
  try {
    const url = new URL(event.request.url);
    const projectId = url.pathname.split('/')[1];
    
    // Verificar se o projeto existe
    const projectExists = await verifyProjectExists(projectId);
    if (!projectExists) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Incrementar contador de requests
    await incrementRequestCount(projectId);

    // Retornar dados do anime
    const animeData = {
      projectId,
      animes: [
        { id: 1, title: "Demon Slayer", episodes: 26 },
        { id: 2, title: "Jujutsu Kaisen", episodes: 24 }
      ],
      updatedAt: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(animeData), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await sendAlertToClient(`Erro no endpoint /animes: ${error.message}`, 'danger');
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CACHE_URLS);
        await sendAlertToClient('Cache instalado com sucesso!', 'success');
      } catch (error) {
        await sendAlertToClient(`Falha na instalação do cache: ${error.message}`, 'danger');
        throw error;
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(name => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        );
        await sendAlertToClient('Service Worker ativado!', 'success');
      } catch (error) {
        await sendAlertToClient(`Falha na ativação: ${error.message}`, 'danger');
      }
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/animes')) {
    event.respondWith(handleAnimeRequest(event));
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        
        const networkResponse = await fetch(event.request);
        
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        
        return networkResponse;
      } catch (error) {
        await sendAlertToClient(`Falha na requisição: ${error.message}`, 'warning');
        return new Response('Offline - Recursos não disponíveis', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data.type === 'GET_PROJECTS') {
    event.ports[0].postMessage(getProjects());
  }
});