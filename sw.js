const CACHE_NAME = 'shadow-gate-v11';
const supabaseUrl = 'https://nwoswxbtlquiekyangbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53b3N3eGJ0bHF1aWVreWFuZ2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3ODEwMjcsImV4cCI6MjA2MDM1NzAyN30.KarBv9AopQpldzGPamlj3zu9eScKltKKHH2JJblpoCE';

// Função para verificar se o projeto existe no Supabase
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

// Função para incrementar o contador de requests no Supabase
async function incrementRequestCount(projectId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // 1. Buscar dados atuais
        const { data: currentData, error: fetchError } = await fetch(`${supabaseUrl}/rest/v1/project_requests?project_id=eq.${projectId}`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        }).then(res => res.json());

        if (fetchError) throw fetchError;

        const existingData = currentData && currentData[0] ? currentData[0] : {
            project_id: projectId,
            requests_today: 0,
            total_requests: 0,
            daily_requests: {},
            level: 1
        };

        // 2. Calcular novos valores
        const updatedData = {
            requests_today: (existingData.requests_today || 0) + 1,
            total_requests: (existingData.total_requests || 0) + 1,
            last_request_date: today,
            daily_requests: {
                ...existingData.daily_requests,
                [today]: (existingData.daily_requests?.[today] || 0) + 1
            },
            updated_at: new Date().toISOString()
        };

        // Verificar level up
        const currentLevel = existingData.level || 1;
        if (updatedData.total_requests >= currentLevel * 100) {
            updatedData.level = currentLevel + 1;
        }

        // 3. Atualizar no Supabase
        const { error } = await fetch(`${supabaseUrl}/rest/v1/project_requests`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(updatedData)
        });

        if (error) throw error;

        // 4. Notificar clients (se houver)
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'REQUEST_INCREMENTED',
                payload: {
                    projectId,
                    requestsToday: updatedData.requests_today,
                    totalRequests: updatedData.total_requests,
                    level: updatedData.level
                }
            });
        });

    } catch (error) {
        console.error('Error incrementing request count:', error);
    }
}

// Handler para requests de /animes
async function handleAnimeRequest(event) {
    try {
        const url = new URL(event.request.url);
        const pathParts = url.pathname.split('/').filter(part => part !== '');
        const projectId = pathParts[0];
        
        if (!projectId || pathParts[1] !== 'animes') {
            return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
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

        // Incrementar contador (antes de retornar a resposta)
        await incrementRequestCount(projectId);

        // Retornar dados
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

// Evento fetch principal
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Tratar requests para /projectid/animes
    if (url.pathname.includes('/animes')) {
        event.respondWith(handleAnimeRequest(event));
        return;
    }

    // Lógica padrão para outros requests
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => cachedResponse || fetch(event.request))
    );
});

// Restante do Service Worker (install, activate, etc...)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll([
                '/',
                '/index.html',
                '/home.html',
                '/dashboard.html',
                '/app.js',
                '/dashboard.js',
                '/dashboard.css'
            ]))
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
    );
});
