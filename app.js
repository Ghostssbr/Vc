document.addEventListener('DOMContentLoaded', async function() {
    const REQUEST_LIMIT_PER_DAY = 1000;
    const supabaseUrl = 'https://nwoswxbtlquiekyangbs.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53b3N3eGJ0bHF1aWVreWFuZ2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3ODEwMjcsImV4cCI6MjA2MDM1NzAyN30.KarBv9AopQpldzGPamlj3zu9eScKltKKHH2JJblpoCE';
    let supabase;

    // Função para mostrar alertas
    function showAlert(message, type) {
        const alert = document.createElement('div');
        alert.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg text-white font-semibold tracking-wider z-50 ${
            type === 'success' ? 'bg-green-600' : 
            type === 'danger' ? 'bg-red-600' :
            type === 'warning' ? 'bg-yellow-600' :
            'bg-blue-600'
        }`;
        alert.textContent = message;
        document.body.appendChild(alert);
        
        setTimeout(() => {
            alert.classList.add('opacity-0', 'transition-opacity', 'duration-500');
            setTimeout(() => alert.remove(), 500);
        }, 3000);
    }

    // Função para verificar e corrigir dados
    function getProjects() {
        try {
            const projects = JSON.parse(localStorage.getItem('shadowGateProjects4')) || [];
            if (!Array.isArray(projects)) throw new Error('Dados inválidos');
            return projects.filter(p => p && p.id);
        } catch (e) {
            showAlert('Corrigindo dados corrompidos...', 'warning');
            localStorage.setItem('shadowGateProjects4', JSON.stringify([]));
            return [];
        }
    }

    // Atualizar contadores diários
    function updateDailyCounters() {
        const today = new Date().toISOString().split('T')[0];
        const projects = getProjects().map(project => ({
            ...project,
            requestsToday: project.lastRequestDate === today ? project.requestsToday || 0 : 0,
            lastRequestDate: today,
            dailyRequests: {
                ...(project.dailyRequests || {}),
                [today]: project.lastRequestDate === today ? (project.dailyRequests?.[today] || 0) : 0
            }
        }));
        localStorage.setItem('shadowGateProjects4', JSON.stringify(projects));
    }

    // Inicialização
    async function initialize() {
        updateDailyCounters();

        // Conexão com Supabase
        try {
            supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
            window.supabase = supabase;
            showAlert('Conectado ao banco de dados', 'success');
        } catch (error) {
            showAlert('Erro ao conectar com o banco de dados', 'danger');
        }

        // Registrar Service Worker
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/'
                });

                showAlert('Service2 Worker registrado com sucesso', 'success');

                navigator.serviceWorker.addEventListener('message', event => {
                    if (event.data.type === 'GET_PROJECTS') {
                        event.ports[0].postMessage(getProjects());
                    }
                });

                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'activated') {
                            showAlert('Nova versão disponível! Atualizando...', 'info');
                            setTimeout(() => window.location.reload(), 1500);
                        }
                    });
                });
            } catch (error) {
                showAlert(`Falha ao registrar Service Worker: ${error.message}`, 'danger');
            }
        }

        loadProjects();
        setupForm();
    }

    // Carregar projetos
    function loadProjects() {
        const container = document.getElementById('projectsContainer');
        const noProjects = document.getElementById('noProjects');
        const projects = getProjects();
        
        container.innerHTML = '';
        noProjects.classList.toggle('hidden', projects.length > 0);

        projects.forEach(project => {
            const card = document.createElement('div');
            card.className = 'project-card bg-gray-800 rounded-lg overflow-hidden cursor-pointer';
            card.innerHTML = `
                <div class="absolute top-2 right-2 bg-solo-dark text-solo-blue border border-solo-blue px-2 py-1 rounded-full text-xs font-bold tracking-wider">
                    LV. ${project.level || 1}
                </div>
                <div class="p-4 border-b border-gray-700">
                    <div class="flex justify-between items-start">
                        <h3 class="text-lg font-semibold text-white tracking-wider">${project.name || 'Sem nome'}</h3>
                        <span class="status-badge ${(project.status || 'active') === 'active' ? 'text-green-400' : 'text-yellow-400'} text-xs font-medium px-2 py-0.5 rounded-full bg-opacity-20 ${(project.status || 'active') === 'active' ? 'bg-green-900' : 'bg-yellow-900'}">
                            ${(project.status || 'active') === 'active' ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                    </div>
                    <p class="text-xs text-gray-400 mt-1 tracking-wider">CREATED ${project.createdAt ? formatDate(project.createdAt) : 'Data desconhecida'}</p>
                </div>
                <div class="p-4">
                    <div class="flex items-center mb-3">
                        <i class="bi bi-link text-gray-400 mr-2"></i>
                        <span class="text-xs text-gray-300 truncate">${project.url || 'Sem URL'}</span>
                    </div>
                    <div class="flex justify-between text-xs text-gray-400 tracking-wider">
                        <span>${project.requestsToday || 0}/${REQUEST_LIMIT_PER_DAY} REQUESTS TODAY</span>
                        <span class="flex items-center">
                            <i class="bi bi-arrow-right text-solo-blue ml-1"></i>
                        </span>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => {
                window.location.href = `dashboard.html?project=${encodeURIComponent(project.id)}`;
            });
            container.appendChild(card);
        });
    }

    // Configurar formulário
    function setupForm() {
        document.getElementById('newProjectForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const projectName = document.getElementById('projectName').value.trim();
            const spreadsheetUrl = document.getElementById('spreadsheetUrl').value.trim();
            
            if (!projectName || !spreadsheetUrl) {
                showAlert('Preencha todos os campos obrigatórios', 'danger');
                return;
            }

            const idProject = `gate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const today = new Date().toISOString().split('T')[0];
            
            const newProject = {
                id: idProject,
                name: projectName,
                url: spreadsheetUrl,
                status: 'active',
                createdAt: new Date().toISOString(),
                requestsToday: 0,
                totalRequests: 0,
                lastRequestDate: today,
                dailyRequests: { [today]: 0 },
                level: 1,
                activityData: generateActivityData()
            };
            
            try {
                const projects = getProjects();
                
                if (projects.some(p => p.id === idProject)) {
                    throw new Error('Projeto já existe');
                }
                
                projects.push(newProject);
                localStorage.setItem('shadowGateProjects4', JSON.stringify(projects));
                
                // Supabase - Criar registro nas duas tabelas
                if (window.supabase) {
                    // Tabela project_tokens
                    const { error: tokenError } = await supabase
                        .from('project_tokens')
                        .insert([{
                            project_id: idProject,
                            created_at: new Date().toISOString()
                        }]);
                    
                    if (tokenError) throw tokenError;
                    
                    // Tabela project_requests
                    const { error: requestError } = await supabase
                        .from('project_requests')
                        .insert([{
                            project_id: idProject,
                            requests_today: 0,
                            total_requests: 0,
                            last_request_date: today,
                            daily_requests: { [today]: 0 },
                            level: 1,
                            updated_at: new Date().toISOString()
                        }]);
                    
                    if (requestError) throw requestError;
                }
                
                showAlert('Projeto criado com sucesso! Redirecionando...', 'success');
                setTimeout(() => {
                    window.location.href = `dashboard.html?project=${encodeURIComponent(idProject)}`;
                }, 1500);
                
            } catch (error) {
                showAlert(`Erro ao criar projeto: ${error.message}`, 'danger');
            }
        });
    }

    // Funções auxiliares
    function generateActivityData() {
        return {
            '7d': Array.from({length: 7}, () => Math.floor(Math.random() * 50) + 10),
            '30d': Array.from({length: 30}, () => Math.floor(Math.random() * 100) + 20),
            '90d': Array.from({length: 90}, () => Math.floor(Math.random() * 150) + 30)
        };
    }

    function formatDate(dateString) {
        try {
            const options = { year: 'numeric', month: 'short', day: 'numeric' };
            return new Date(dateString).toLocaleDateString('en-US', options);
        } catch (e) {
            showAlert('Erro ao formatar data', 'warning');
            return 'Data inválida';
        }
    }

    // Iniciar a aplicação
    initialize();
});
