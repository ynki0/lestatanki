const registerForm = document.getElementById('registerForm');

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (registerForm.dataset.submitting === 'true') return;

  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const submitButton = registerForm.querySelector('button[type="submit"]');
  const errorAlert = document.getElementById('registerError');
  const successAlert = document.getElementById('registerSuccess');

  if (errorAlert) errorAlert.style.display = 'none';
  if (successAlert) successAlert.style.display = 'none';

  if (password.length < 6) {
    showAlert('registerError', 'Пароль минимум 6 символов');
    return;
  }

  registerForm.dataset.submitting = 'true';
  if (submitButton) submitButton.disabled = true;

  try {
    await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('regName').value,
        email,
        password,
      }),
    });

    try { currentUser = await api('/api/me'); } catch { currentUser = null; }
    try { if (currentUser && currentUser.email) localStorage.setItem('chat_email', currentUser.email); } catch (e) {}
    updateNavAuth();
    window.location.href = '/client';
  } catch (err) {
    try { currentUser = await api('/api/me'); } catch { currentUser = null; }

    if (err.message === 'Email уже зарегистрирован' && currentUser?.email?.toLowerCase() === email) {
      try { localStorage.setItem('chat_email', currentUser.email); } catch (e) {}
      updateNavAuth();
      window.location.href = '/client';
      return;
    }

    showAlert('registerError', err.message);
  } finally {
    registerForm.dataset.submitting = 'false';
    if (submitButton) submitButton.disabled = false;
  }
});
