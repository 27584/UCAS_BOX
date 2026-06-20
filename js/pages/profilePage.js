import { signOut, getInventory, updateProfileSetting, getProfile, getUserSettings } from '../api.js';
import { formatNumber, escapeHtml, showToast, userBadgeHTML } from '../utils.js';
import { router } from '../router.js';
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
        container.querySelector('#btn-logout').addEventListener('click', async () => {
            try {
                await signOut();
                router.navigate('auth');
            } catch (e) {}
        });

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

        // 公开收藏开关
        const showCollectionsToggle = container.querySelector('#toggle-show-collections');
        if (showCollectionsToggle) {
            showCollectionsToggle.addEventListener('change', async (e) => {
                try {
                    await updateProfileSetting('show_collections_publicly', e.target.checked);
                    showToast(e.target.checked ? '已开启公开收藏' : '已关闭公开收藏', 'success');
                } catch (err) {
                    e.target.checked = !e.target.checked;
                    showToast('设置失败', 'error');
                }
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

            // 获取用户设置并设置公开收藏开关
            const settings = await getUserSettings();
            const toggle = document.getElementById('toggle-show-collections');
            if (toggle) {
                // 如果没有设置记录，默认开启（true）；如果有设置记录，使用设置值
                toggle.checked = settings?.show_collections_publicly !== false;
            }
        } catch (e) {
            console.error(e);
        }
    }
};
