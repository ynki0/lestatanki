function setupDemoLightbox() {
  const lightbox = document.getElementById('demoLightbox');
  const backdrop = document.getElementById('demoLightboxBackdrop');
  const closeButton = document.getElementById('demoLightboxClose');
  const image = document.getElementById('demoLightboxImage');
  const grid = document.getElementById('demoGalleryGrid');

  if (!lightbox || !backdrop || !closeButton || !image || !grid) return;

  const closeLightbox = () => {
    lightbox.classList.add('hidden');
    lightbox.setAttribute('aria-hidden', 'true');
    image.src = '';
    image.alt = '';
    document.body.style.overflow = '';
  };

  const openLightbox = (src, alt) => {
    image.src = src;
    image.alt = alt || 'Фотография из галереи';
    lightbox.classList.remove('hidden');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  grid.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-demo-image]');
    if (!trigger) return;
    event.preventDefault();
    openLightbox(trigger.dataset.demoImage || '', trigger.dataset.demoTitle || '');
  });

  backdrop.addEventListener('click', closeLightbox);
  closeButton.addEventListener('click', closeLightbox);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.classList.contains('hidden')) {
      closeLightbox();
    }
  });
}

async function loadDemoGallery() {
  const grid = document.getElementById('demoGalleryGrid');
  const empty = document.getElementById('demoGalleryEmpty');

  if (!grid || !empty) return;

  try {
    const response = await fetch('/api/gallery', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Failed to load gallery');

    const data = await response.json();
    const images = Array.isArray(data?.images) ? data.images : [];

    if (images.length === 0) {
      empty.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = images.map((image, index) => {
      const title = image.title || `Работа ${index + 1}`;

      return `
        <article class="demo-gallery-card">
          <button class="demo-gallery-image-wrap" type="button" data-demo-image="${image.url}" data-demo-title="${title}" aria-label="Открыть изображение ${title}">
            <img class="demo-gallery-image" src="${image.url}" alt="${title}">
          </button>
        </article>
      `;
    }).join('');
  } catch (error) {
    empty.classList.remove('hidden');
    console.error(error);
  } finally {
    if (window.lucide) window.lucide.createIcons();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupDemoLightbox();
  loadDemoGallery();
});