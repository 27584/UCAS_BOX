import { supabase, currentUser, refreshSession } from './supabaseClient.js';
import { router } from './router.js';
import { getProfile, getMails, checkAdmin } from './api.js';
import { formatNumber } from './utils.js';

// ============================================
// 认证状态管理
// ============================================

export async function initAuth() {
    await refreshSession();
    updateNavVisibility();
    updateGlobalShells();
    updateMailBadge();
    updateAdminNav();

    supabase.auth.onAuthStateChange((event, session) => {
        updateNavVisibility();
        updateGlobalShells();
        updateMailBadge();
        updateAdminNav();
        const hash = window.location.hash.replace('#', '') || 'lobby';
        if (!session && hash !== 'auth') {
            router.navigate('auth');
        } else if (session && hash === 'auth') {
            router.navigate('lobby');
        }
    });
}

export async function updateGlobalShells() {
    if (!currentUser) return;
    try {
        const profile = await getProfile();
        const el = document.getElementById('global-shells');
        if (el && profile) {
            el.textContent = formatNumber(profile.shells);
        }
    } catch (e) {
        console.error('Failed to update shells:', e);
    }
}

export async function updateMailBadge() {
    if (!currentUser) {
        document.getElementById('mail-badge')?.style.setProperty('display', 'none');
        document.getElementById('header-mail-badge')?.style.setProperty('display', 'none');
        return;
    }
    try {
        const mails = await getMails();
        const unreadCount = mails.filter(m => !m.is_read).length;
        const navBadge = document.getElementById('mail-badge');
        const headerBadge = document.getElementById('header-mail-badge');
        if (navBadge) {
            navBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            navBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
        if (headerBadge) {
            headerBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            headerBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
    } catch (e) {
        // silently fail
    }
}

export async function updateAdminNav() {
    if (!currentUser) {
        document.getElementById('nav-admin')?.style.setProperty('display', 'none');
        document.getElementById('nav-admin-bottom')?.style.setProperty('display', 'none');
        return;
    }
    try {
        const isAdmin = await checkAdmin();
        document.getElementById('nav-admin')?.style.setProperty('display', isAdmin ? 'flex' : 'none');
        document.getElementById('nav-admin-bottom')?.style.setProperty('display', isAdmin ? 'flex' : 'none');
    } catch (e) {
        document.getElementById('nav-admin')?.style.setProperty('display', 'none');
        document.getElementById('nav-admin-bottom')?.style.setProperty('display', 'none');
    }
}

export function updateNavVisibility() {
    const isLoggedIn = !!currentUser;
    const topNav = document.getElementById('top-nav');
    const bottomNav = document.getElementById('bottom-nav');
    if (topNav) topNav.style.display = isLoggedIn ? 'flex' : 'none';
    if (bottomNav) bottomNav.style.display = isLoggedIn ? 'flex' : 'none';
}

export function requireAuth() {
    if (!currentUser) {
        router.navigate('auth');
        return false;
    }
    return true;
}
