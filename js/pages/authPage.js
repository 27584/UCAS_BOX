import { signIn, signUp } from '../api.js';
import { router } from '../router.js';
import { supabase } from '../supabaseClient.js';
import { showToast } from '../utils.js';

export const authPage = {
    attachEvents(container) {
        let mode = 'login';
        const tabs = container.querySelectorAll('#auth-tabs .tab-btn');
        const nicknameGroup = container.querySelector('#nickname-group');
        const btnText = container.querySelector('#auth-btn-text');
        const form = container.querySelector('#auth-form');
        const resendBtn = container.querySelector('#resend-email-btn');
        const resendEmailInput = container.querySelector('#resend-email-input');
        const emailInput = container.querySelector('#email');

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
            const email = emailInput.value.trim();
            const password = container.querySelector('#password').value;
            const nickname = container.querySelector('#nickname').value.trim();

            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;

            try {
                if (mode === 'login') {
                    await signIn(email, password);
                } else {
                    // 昵称验证
                    if (!nickname || nickname.length < 2) {
                        showToast('昵称至少需要2个字符', 'error');
                        btn.disabled = false;
                        return;
                    }
                    if (nickname.length > 20) {
                        showToast('昵称不能超过20个字符', 'error');
                        btn.disabled = false;
                        return;
                    }
                    // 检查特殊字符
                    if (/[<>\'\"\\%;()]/.test(nickname)) {
                        showToast('昵称不能包含特殊字符', 'error');
                        btn.disabled = false;
                        return;
                    }
                    
                    await signUp(email, password, nickname);
                }
                router.navigate('lobby');
            } catch (err) {
                // toast already shown in api
            } finally {
                btn.disabled = false;
            }
        });

        // 重新发送验证邮件
        resendBtn?.addEventListener('click', async () => {
            const email = resendEmailInput.value.trim();
            if (!email) {
                showToast('请输入要接收验证邮件的邮箱', 'error');
                resendEmailInput.focus();
                return;
            }
            
            resendBtn.disabled = true;
            resendBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
            
            try {
                const { error } = await supabase.auth.resend({
                    type: 'signup',
                    email: email
                });
                
                if (error) {
                    const msg = error.message?.toLowerCase() || '';
                    if (msg.includes('rate limit') || msg.includes('429')) {
                        showToast('操作太频繁，请稍后再试', 'error');
                    } else if (msg.includes('email') && (msg.includes('invalid') || msg.includes('malformed'))) {
                        showToast('邮箱格式不正确', 'error');
                    } else {
                        showToast('发送失败，请检查邮箱是否已注册', 'error');
                    }
                    resendBtn.disabled = false;
                    resendBtn.innerHTML = '<i data-lucide="send"></i>';
                } else {
                    showToast('已发送验证邮件，如未收到请确认邮箱已注册', 'success');
                    resendBtn.innerHTML = '<i data-lucide="check"></i>';
                    setTimeout(() => {
                        resendBtn.disabled = false;
                        resendBtn.innerHTML = '<i data-lucide="send"></i>';
                    }, 5000);
                }
            } catch (err) {
                showToast('发送失败，请稍后重试', 'error');
                resendBtn.disabled = false;
                resendBtn.innerHTML = '<i data-lucide="send"></i>';
            }
            
            // 重新渲染图标
            const { createIcons, icons } = await import('lucide');
            createIcons({ icons });
        });
    }
};
