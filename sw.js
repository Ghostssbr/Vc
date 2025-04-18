const CACHE_NAME = 'shadow-gate-v10';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/home.html',
  '/dashboard.html',
  '/app.js',
  '/dashboard.js',
  '/dashboard.css',
  '/_redirects'  // Mantendo o arquivo de redirecionamento
];

const supabaseUrl = 'https://nwoswxbtlquiekyangbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53b3N3eGJ0bHF1aWVreWFuZ2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3ODEwMjcsImV4cCI6MjA2MDM1NzAyN30.KarBv9AopQpldzGPamlj3zu9eScKltKKHH2JJblpoCE';

// Função para sanitizar nomes de arquivo
function sanitizeFilename(name) {
  return name.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

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

// Verificar se projeto existe no Supabase
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

// Incrementar contador de requests
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
      await sendAlertToClient(`Gate ${projectId} subiu para nível ${updatedData.level}!`, 'success');
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
    await sendAlertToClient(`Erro ao incrementar contador: ${error.message}`, 'danger');
  }
}

// Handler para /animes
async function handleAnimeRequest(event) {
  try {
    const url = new URL(event.request.url);
    const pathParts = url.pathname.split('/').filter(part => part !== '');
    const projectId = pathParts[0];
    
    if (!projectId || pathParts[1] !== 'animes') {
      return new Response(null, { status: 400 });
    }

    if (!await verifyProjectExists(projectId)) {
      return new Response(null, { status: 404 });
    }

    await incrementRequestCount(projectId, 'animes');

    return new Response(JSON.stringify({
      projectId,
      animes: [
        { id: 1, title: "Demon Slayer", episodes: 26 },
        { id: 2, title: "Jujutsu Kaisen", episodes: 24 }
      ],
      updatedAt: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(null, { status: 500 });
  }
}

// Handler para /filmes (API JSON)
async function handleFilmesRequest(event) {
  try {
    const url = new URL(event.request.url);
    const pathParts = url.pathname.split('/').filter(part => part !== '');
    const projectId = pathParts[0];
    
    if (!projectId || pathParts[1] !== 'filmes') {
      return new Response(null, { status: 400 });
    }

    if (!await verifyProjectExists(projectId)) {
      return new Response(null, { status: 404 });
    }

    await incrementRequestCount(projectId, 'filmes');

    const apiResponse = await fetch('https://sigcine1.space/player_api.php?username=474912714&password=355591139&action=get_vod_streams');
    if (!apiResponse.ok) throw new Error('API de filmes indisponível');

    const filmesData = await apiResponse.json();
    const filmesFormatados = filmesData.map(filme => ({
      ...filme,
      player: `http://sigcine1.space:80/movie/474912714/355591139/${filme.stream_id}.mp4`,
      url_amigavel: `${url.origin}/${projectId}/${sanitizeFilename(filme.name)}.mp4`
    }));

    return new Response(JSON.stringify({
      projectId,
      filmes: filmesFormatados,
      updatedAt: new Date().toISOString()
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    return new Response(null, { status: 500 });
  }
}

// Handler para URLs amigáveis de filmes
async function handleMovieStreamRequest(event) {
  try {
    const url = new URL(event.request.url);
    const pathParts = url.pathname.split('/').filter(part => part !== '');
    
    if (pathParts.length !== 2 || !pathParts[1].endsWith('.mp4')) {
      return new Response(null, { status: 404 });
    }

    const projectId = pathParts[0];
    if (!await verifyProjectExists(projectId)) {
      return new Response(null, { status: 404 });
    }

    const apiResponse = await fetch('https://sigcine1.space/player_api.php?username=474912714&password=355591139&action=get_vod_streams');
    if (!apiResponse.ok) throw new Error('API de filmes indisponível');

    const filmesData = await apiResponse.json();
    const filmeNome = decodeURIComponent(pathParts[1].replace('.mp4', ''));
    const filme = filmesData.find(f => 
      sanitizeFilename(f.name) === sanitizeFilename(filmeNome)
    );

    if (!filme) return new Response(null, { status: 404 });

    await incrementRequestCount(projectId, 'filmes-stream');

    return Response.redirect(
      `http://sigcine1.space:80/movie/474912714/355591139/${filme.stream_id}.mp4`,
      302
    );

  } catch (error) {
    return new Response(null, { status: 500 });
  }
}

// Evento fetch principal
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const pathname = url.pathname;

  // Verificar primeiro o _redirects
  if (pathname === '/_redirects') {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // Endpoint /animes
  if (pathname.match(/\/[^\/]+\/animes$/)) {
    event.respondWith(handleAnimeRequest(event));
    return;
  }
  
  // Endpoint /filmes (JSON)
  if (pathname.match(/\/[^\/]+\/filmes$/)) {
    event.respondWith(handleFilmesRequest(event));
    return;
  }

  // URLs amigáveis de filmes
  if (pathname.match(/\/[^\/]+\/[^\/]+\.mp4$/)) {
    event.respondWith(handleMovieStreamRequest(event));
    return;
  }

  // Estratégia Cache-First para outros recursos
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(networkResponse => {
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('/offline.html'));
    })
  );
});

// Instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => sendAlertToClient('Aplicativo pronto para offline!', 'success'))
      .catch(error => {
        sendAlertToClient(`Falha na instalação: ${error.message}`, 'danger');
        throw error;
      })
  );
});

// Ativação
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => key !== CACHE_NAME && caches.delete(key))
    ))
    .then(() => sendAlertToClient('Service Worker ativado!', 'success'))
    .catch(error => {
      sendAlertToClient(`Falha na ativação: ${error.message}`, 'danger');
    })
  );
});

// Mensagens
self.addEventListener('message', (event) => {
  if (event.data.type === 'GET_PROJECTS') {
    try {
      const projects = JSON.parse(localStorage.getItem('shadowGateProjects4')) || [];
      event.ports[0].postMessage(projects);
    } catch (e) {
      event.ports[0].postMessage([]);
    }
  }
});
