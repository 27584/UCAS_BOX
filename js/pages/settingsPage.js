import { getUserSettingsFull, updateProfileSetting, getProfile, signOut } from '../api.js';
import { createIcons, icons } from 'lucide';
import { showToast } from '../utils.js';
import { router } from '../router.js';

export const settingsPage = {
    settings: null,

    render(container) {
        this.loadSettings();
        this.bindEvents();
    },

    bindEvents() {
        // 退出登录按钮
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await signOut();
                    router.navigate('auth');
                } catch (e) {}
            });
        }
    },

    async loadSettings() {
        try {
            const settings = await getUserSettingsFull();
            this.settings = settings || { show_collections_publicly: true, allow_follow: true, allow_stranger_dm: true, allow_search: true, show_online_status: true };
            this.renderSettings();
        } catch (e) {
            showToast('加载设置失败', 'error');
        }
    },

    renderSettings() {
        // 公开收藏品设置
        const toggleCollections = document.getElementById('toggle-show-collections');
        if (toggleCollections) {
            toggleCollections.checked = this.settings.show_collections_publicly !== false;
            toggleCollections.addEventListener('change', async (e) => {
                try {
                    await updateProfileSetting('show_collections_publicly', e.target.checked);
                    showToast('设置已保存', 'success');
                } catch (e) {
                    showToast('保存失败', 'error');
                    toggleCollections.checked = !e.target.checked;
                }
            });
        }

        // 允许被关注设置
        const toggleFollow = document.getElementById('toggle-allow-follow');
        if (toggleFollow) {
            toggleFollow.checked = this.settings.allow_follow !== false;
            toggleFollow.addEventListener('change', async (e) => {
                try {
                    await updateProfileSetting('allow_follow', e.target.checked);
                    showToast('设置已保存', 'success');
                } catch (e) {
                    showToast('保存失败', 'error');
                    toggleFollow.checked = !e.target.checked;
                }
            });
        }

        // 允许陌生人私信设置
        const toggleDm = document.getElementById('toggle-allow-stranger-dm');
        if (toggleDm) {
            toggleDm.checked = this.settings.allow_stranger_dm !== false;
            toggleDm.addEventListener('change', async (e) => {
                try {
                    await updateProfileSetting('allow_stranger_dm', e.target.checked);
                    showToast('设置已保存', 'success');
                } catch (e) {
                    showToast('保存失败', 'error');
                    toggleDm.checked = !e.target.checked;
                }
            });
        }

        // 允许被搜索设置
        const toggleSearch = document.getElementById('toggle-allow-search');
        if (toggleSearch) {
            toggleSearch.checked = this.settings.allow_search !== false;
            toggleSearch.addEventListener('change', async (e) => {
                try {
                    await updateProfileSetting('allow_search', e.target.checked);
                    showToast('设置已保存', 'success');
                } catch (e) {
                    showToast('保存失败', 'error');
                    toggleSearch.checked = !e.target.checked;
                }
            });
        }

        // 显示在线状态设置
        const toggleOnlineStatus = document.getElementById('toggle-show-online-status');
        if (toggleOnlineStatus) {
            toggleOnlineStatus.checked = this.settings.show_online_status !== false;
            toggleOnlineStatus.addEventListener('change', async (e) => {
                try {
                    await updateProfileSetting('show_online_status', e.target.checked);
                    showToast('设置已保存', 'success');
                } catch (e) {
                    showToast('保存失败', 'error');
                    toggleOnlineStatus.checked = !e.target.checked;
                }
            });
        }

        createIcons({ icons });
    }
};