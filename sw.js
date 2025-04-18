const CACHE_NAME = 'shadow-gate-v14';
const supabaseUrl = 'https://nwoswxbtlquiekyangbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53b3N3eGJ0bHF1aWVreWFuZ2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3ODEwMjcsImV4cCI6MjA2MDM1NzAyN30.KarBv9AopQpldzGPamlj3zu9eScKltKKHH2JJblpoCE';

// Função para mostrar alertas
async function showAlert(message, type) {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({
            type: 'SHOW_ALERT',
            payload: { message, type }
        });
    });
}

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
        await showAlert(`Erro ao verificar projeto: ${error.message}`, 'danger');
        return false;
    }
}

// Função para incrementar o contador de requests no Supabase
async function incrementRequestCount(projectId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // 1. Buscar dados atuais
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

        // 2. Calcular novos valores
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
            await showAlert(`Gate ${projectId} subiu para o nível ${updatedData.level}!`, 'success');
        }

        // 3. Atualizar no Supabase
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
        await showAlert(`Erro ao incrementar contador: ${error.message}`, 'danger');
    }
}

// Handler para requests de /animes
async function handleAnimeRequest(event) {
    try {
        const url = new URL(event.request.url);
        const pathParts = url.pathname.split('/').filter(part => part !== '');
        
        // Verificar se o path está no formato correto: /projectid/animes
        if (pathParts.length !== 2 || pathParts[1] !== 'animes') {
            return fetch(event.request); // Deixa a requisição seguir normalmente
        }

        const projectId = pathParts[0];
        
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
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store' // Evitar cache das respostas
            }
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
    
    // Tratar apenas requests para /projectid/animes
    if (url.pathname.match(/\/[^\/]+\/animes$/)) {
        event.respondWith(handleAnimeRequest(event));
        return;
    }

    // Para todas outras requisições, usar estratégia cache-first
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Retornar resposta em cache se existir
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Se não tiver em cache, buscar na rede
                return fetch(event.request)
                    .then(response => {
                        // Se a resposta for válida, adicionar ao cache
                        if (response && response.status === 200 && response.type === 'basic') {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, responseToCache));
                        }
                        return response;
                    })
                    .catch(error => {
                        // Se falhar, mostrar página offline se for uma navegação
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
            .then(cache => cache.addAll([
                '/',
                '/index.html',
                '/home.html',
                '/dashboard.html',
                '/app.js',
                '/dashboard.js',
                '/dashboard.css',
                '/offline.html'
            ]))
            .then(() => showAlert('Aplicativo pronto para uso offline!', 'success'))
            .catch(error => {
                showAlert('Falha ao instalar cache: ' + error.message, 'danger');
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
        .then(() => showAlert('Aplicativo atualizado!', 'success'))
        .catch(error => {
            showAlert('Falha ao limpar cache antigo: ' + error.message, 'danger');
        })
    );
});
