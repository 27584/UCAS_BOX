import { signIn, signUp } from '../api.js';
import { router } from '../router.js';

export const authPage = {
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
