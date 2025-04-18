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

// Função para obter projetos dos clients
async function getProjectsFromClient() {
  const clients = await self.clients.matchAll();
  if (clients.length === 0) return [];
  
  return new Promise(resolve => {
    const channel = new MessageChannel();
    clients[0].postMessage({ type: 'GET_PROJECTS' }, [channel.port2]);
    channel.port1.onmessage = (event) => {
      resolve(event.data || []);
    };
  });
}

// Enviar alerta para o client
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
    console.error('Error verifying project:', error);
    await sendAlertToClient(`Error verifying project: ${error.message}`, 'danger');
    return false;
  }
}

// Incrementar contador de requisições
async function incrementRequestCount(projectId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Buscar dados atuais
    const { data: existingData, error: fetchError } = await supabase
      .from('project_requests')
      .select('*')
      .eq('project_id', projectId)
      .single();

    let currentData = {
      project_id: projectId,
      requests_today: 0,
      total_requests: 0,
      daily_requests: {},
      level: 1
    };

    if (existingData && !fetchError) {
      currentData = existingData;
    }

    // 2. Preparar dados atualizados
    const updatedData = {
      requests_today: (currentData.requests_today || 0) + 1,
      total_requests: (currentData.total_requests || 0) + 1,
      last_request_date: today,
      daily_requests: {
        ...(currentData.daily_requests || {}),
        [today]: ((currentData.daily_requests || {})[today] || 0) + 1
      },
      updated_at: new Date().toISOString()
    };

    // 3. Verificar level up
    const currentLevel = currentData.level || 1;
    if (updatedData.total_requests >= currentLevel * 100) {
      updatedData.level = currentLevel + 1;
    }

    // 4. Atualizar no Supabase
    const { error } = await supabase
      .from('project_requests')
      .upsert(updatedData);

    if (error) throw error;

    // 5. Notificar client
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'UPDATE_PROJECT',
        payload: {
          projectId,
          ...updatedData
        }
      });
    });

  } catch (error) {
    console.error('Error incrementing request count:', error);
    await sendAlertToClient(`Error updating request count: ${error.message}`, 'danger');
  }
}

// Manipular requisições para /animes
async function handleAnimeRequest(event) {
  try {
    const url = new URL(event.request.url);
    const parts = url.pathname.split('/').filter(p => p);
    const projectId = parts[0];
    
    if (!projectId) {
      return new Response(JSON.stringify({ error: 'Project ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar se o projeto existe
    const projectExists = await verifyProjectExists(projectId);
    if (!projectExists) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Incrementar contador
    await incrementRequestCount(projectId);

    // Dados simulados de animes
    const animeData = {
      success: true,
      projectId,
      data: [
        { 
          id: 1, 
          title: "Demon Slayer", 
          episodes: 26,
          genres: ["Action", "Fantasy"],
          rating: 8.7
        },
        { 
          id: 2, 
          title: "Jujutsu Kaisen", 
          episodes: 24,
          genres: ["Action", "Supernatural"],
          rating: 8.8
        }
      ],
      timestamp: new Date().toISOString(),
      version: "1.0"
    };
    
    return new Response(JSON.stringify(animeData), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600'
      }
    };
  } catch (error) {
    console.error('Error in anime endpoint:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Evento de instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CACHE_URLS);
        await sendAlertToClient('Cache installed successfully!', 'success');
      } catch (error) {
        await sendAlertToClient(`Cache installation failed: ${error.message}`, 'danger');
        throw error;
      }
    })()
  );
});

// Evento de ativação
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
        await sendAlertToClient('Service Worker activated!', 'success');
      } catch (error) {
        await sendAlertToClient(`Activation failed: ${error.message}`, 'danger');
      }
    })()
  );
});

// Evento de fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Manipular endpoint /animes
  if (url.pathname.includes('/animes')) {
    event.respondWith(handleAnimeRequest(event));
    return;
  }

  // Estratégia Cache First para outros recursos
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
        // Fallback para páginas offline
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        return new Response('Offline - Resource not available', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })()
  );
});

// Evento de mensagem
self.addEventListener('message', (event) => {
  if (event.data.type === 'GET_PROJECTS') {
    event.ports[0].postMessage(getProjectsFromClient());
  }
  
  if (event.data.type === 'INCREMENT_REQUEST') {
    incrementRequestCount(event.data.payload.projectId);
  }
});
