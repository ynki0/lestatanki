const resetPasswordForm = document.getElementById('resetPasswordForm');
const resetPasswordErrorId = 'resetPasswordError';
const resetPasswordSuccessId = 'resetPasswordSuccess';

function getResetToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || '';
}

resetPasswordForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = getResetToken();
  const password = document.getElementById('resetPassword')?.value || '';
  const repeatPassword = document.getElementById('resetPasswordRepeat')?.value || '';

  if (!token) {
    showAlert(resetPasswordErrorId, 'Ссылка для сброса пароля недействительна');
    return;
  }
  if (password.length < 6) {
    showAlert(resetPasswordErrorId, 'Пароль минимум 6 символов');
    return;
  }
  if (password !== repeatPassword) {
    showAlert(resetPasswordErrorId, 'Пароли не совпадают');
    return;
  }

  try {
    await api('/api/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
    showAlert(resetPasswordSuccessId, 'Пароль успешно обновлён');
    setTimeout(() => {
      window.location.href = '/login';
    }, 1400);
  } catch (err) {
    showAlert(resetPasswordErrorId, err.message || 'Не удалось обновить пароль');
  }
});
