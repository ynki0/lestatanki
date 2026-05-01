document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return;
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    try { currentUser = await api('/api/me'); } catch { currentUser = null; }
    try { if (currentUser && currentUser.email) localStorage.setItem('chat_email', currentUser.email); } catch (e) {}
    updateNavAuth();
    if (currentUser && currentUser.role === 'admin') window.location.href = '/admin';
    else window.location.href = '/client';
  } catch (err) {
    showAlert('loginError', err.message || 'Ошибка входа');
  }
});

const forgotPasswordToggle = document.getElementById('forgotPasswordToggle');
const forgotPasswordPanel = document.getElementById('forgotPasswordPanel');

forgotPasswordToggle?.addEventListener('click', () => {
  forgotPasswordPanel?.classList.toggle('hidden');
  const loginEmail = document.getElementById('loginEmail')?.value?.trim();
  const forgotEmail = document.getElementById('forgotPasswordEmail');
  if (forgotEmail && loginEmail && !forgotEmail.value) forgotEmail.value = loginEmail;
});

document.getElementById('forgotPasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('forgotPasswordEmail')?.value?.trim() || '';
  if (!email) return;

  try {
    const data = await api('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    showAlert('forgotPasswordSuccess', data.message || 'Письмо отправлено');
  } catch (err) {
    showAlert('forgotPasswordError', err.message || 'Не удалось отправить письмо');
  }
});
