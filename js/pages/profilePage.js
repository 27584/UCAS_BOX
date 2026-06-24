import { getInventory, getProfile, updateAvatar } from '../api.js';
import { formatNumber, escapeHtml, userBadgeHTML, showToast } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { VERSION, CHANGELOG } from '../version.js';

export const profilePage = {
    profile: null,
    avatarImage: null,
    avatarZoom: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    avatarIsDragging: false,
    avatarDragStartX: 0,
    avatarDragStartY: 0,

    render(container) {
        this.attachEvents(container);
        this.loadProfile();
        const versionEl = document.getElementById('app-version');
        if (versionEl) versionEl.textContent = VERSION;
        this.initChangelogModal();
        this.initAvatarCrop();
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
            
            const avatarEl = document.getElementById('profile-avatar');
            if (profile.avatar_url) {
                avatarEl.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="${nickname}" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                avatarEl.innerHTML = `<span id="profile-initial">${nickname.charAt(0).toUpperCase()}</span>`;
            }
            
            document.getElementById('profile-email').textContent = profile.id ? '' : '';
            document.getElementById('profile-shells').textContent = formatNumber(profile.shells);
            document.getElementById('global-shells').textContent = formatNumber(profile.shells);

            const inventory = await getInventory();
            const collectionCount = inventory?.filter(item => item.item_type === 'collection').reduce((sum, item) => sum + item.quantity, 0) || 0;
            document.getElementById('profile-items').textContent = formatNumber(collectionCount);
        } catch (e) {
            console.error(e);
        }
    },

    initAvatarCrop() {
        const wrapper = document.getElementById('profile-avatar-wrapper');
        const fileInput = document.getElementById('avatar-file-input');
        const modal = document.getElementById('avatar-crop-modal');
        const closeBtn = document.getElementById('avatar-crop-close');
        const overlay = document.getElementById('avatar-crop-overlay');
        const cancelBtn = document.getElementById('avatar-crop-cancel');
        const confirmBtn = document.getElementById('avatar-crop-confirm');
        const zoomSlider = document.getElementById('avatar-zoom-slider');

        if (!wrapper || !fileInput) return;

        wrapper.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                showToast('请选择图片文件', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    this.avatarImage = img;
                    this.avatarZoom = 1;
                    this.avatarOffsetX = 0;
                    this.avatarOffsetY = 0;
                    if (zoomSlider) zoomSlider.value = 1;
                    this.drawAvatarCanvas();
                    modal.style.display = 'flex';
                    createIcons({ icons });
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });

        const closeModal = () => {
            modal.style.display = 'none';
            fileInput.value = '';
            this.avatarImage = null;
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        if (zoomSlider) {
            zoomSlider.addEventListener('input', () => {
                this.avatarZoom = parseFloat(zoomSlider.value);
                this.drawAvatarCanvas();
            });
        }

        const canvas = document.getElementById('avatar-crop-canvas');
        if (canvas) {
            canvas.addEventListener('mousedown', (e) => {
                this.avatarIsDragging = true;
                this.avatarDragStartX = e.clientX - this.avatarOffsetX;
                this.avatarDragStartY = e.clientY - this.avatarOffsetY;
            });
            window.addEventListener('mousemove', (e) => {
                if (!this.avatarIsDragging) return;
                this.avatarOffsetX = e.clientX - this.avatarDragStartX;
                this.avatarOffsetY = e.clientY - this.avatarDragStartY;
                this.drawAvatarCanvas();
            });
            window.addEventListener('mouseup', () => {
                this.avatarIsDragging = false;
            });

            canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                this.avatarIsDragging = true;
                this.avatarDragStartX = touch.clientX - this.avatarOffsetX;
                this.avatarDragStartY = touch.clientY - this.avatarOffsetY;
            });
            canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (!this.avatarIsDragging) return;
                const touch = e.touches[0];
                this.avatarOffsetX = touch.clientX - this.avatarDragStartX;
                this.avatarOffsetY = touch.clientY - this.avatarDragStartY;
                this.drawAvatarCanvas();
            });
            canvas.addEventListener('touchend', () => {
                this.avatarIsDragging = false;
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                if (!this.avatarImage) return;
                confirmBtn.disabled = true;
                confirmBtn.textContent = '上传中...';
                try {
                    const dataUrl = this.getCroppedAvatar();
                    await updateAvatar(dataUrl);
                    showToast('头像更新成功', 'success');
                    closeModal();
                    this.loadProfile();
                } catch (e) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '确认上传';
                }
            });
        }
    },

    drawAvatarCanvas() {
        const canvas = document.getElementById('avatar-crop-canvas');
        if (!canvas || !this.avatarImage) return;

        const size = 300;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#f5f0e6';
        ctx.fillRect(0, 0, size, size);

        const img = this.avatarImage;
        const scale = Math.min(size / img.width, size / img.height) * this.avatarZoom;
        const w = img.width * scale;
        const h = img.height * scale;
        const x = size / 2 - w / 2 + this.avatarOffsetX;
        const y = size / 2 - h / 2 + this.avatarOffsetY;

        ctx.drawImage(img, x, y, w, h);

        ctx.strokeStyle = '#d4a017';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, size, size);
    },

    getCroppedAvatar() {
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const img = this.avatarImage;
        const srcSize = 300;
        const scale = Math.min(srcSize / img.width, srcSize / img.height) * this.avatarZoom;
        const w = img.width * scale;
        const h = img.height * scale;
        const x = srcSize / 2 - w / 2 + this.avatarOffsetX;
        const y = srcSize / 2 - h / 2 + this.avatarOffsetY;

        const ratio = size / srcSize;
        ctx.drawImage(img, x * ratio, y * ratio, w * ratio, h * ratio);

        return canvas.toDataURL('image/jpeg', 0.8);
    }
};
