import { signIn, signUp } from '../api.js';
import { router } from '../router.js';

export const authPage = {
    render(container) {
        container.innerHTML = `
            <div class="auth-page">
                <div class="auth-card animate-bounce-in">
                    <div class="auth-header">
                        <span class="logo-icon">&#128230;</span>
                        <h1>UCAS_BOX</h1>
                        <p>开启你的收藏之旅</p>
                    </div>
                    <div class="tabs" id="auth-tabs">
                        <button class="tab-btn active" data-mode="login">登录</button>
                        <button class="tab-btn" data-mode="register">注册</button>
                    </div>
                    <form id="auth-form" class="auth-form">
                        <div class="form-group" id="nickname-group" style="display:none;">
                            <label class="form-label">昵称</label>
                            <input type="text" class="form-input" id="nickname" placeholder="你的昵称" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">邮箱</label>
                            <input type="email" class="form-input" id="email" placeholder="you@example.com" required />
                        </div>
                        <div class="form-group">
                            <label class="form-label">密码</label>
                            <input type="password" class="form-input" id="password" placeholder="至少6位密码" required />
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%;">
                            <span id="auth-btn-text">登录</span>
                        </button>
                    </form>
                </div>
            </div>
        `;
        this.attachEvents(container);
    },

    attachEvents(container) {
        let mode = 'login';
        const tabs = container.querySelectorAll('#auth-tabs .tab-btn');
        const nicknameGroup = container.querySelector('#nickname-group');
        const btnText = container.querySelector('#auth-btn-text');
        const form = container.querySelector('#auth-form');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                mode = tab.dataset.mode;
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                nicknameGroup.style.display = mode === 'register' ? 'block' : 'none';
                btnText.textContent = mode === 'register' ? '注册' : '登录';
            });
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = container.querySelector('#email').value.trim();
            const password = container.querySelector('#password').value;
            const nickname = container.querySelector('#nickname').value.trim();

            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;

            try {
                if (mode === 'login') {
                    await signIn(email, password);
                } else {
                    await signUp(email, password, nickname);
                }
                router.navigate('lobby');
            } catch (err) {
                // toast already shown in api
            } finally {
                btn.disabled = false;
            }
        });
    }
};
