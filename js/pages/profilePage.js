import { getInventory, getProfile } from '../api.js';
import { formatNumber, escapeHtml, userBadgeHTML } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { VERSION, CHANGELOG } from '../version.js';

export const profilePage = {
    profile: null,

    render(container) {
        this.attachEvents(container);
        this.loadProfile();
        const versionEl = document.getElementById('app-version');
        if (versionEl) versionEl.textContent = VERSION;
        this.initChangelogModal();
    },

    attachEvents(container) {
        const changelogBtn = container.querySelector('#btn-changelog');
        if (changelogBtn) {
            changelogBtn.addEventListener('click', () => {
                document.getElementById('changelog-modal').style.display = 'flex';
                createIcons({ icons });
            });
        }

        const closeBtn = document.getElementById('changelog-close');
        const overlay = document.getElementById('changelog-overlay');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('changelog-modal').style.display = 'none';
            });
        }
        if (overlay) {
            overlay.addEventListener('click', () => {
                document.getElementById('changelog-modal').style.display = 'none';
            });
        }

        createIcons({ icons });
    },

    initChangelogModal() {
        const content = document.getElementById('changelog-content');
        if (!content) return;

        content.innerHTML = CHANGELOG.map(item => `
            <div class="changelog-item">
                <div class="changelog-header">
                    <span class="changelog-version">${item.version}</span>
                    <span class="changelog-date">${item.date}</span>
                </div>
                <ul class="changelog-features">
                    ${item.features.map(f => `<li>${f}</li>`).join('')}
                </ul>
            </div>
        `).join('');
    },

    async loadProfile() {
        try {
            const profile = await getProfile();
            if (!profile) return;
            this.profile = profile;
            
            const nickname = escapeHtml(profile.nickname) || '无名旅者';
            document.getElementById('profile-nickname').innerHTML = nickname + userBadgeHTML(profile);
            document.getElementById('profile-initial').textContent = nickname.charAt(0).toUpperCase();
            document.getElementById('profile-email').textContent = profile.id ? '' : '';
            document.getElementById('profile-shells').textContent = formatNumber(profile.shells);
            document.getElementById('global-shells').textContent = formatNumber(profile.shells);

            const inventory = await getInventory();
            const collectionCount = inventory?.filter(item => item.item_type === 'collection').reduce((sum, item) => sum + item.quantity, 0) || 0;
            document.getElementById('profile-items').textContent = formatNumber(collectionCount);
        } catch (e) {
            console.error(e);
        }
    }
};
