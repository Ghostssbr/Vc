const CACHE_NAME = 'shadow-gate-v15';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/home.html',
  '/dashboard.html',
  '/app.js',
  '/dashboard.js',
  '/dashboard.css',
];

const supabaseUrl = 'https://nwoswxbtlquiekyangbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53b3N3eGJ0bHF1aWVreWFuZ2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3ODEwMjcsImV4cCI6MjA2MDM1NzAyN30.KarBv9AopQpldzGPamlj3zu9eScKltKKHH2JJblpoCE';

const XTREAM_CONFIG = {
  host: 'sigcine1.space',
  port: 80,
  username: '474912714',
  password: '355591139'
};

async function showAlert(message, type) {
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
    await showAlert(`Erro ao verificar projeto: ${error.message}`, 'danger');
    return false;
  }
}

async function incrementRequestCount(projectId, endpoint) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const response = await fetch(`${supabaseUrl}/rest/v1/project_requests?project_id=eq.${projectId}`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    const currentData = await response.json();
    const existingData = currentData && currentData[0] ? currentData[0] : {
      project_id: projectId,
      requests_today: 0,
      total_requests: 0,
      daily_requests: {},
      level: 1
    };

    const updatedData = {
      requests_today: (existingData.requests_today || 0) + 1,
      total_requests: (existingData.total_requests || 0) + 1,
      last_request_date: today,
      daily_requests: {
        ...existingData.daily_requests,
        [today]: (existingData.daily_requests?.[today] || 0) + 1
      },
      updated_at: new Date().toISOString(),
      level: existingData.level || 1
    };

    if (updatedData.total_requests >= updatedData.level * 100) {
      updatedData.level += 1;
      await showAlert(`Gate ${projectId} subiu para o nível ${updatedData.level}!`, 'success');
    }

    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/project_requests`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(updatedData)
    });

    if (!updateResponse.ok) throw new Error('Falha ao atualizar contador');

    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'REQUEST_INCREMENTED',
        payload: {
          projectId,
          endpoint,
          requestsToday: updatedData.requests_today,
          totalRequests: updatedData.total_requests,
          level: updatedData.level
        }
      });
    });

  } catch (error) {
    await showAlert(`Erro ao incrementar contador: ${error.message}`, 'danger');
  }
}

async function handleAnimeRequest(event) {
  try {
    const url = new URL(event.request.url);
    const pathParts = url.pathname.split('/').filter(part => part !== '');
    const projectId = pathParts[1];
    
    if (!projectId || pathParts[2] !== 'animes') {
      return new Response(JSON.stringify({ error: 'Endpoint inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const projectExists = await verifyProjectExists(projectId);
    if (!projectExists) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await incrementRequestCount(projectId, 'animes');

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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleFilmesRequest(event) {
  try {
    const url = new URL(event.request.url);
    const pathParts = url.pathname.split('/').filter(part => part !== '');
    const projectId = pathParts[1];
    
    if (!projectId || pathParts[2] !== 'filmes') {
      return new Response(JSON.stringify({ error: 'Endpoint inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const projectExists = await verifyProjectExists(projectId);
    if (!projectExists) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await incrementRequestCount(projectId, 'filmes');

    const apiUrl = `http://${XTREAM_CONFIG.host}/player_api.php?username=${XTREAM_CONFIG.username}&password=${XTREAM_CONFIG.password}&action=get_vod_streams`;
    const apiResponse = await fetch(apiUrl);
    
    if (!apiResponse.ok) throw new Error('Falha ao buscar dados de filmes');

    const filmesData = await apiResponse.json();

    const filmesComPlayer = filmesData.map(filme => ({
      ...filme,
      player: `${self.location.origin}/api/${projectId}/stream/${filme.stream_id}.mp4`
    }));

    return new Response(JSON.stringify({
      projectId,
      filmes: filmesComPlayer,
      updatedAt: new Date().toISOString()
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleStreamRequest(event) {
  try {
    const url = new URL(event.request.url);
    const pathParts = url.pathname.split('/').filter(part => part !== '');
    
    if (pathParts.length === 4 && pathParts[2] === 'stream') {
      const projectId = pathParts[1];
      const streamId = pathParts[3].replace('.mp4', '');
      
      const projectExists = await verifyProjectExists(projectId);
      if (!projectExists) return new Response(null, { status: 404 });

      const realStreamUrl = `http://${XTREAM_CONFIG.host}:${XTREAM_CONFIG.port}/movie/${XTREAM_CONFIG.username}/${XTREAM_CONFIG.password}/${streamId}.mp4`;
      const streamResponse = await fetch(realStreamUrl);
      
      if (!streamResponse.ok) throw new Error('Stream não encontrado');

      return new Response(streamResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return new Response(null, { status: 404 });

  } catch (error) {
    return new Response(null, { status: 500 });
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.match(/\/api\/[^\/]+\/animes$/)) {
    event.respondWith(handleAnimeRequest(event));
    return;
  }
  
  if (url.pathname.match(/\/api\/[^\/]+\/filmes$/)) {
    event.respondWith(handleFilmesRequest(event));
    return;
  }

  if (url.pathname.match(/\/api\/[^\/]+\/stream\/[^\/]+\.mp4$/)) {
    event.respondWith(handleStreamRequest(event));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        
        return fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache));
            }
            return response;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => showAlert('Aplicativo pronto para uso offline!', 'success'))
      .then(() => self.skipWaiting()))
      .catch(error => {
        showAlert('Falha ao instalar cache: ' + error.message, 'danger');
        throw error;
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => showAlert('Aplicativo atualizado!', 'success'))
    .then(() => self.clients.claim())
    .catch(error => {
      showAlert('Falha ao limpar cache antigo: ' + error.message, 'danger');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data.type === 'GET_PROJECTS') {
    event.ports[0].postMessage(getProjects());
  }
});

function getProjects() {
  try {
    return JSON.parse(localStorage.getItem('shadowGateProjects4')) || [];
  } catch (e) {
    return [];
  }
      }
