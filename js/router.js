import { authPage } from './pages/authPage.js';
import { lobbyPage } from './pages/lobbyPage.js';
import { idlePage } from './pages/idlePage.js';
import { inventoryPage } from './pages/inventoryPage.js';
import { marketPage } from './pages/marketPage.js';
import { collectionPage } from './pages/collectionPage.js';
import { profilePage } from './pages/profilePage.js';
import { userPage } from './pages/userPage.js';
import { postPage } from './pages/postPage.js';
import { messagePage } from './pages/messagePage.js';
import { settingsPage } from './pages/settingsPage.js';
import { adminPage } from './pages/adminPage.js';
import { submitPage } from './pages/submitPage.js';
import { activityPage } from './pages/activityPage.js';
import { feedPage } from './pages/feedPage.js';
import { followPage } from './pages/followPage.js';
import { explorePage } from './pages/explorePage.js';
import { requireAuth, updateNavVisibility, updateGlobalShells, updateMailBadge } from './auth.js';
import { currentUser } from './supabaseClient.js';

const routes = {
    auth: authPage,
    lobby: lobbyPage,
    idle: idlePage,
    inventory: inventoryPage,
    market: marketPage,
    collection: collectionPage,
    profile: profilePage,
    user: userPage,
    post: postPage,
    message: messagePage,
    settings: settingsPage,
    admin: adminPage,
    submit: submitPage,
    activity: activityPage,
    feed: feedPage,
    follow: followPage,
    explore: explorePage,
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
            // 调用 render（如果存在）或 attachEvents
            if (page.render) {
                page.render(container);
            } else if (page.attachEvents) {
                page.attachEvents(container);
            }
            
            // 背包页面挂载刷新方法
            if (route === 'inventory' && page.refreshInventory) {
                window.refreshInventory = () => page.refreshInventory();
            }
        } catch (e) {
            console.error('Failed to load template:', e.message);
            if (page.render) {
                page.render(container);
            } else if (page.attachEvents) {
                page.attachEvents(container);
            }
            
            if (route === 'inventory' && page.refreshInventory) {
                window.refreshInventory = () => page.refreshInventory();
            }
        }

        this.updateActiveNav(route);
        updateNavVisibility();
        updateGlobalShells();
        updateMailBadge();
    }

    updateActiveNav(route) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.route === route);
        });
    }
}

export const router = new Router();
