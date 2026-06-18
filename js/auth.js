import { supabase, currentUser, refreshSession } from './supabaseClient.js';
import { router } from './router.js';

// ============================================
// 认证状态管理
// ============================================

export async function initAuth() {
    await refreshSession();
    updateNavVisibility();

    supabase.auth.onAuthStateChange((event, session) => {
        updateNavVisibility();
        const hash = window.location.hash.replace('#', '') || 'lobby';
        if (!session && hash !== 'auth') {
            router.navigate('auth');
        } else if (session && hash === 'auth') {
            router.navigate('lobby');
        }
    });
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
