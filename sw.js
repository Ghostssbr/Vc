const CACHE_NAME = 'shadow-gate-v12';
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

// Função para mostrar alertas
async function sendAlertToClient(message, type) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SHOW_ALERT',
      payload: { message, type }
    });
  });
}

// Função para verificar se o projeto existe
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
    await sendAlertToClient(`Erro ao verificar projeto: ${error.message}`, 'danger');
    return false;
  }
}

// Função para incrementar contador de requests
async function incrementRequestCount(projectId, endpoint) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Buscar dados atuais
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

    // Calcular novos valores
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

    // Verificar level up
    if (updatedData.total_requests >= updatedData.level * 100) {
      updatedData.level += 1;
      await sendAlertToClient(`Gate ${projectId} subiu para o nível ${updatedData.level}!`, 'success');
    }

    // Atualizar no Supabase
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

    if (!updateResponse.ok) {
      throw new Error('Falha ao atualizar contador');
    }

    // Notificar clients
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
    await sendAlertToClient(`Erro ao incrementar contador: ${error.message}`, 'danger');
  }
}

// Handler para requests de /animes
async function handleAnimeRequest(event) {
  try {
    const url = new URL(event.request.url);
    const pathParts = url.pathname.split('/').filter(part => part !== '');
    const projectId = pathParts[0];
    
    if (!projectId || pathParts[1] !== 'animes') {
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
    };
  }
}

// Handler para requests de /filmes
async function handleFilmesRequest(event) {
  try {
    const url = new URL(event.request.url);
    const pathParts = url.pathname.split('/').filter(part => part !== '');
    const projectId = pathParts[0];
    
    if (!projectId || pathParts[1] !== 'filmes') {
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

    // Buscar dados da API de filmes
    const apiUrl = 'https://sigcine1.space/player_api.php?username=474912714&password=355591139&action=get_vod_streams';
    const apiResponse = await fetch(apiUrl);
    
    if (!apiResponse.ok) {
      throw new Error('Falha ao buscar dados de filmes');
    }

    const filmesData = await apiResponse.json();

    // Adicionar URL do player para cada filme
    const filmesComPlayer = filmesData.map(filme => ({
      ...filme,
      player: `http://sigcine1.space:80/movie/474912714/355591139/${filme.stream_id}.mp4`
    }));

    const responseData = {
      projectId,
      filmes: filmesComPlayer,
      updatedAt: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(responseData), {
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

// Evento fetch principal
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Requests para /projectid/animes
  if (url.pathname.match(/\/[^\/]+\/animes$/)) {
    event.respondWith(handleAnimeRequest(event));
    return;
  }
  
  // Requests para /projectid/filmes
  if (url.pathname.match(/\/[^\/]+\/filmes$/)) {
    event.respondWith(handleFilmesRequest(event));
    return;
  }

  // Estratégia Cache-First para outros recursos
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
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

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => sendAlertToClient('Aplicativo pronto para uso offline!', 'success'))
      .catch(error => {
        sendAlertToClient('Falha ao instalar cache: ' + error.message, 'danger');
        throw error;
      })
  );
});

// Ativação do Service Worker
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
    .then(() => sendAlertToClient('Aplicativo atualizado!', 'success'))
    .catch(error => {
      sendAlertToClient('Falha ao limpar cache antigo: ' + error.message, 'danger');
    })
  );
});

// Mensagens do Service Worker
self.addEventListener('message', (event) => {
  if (event.data.type === 'GET_PROJECTS') {
    event.ports[0].postMessage(getProjects());
  }
});

// Função auxiliar para obter projetos (simplificada)
function getProjects() {
  try {
    return JSON.parse(localStorage.getItem('shadowGateProjects4')) || [];
  } catch (e) {
    return [];
  }
}
