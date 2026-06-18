import { authPage } from './pages/authPage.js';
import { lobbyPage } from './pages/lobbyPage.js';
import { idlePage } from './pages/idlePage.js';
import { inventoryPage } from './pages/inventoryPage.js';
import { marketPage } from './pages/marketPage.js';
import { collectionPage } from './pages/collectionPage.js';
import { profilePage } from './pages/profilePage.js';
import { requireAuth, updateNavVisibility } from './auth.js';
import { currentUser } from './supabaseClient.js';

const routes = {
    auth: authPage,
    lobby: lobbyPage,
    idle: idlePage,
    inventory: inventoryPage,
    market: marketPage,
    collection: collectionPage,
    profile: profilePage,
};

async function loadTemplate(name) {
    const response = await fetch(`html/${name}.html`);
    if (!response.ok) throw new Error(`Failed to load template ${name}`);
    return await response.text();
}

class Router {
    constructor() {
        this.currentRoute = '';
        window.addEventListener('hashchange', () => this.handleRoute());
    }

    navigate(route) {
        window.location.hash = route;
    }

    async handleRoute() {
        const hash = window.location.hash.replace('#', '') || 'lobby';
        const route = hash.split('/')[0];

        if (!currentUser && route !== 'auth') {
            this.navigate('auth');
            return;
        }
        if (currentUser && route === 'auth') {
            this.navigate('lobby');
            return;
        }

        this.currentRoute = route;
        const page = routes[route] || routes.lobby;
        const container = document.getElementById('main-content');

        try {
            const html = await loadTemplate(route);
            container.innerHTML = html;
            page.attachEvents(container);
        } catch (e) {
            console.error('Failed to load template:', e);
            page.render(container);
        }

        this.updateActiveNav(route);
        updateNavVisibility();
    }

    updateActiveNav(route) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.route === route);
        });
    }
}

export const router = new Router();
