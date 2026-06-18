import { signOut } from '../api.js';
import { getProfile } from '../api.js';
import { formatNumber, escapeHtml } from '../utils.js';
import { router } from '../router.js';
import { createIcons } from 'lucide';

export const profilePage = {
    render(container) {
        this.attachEvents(container);
        this.loadProfile();
    },

    attachEvents(container) {
        container.querySelector('#btn-logout').addEventListener('click', async () => {
            try {
                await signOut();
                router.navigate('auth');
            } catch (e) {}
        });
        createIcons();
    },

    async loadProfile() {
        try {
            const profile = await getProfile();
            if (!profile) return;
            const nickname = escapeHtml(profile.nickname) || '无名旅者';
            document.getElementById('profile-nickname').textContent = nickname;
            document.getElementById('profile-initial').textContent = nickname.charAt(0).toUpperCase();
            document.getElementById('profile-email').textContent = profile.id ? '' : '';
            document.getElementById('profile-shells').textContent = formatNumber(profile.shells);
            document.getElementById('global-shells').textContent = formatNumber(profile.shells);
        } catch (e) {
            console.error(e);
        }
    }
};
